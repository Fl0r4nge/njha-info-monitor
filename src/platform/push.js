/**
 * 向平台写入（上传附件 / 提交表单）。
 *
 * ⚠️ 这是全项目风险最高的模块：写进去的是正式申报数据，错了会被退回甚至影响申报资格。
 * 设计目标是"不可能被误触发"：
 *   1. dryRun 默认 true，默认只打印将要发送的内容；
 *   2. 真发必须同时满足 dryRun === false 且 confirm === CONFIRM_TOKEN；
 *   3. 只允许调用白名单内的写接口；
 *   4. 失败不自动重试（重试可能造成重复提交）；
 *   5. 日志里的载荷做脱敏。
 *
 * 更稳妥的落地方式是 fill-form.js：把值填进平台页面但不点提交，人工确认后自己点。
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { PLATFORM_ENDPOINTS } from './api-client.js';

export const CONFIRM_TOKEN = 'I-UNDERSTAND';

/** 允许写入的端点白名单：不在这里的一律拒绝 */
export const WRITE_WHITELIST = new Set([
  'uploadFile',
  'submitArchiveBasic',
  'submitArchiveDemand',
  'submitArchiveTransInfo',
  'submitArchiveTransResult',
]);

const SENSITIVE_KEY_RE = /(idCard|creditCode|socialCredit|phone|mobile|tel|address|password|token|身份证|信用代码|电话|手机|地址)/i;

/** 载荷摘要：结构留着、敏感值抹掉、长文本截断，供人工确认与日志留痕 */
export function summarizePayload(payload, depth = 0) {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) {
    return payload.slice(0, 5).map((item) => summarizePayload(item, depth + 1));
  }
  if (typeof payload === 'object') {
    if (depth > 4) return '[层级过深已省略]';
    const out = {};
    for (const [key, value] of Object.entries(payload)) {
      out[key] = SENSITIVE_KEY_RE.test(key) ? '[已脱敏]' : summarizePayload(value, depth + 1);
    }
    return out;
  }
  if (typeof payload === 'string' && payload.length > 120) {
    return `${payload.slice(0, 120)}…(共 ${payload.length} 字)`;
  }
  return payload;
}

/** 判定是否真的执行写入。任何一个条件不满足都只演练。 */
export function shouldReallySend({ dryRun = true, confirm } = {}) {
  return dryRun === false && confirm === CONFIRM_TOKEN;
}

function assertWhitelisted(endpointKey) {
  const endpoint = PLATFORM_ENDPOINTS[endpointKey];
  if (!endpoint) throw new Error(`未知端点：${endpointKey}`);
  if (!WRITE_WHITELIST.has(endpointKey)) {
    throw new Error(
      `端点 ${endpointKey} 不在写入白名单内，拒绝调用。` +
      '（启动流程、删除附件、备案申报等接口后果不可逆，本工具不提供自动调用。）',
    );
  }
  return endpoint;
}

/** 提交结构化数据到平台 */
export async function submitToPlatform(api, endpointKey, payload, options = {}) {
  const endpoint = assertWhitelisted(endpointKey);
  const logger = options.logger ?? console;
  const summary = summarizePayload(payload);

  if (!shouldReallySend(options)) {
    logger.warn?.(
      `[演练] 未真正提交 ${endpointKey}（${endpoint.note}）。` +
      `真发需同时传 dryRun:false 与 confirm:'${CONFIRM_TOKEN}'。`,
    );
    return {
      dryRun: true,
      wouldSend: { method: endpoint.method, path: endpoint.path, payloadSummary: summary },
    };
  }

  logger.warn?.(`[真实提交] ${endpointKey} → ${endpoint.path}`);
  const result = await api.post(endpointKey, payload, { label: `push:${endpointKey}` });
  return { dryRun: false, endpoint: endpointKey, result };
}

/** 上传附件到平台 */
export async function uploadFileToPlatform(api, filePath, options = {}) {
  const endpoint = assertWhitelisted('uploadFile');
  const logger = options.logger ?? console;
  const fileName = options.fileName || basename(filePath);

  if (!shouldReallySend(options)) {
    logger.warn?.(`[演练] 未真正上传「${fileName}」到平台。真发需 dryRun:false + confirm:'${CONFIRM_TOKEN}'。`);
    return { dryRun: true, wouldSend: { method: endpoint.method, path: endpoint.path, fileName } };
  }

  const buffer = await readFile(filePath);
  if (buffer.length === 0) throw new Error(`「${fileName}」是空文件，拒绝上传`);

  logger.warn?.(`[真实上传] ${fileName} (${(buffer.length / 1024 / 1024).toFixed(1)}MB) → ${endpoint.path}`);
  const result = await api.uploadMultipart(endpoint.path, {
    fileName,
    buffer,
    extraFields: options.extraFields ?? {},
  });
  return { dryRun: false, fileName, result };
}
