/**
 * 佐证材料收集系统 → 一体化平台的出站计划。
 *
 * 收集系统里的 A 类答案多为人工可读的组合文本，平台正式接口则要求拆分后的原始字段；
 * 在没有真实返回体字段定义前，不猜字段名、不自动提交。本模块负责把可用值和最终版附件
 * 分组、下载到本地待办包，后续可在平台页面预填并由人工确认提交。
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { safeFileName } from '../platform/attachments.js';

export const COLLECT_VALUE_TARGETS = {
  A1: '企业档案 / 企业基本信息',
  A2: '企业档案 / 企业基本信息',
  A3: '企业档案 / 企业基本信息',
  A4: '企业档案 / 企业基本信息',
  A5: '企业档案 / 企业基本信息',
  A6: '改造项目 / 项目备案',
  A7: '企业档案 / 数字化改造情况',
  A8: '企业档案 / 数字化改造情况',
  A10: '企业档案 / 企业基本信息',
  A11: '企业档案 / 企业基本信息',
  A12: '企业档案 / 企业基本信息',
  A13: '企业档案 / 企业基本信息',
  A14: '企业档案 / 企业基本信息',
  A15: '企业档案 / 企业基本信息',
  B0: '企业档案 / 改造前成效',
  B1: '数字化水平评测',
  B2: '数字化水平评测',
};

export const COLLECT_FILE_TARGETS = {
  C5: '改造项目 / 项目备案 / 数字化改造合同',
  C6: '企业档案 / 改造成效 / 发票与付款凭证',
  C7: '申请验收 / 投入清单明细表',
  E5: '改造项目 / 项目备案或申请验收',
  E6: '改造项目 / 项目备案 / 申报资料真实性声明',
  H1: '申请验收 / 改造前自评测报告',
  H2: '申请验收 / 改造后自评测报告',
  H3: '申请奖补资金 / 数字化改造备案表',
};

function flattenManifest(manifest) {
  const items = [];
  for (const category of manifest?.categories ?? []) {
    for (const item of category.items ?? []) {
      items.push({ ...item, category_key: category.key, category_name: category.name });
    }
  }
  return items;
}

function hasValue(value) {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function buildPlatformExportPlan(manifest) {
  const values = [];
  const files = [];
  const skipped = [];

  for (const item of flattenManifest(manifest)) {
    const itemKey = item.item_key;
    if (itemKey === 'A9') {
      if (hasValue(item.text_value)) {
        skipped.push({
          itemKey,
          reason: 'A9 含业务系统账号密码，安全策略禁止自动转发到一体化平台',
        });
      }
      continue;
    }

    if (hasValue(item.text_value)) {
      const target = COLLECT_VALUE_TARGETS[itemKey];
      if (target) {
        values.push({
          itemKey,
          label: item.name,
          value: item.text_value,
          target,
          action: 'prefill-and-review',
          note: '组合文本需按平台真实字段拆分；只预填，不自动提交',
        });
      } else {
        skipped.push({ itemKey, reason: '平台侧没有可靠的结构化字段落点' });
      }
    }

    for (const file of item.files ?? []) {
      if (file.stage !== 'final') {
        skipped.push({
          itemKey,
          fileName: file.file_name,
          reason: '暂用版文件不传正式申报平台',
        });
        continue;
      }
      const target = COLLECT_FILE_TARGETS[itemKey];
      if (!target) {
        skipped.push({
          itemKey,
          fileName: file.file_name,
          reason: '平台侧没有可靠的附件落点',
        });
        continue;
      }
      files.push({
        itemKey,
        label: item.name,
        uploadId: file.upload_id,
        fileName: file.file_name,
        size: file.size,
        mimeType: file.mime_type,
        downloadUrl: file.download_url,
        target,
        action: 'upload-and-review',
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    project: manifest?.project ?? null,
    values,
    files,
    skipped,
  };
}

export async function stagePlatformExport(client, plan, targetDir, { onProgress } = {}) {
  await mkdir(targetDir, { recursive: true });
  const staged = [];
  const usedNames = new Map();

  for (const [index, file] of plan.files.entries()) {
    const rawName = `${file.itemKey}-${file.fileName}`;
    let name = safeFileName(rawName, `${file.itemKey}-attachment-${index + 1}`);
    const count = usedNames.get(name) ?? 0;
    usedNames.set(name, count + 1);
    if (count > 0) {
      const dot = name.lastIndexOf('.');
      name = dot > 0
        ? `${name.slice(0, dot)}-${count + 1}${name.slice(dot)}`
        : `${name}-${count + 1}`;
    }

    const savedAs = join(targetDir, name);
    try {
      const buffer = await client.downloadManifestFile(file.downloadUrl);
      if (!buffer || buffer.length === 0) throw new Error('下载到 0 字节');
      await writeFile(savedAs, buffer);
      staged.push({ ...file, savedAs, downloadedSize: buffer.length, ok: true });
    } catch (error) {
      staged.push({ ...file, ok: false, error: error.message || String(error) });
    }
    onProgress?.(index + 1, plan.files.length, name);
  }
  return staged;
}
