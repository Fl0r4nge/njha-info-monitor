/**
 * 附件发现与下载。
 *
 * 平台各接口把文件表达成什么样并不统一（盘点文档只说明"详情里含附件"，没给字段名），
 * 所以这里用启发式递归扫描：键名像文件、值像路径或带扩展名，就当候选，
 * 并给出 confidence 供人工复核。宁可多报，也不要漏掉合同、发票这类关键材料。
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const FILE_KEY_RE = /(file|url|path|attach|annex|doc|材料|附件|文件|资料|证明|报告|凭证)/i;
const FILE_EXT_RE = /\.(pdf|docx?|xlsx?|jpe?g|png|zip|rar|ofd)(\?|$)/i;
const NAME_KEY_RE = /(name|fileName|originalName|title|文件名)/i;

/** 值看起来像不像一个可下载的地址或路径 */
function looksLikeFileRef(value) {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length < 4 || v.length > 500) return false;
  // 必须像个"位置"：带协议或路径分隔符。光有扩展名的裸文件名（如 合同.pdf）下载不了，
  // 把它当候选只会和真正的地址重复计数。
  const hasLocation = /^https?:\/\//i.test(v) || v.includes('/');
  if (!hasLocation) return false;
  if (FILE_EXT_RE.test(v)) return true;
  return /(file|upload|attach|download|resource)/i.test(v);
}

/** 文件名安全化：去掉路径分隔与非法字符，防止写出到目标目录之外 */
export function safeFileName(name, fallback = 'attachment') {
  const base = String(name ?? '').split(/[\\/]/).pop() || '';
  // 只替换真正的非法字符：Windows 保留符号与控制字符。
  // 别用 [ -<] 这类区间写法，那会把数字和常用标点一起吃掉。
  const cleaned = base
    .replace(/[<>:"|?*\\]/g, '_')
    .replace(/[\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim();
  return cleaned || fallback;
}

/** 平台数据库中的 filePath 省略了统一网关的 /api 前缀。 */
export function normalizeAttachmentUrl(url) {
  const value = String(url || '').trim();
  if (/^https?:\/\//i.test(value) || value.startsWith('/api/')) return value;
  if (value.startsWith('api/')) return `/${value}`;
  if (/^\/?(?:ad|sa)\/upload\//i.test(value)) {
    return `/api/${value.replace(/^\/+/, '')}`;
  }
  return value;
}

/** 防止登录页或 SPA HTML 被按原扩展名写入并回灌为“PDF”。 */
export function assertDownloadedFile(buffer, fileName) {
  if (!buffer || buffer.length === 0) throw new Error('下载到 0 字节');
  const head = buffer.subarray(0, 16).toString('ascii').trimStart();
  if (/^<!DOCTYPE|^<html/i.test(head)) {
    throw new Error(`${fileName} 下载结果是 HTML 页面，不是有效附件`);
  }
  if (/\.pdf$/i.test(fileName) && !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error(`${fileName} 不是有效的 PDF 文件`);
  }
}

/**
 * 递归扫描任意 JSON，找出候选附件。
 * @returns {Array<{name, url, sourcePath, guessedFrom, confidence}>}
 */
export function findAttachments(payload, { sourceLabel = '' } = {}) {
  const found = [];
  const seen = new Set();

  const walk = (node, path) => {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`));
      return;
    }
    if (typeof node === 'object') {
      // 对象自身像一个文件条目：同时有名字和地址
      const nameValue = Object.entries(node).find(([k, v]) => NAME_KEY_RE.test(k) && typeof v === 'string');
      const urlEntry = Object.entries(node).find(([k, v]) => FILE_KEY_RE.test(k) && looksLikeFileRef(v));
      if (urlEntry) {
        const [urlKey, url] = urlEntry;
        const name = nameValue ? nameValue[1] : url;
        push({
          name: safeFileName(name),
          url,
          sourcePath: `${path}.${urlKey}`,
          guessedFrom: sourceLabel,
          confidence: nameValue ? 'high' : 'medium',
        });
      }
      for (const [key, value] of Object.entries(node)) walk(value, path ? `${path}.${key}` : key);
      return;
    }
    if (typeof node === 'string' && looksLikeFileRef(node)) {
      const key = path.split('.').pop() || '';
      if (FILE_KEY_RE.test(key) || FILE_EXT_RE.test(node)) {
        push({
          name: safeFileName(node),
          url: node,
          sourcePath: path,
          guessedFrom: sourceLabel,
          confidence: FILE_EXT_RE.test(node) ? 'medium' : 'low',
        });
      }
    }
  };

  const push = (item) => {
    const dedupeKey = item.url;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    found.push(item);
  };

  walk(payload, '');
  return found;
}

/** 下载附件到本地目录；单个失败不影响其余，全部结果都记账 */
export async function downloadAttachments(api, attachments, targetDir, { onProgress } = {}) {
  await mkdir(targetDir, { recursive: true });
  const results = [];
  const usedNames = new Map();

  for (const [index, attachment] of attachments.entries()) {
    let name = safeFileName(attachment.name, `attachment-${index + 1}`);
    const count = usedNames.get(name) ?? 0;
    usedNames.set(name, count + 1);
    if (count > 0) {
      const dot = name.lastIndexOf('.');
      name = dot > 0 ? `${name.slice(0, dot)}-${count + 1}${name.slice(dot)}` : `${name}-${count + 1}`;
    }

    const targetPath = join(targetDir, name);
    try {
      const buffer = await api.download(normalizeAttachmentUrl(attachment.url));
      assertDownloadedFile(buffer, name);
      await writeFile(targetPath, buffer);
      results.push({ ...attachment, savedAs: targetPath, size: buffer.length, ok: true });
    } catch (error) {
      results.push({ ...attachment, ok: false, error: error.message || String(error) });
    }
    onProgress?.(index + 1, attachments.length, name);
  }

  return results;
}
