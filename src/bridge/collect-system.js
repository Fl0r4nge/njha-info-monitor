/**
 * 佐证材料收集系统客户端（本系统 = 妙搭上的那套收集系统）。
 *
 * 三个必须照抄的既有结论（都是 2026-08-19 线上实测得来的，别自己另发明）：
 *  1. 托管网关单次请求体上限 12MB，超限**返回 HTTP 200 + 错误 JSON**，不是 413。
 *     所以 >11.5MB 必须分片，且不能只看状态码判成功。
 *  2. 上传成功与否以"回读清单能否查到这个文件"为准。
 *  3. 平台 CSRF 中间件只要求 cookie 与请求头里的 token 一致，不校验具体值
 *     （pull_materials.py 就是这么过的）。
 */

import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';

export const COLLECT_SINGLE_UPLOAD_LIMIT = 11.5 * 1024 * 1024;
export const COLLECT_CHUNK_BYTES = 8 * 1024 * 1024;
const CSRF_TOKEN = 'platform-bridge-client';

/** 纯函数：切出连续、不重叠、合起来正好覆盖整个文件的分片区间 */
export function planChunks(size, chunkBytes = COLLECT_CHUNK_BYTES) {
  const plan = [];
  for (let start = 0, index = 0; start < size; start += chunkBytes, index += 1) {
    plan.push({ index, start, end: Math.min(start + chunkBytes, size) });
  }
  return plan;
}

/** 上传类返回体必须带文件 id，否则就是被网关吞了的"假成功" */
export function assertUploadResult(status, body, fileName) {
  if (body && typeof body === 'object' && typeof body.id === 'string') return body;
  const msg = body && typeof body === 'object' && typeof body.msg === 'string' ? body.msg : '';
  if (/exceeds the maximum limit/i.test(msg)) {
    throw new Error(`「${fileName}」被平台网关拦截：${msg}`);
  }
  throw new Error(
    `「${fileName}」上传未生效（HTTP ${status}，返回体没有文件 id${msg ? `：${msg}` : ''}），文件未保存`,
  );
}

export function createCollectClient({ baseUrl, slug, accessCode, adminKey, fetchImpl = fetch }) {
  if (!baseUrl) throw new Error('缺少收集系统 baseUrl（形如 https://xxx.feishuapp.com/app/app_xxx）');
  const root = baseUrl.replace(/\/$/, '');

  const baseHeaders = (extra = {}) => ({
    Cookie: `suda-csrf-token=${CSRF_TOKEN}`,
    'x-suda-csrf-token': CSRF_TOKEN,
    ...(accessCode ? { 'X-Access-Code': accessCode } : {}),
    ...(adminKey ? { 'X-Admin-Key': adminKey } : {}),
    ...extra,
  });

  async function callJson(path, { method = 'GET', body, headers = {} } = {}) {
    const res = await fetchImpl(`${root}${path}`, {
      method,
      headers: baseHeaders({
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const detail = parsed?.error?.message || (typeof parsed === 'string' ? parsed.slice(0, 200) : '');
      throw new Error(`[收集系统 ${method} ${path}] HTTP ${res.status}${detail ? `：${detail}` : ''}`);
    }
    return { status: res.status, body: parsed };
  }

  async function postForm(path, form) {
    const res = await fetchImpl(`${root}${path}`, {
      method: 'POST',
      headers: baseHeaders(),
      body: form,
    });
    const text = await res.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed, ok: res.ok };
  }

  const client = {
    async getChecklist() {
      const { body } = await callJson(`/api/collect/${slug}/checklist`);
      return body;
    },

    async saveResponse(itemKey, value) {
      const { body } = await callJson(`/api/collect/${slug}/response/${itemKey}`, {
        method: 'PUT',
        body: { value },
      });
      return body;
    },

    /** 上传文件：自动选择直传或分片，最后回读清单确认落库 */
    async uploadFile(itemKey, filePath, { stage = 'final', fileName } = {}) {
      const buffer = await readFile(filePath);
      const name = fileName || basename(filePath);
      if (buffer.length === 0) throw new Error(`「${name}」是空文件`);

      const saved = buffer.length > COLLECT_SINGLE_UPLOAD_LIMIT
        ? await client.uploadInChunks(itemKey, buffer, name, stage)
        : await client.uploadSingle(itemKey, buffer, name, stage);

      // 防假成功：回读清单确认文件真的挂在该条目下
      const checklist = await client.getChecklist();
      const landed = checklist?.items
        ?.find((item) => item.itemKey === itemKey)
        ?.files?.some((file) => file.id === saved.id);
      if (!landed) {
        throw new Error(`「${name}」上传后在 ${itemKey} 条目下查不到，判定未保存`);
      }
      return saved;
    },

    async uploadSingle(itemKey, buffer, name, stage) {
      const form = new FormData();
      form.append('file', new Blob([buffer]), name);
      form.append('stage', stage);
      const { status, body } = await postForm(`/api/collect/${slug}/upload/${itemKey}`, form);
      return assertUploadResult(status, body, name);
    },

    async uploadInChunks(itemKey, buffer, name, stage) {
      const uploadKey = randomUUID();
      const plan = planChunks(buffer.length);
      try {
        for (const chunk of plan) {
          const form = new FormData();
          form.append('file', new Blob([buffer.subarray(chunk.start, chunk.end)]), name);
          form.append('uploadKey', uploadKey);
          form.append('chunkIndex', String(chunk.index));
          const { status, body } = await postForm(`/api/collect/${slug}/chunk/${itemKey}`, form);
          if (!body || typeof body !== 'object' || body.ok !== true) {
            throw new Error(
              `「${name}」第 ${chunk.index + 1}/${plan.length} 片未被接收（HTTP ${status}）`,
            );
          }
        }
        const { status, body } = await callJson(`/api/collect/${slug}/chunk/${itemKey}/finish`, {
          method: 'POST',
          body: {
            uploadKey,
            total: plan.length,
            fileName: name,
            mimeType: 'application/octet-stream',
            stage,
          },
        });
        return assertUploadResult(status, body, name);
      } catch (error) {
        // 清掉服务端残片，重传时不会撞上上一次的半成品
        await callJson(`/api/collect/${slug}/chunk/${uploadKey}`, { method: 'DELETE' })
          .catch(() => undefined);
        throw error;
      }
    },

    /** 管理侧：拉取整个项目的 manifest（含所有文件下载地址） */
    async getManifest(projectIdOrSlug) {
      if (!adminKey) throw new Error('getManifest 需要管理密钥 adminKey');
      const { body } = await callJson(`/api/export/${projectIdOrSlug}/manifest`);
      return body;
    },

    /** 下载本系统里的某个文件（用于反向推送到平台） */
    async downloadUpload(uploadId) {
      const res = await fetchImpl(
        `${root}/api/collect/${slug}/upload/${uploadId}/download?code=${encodeURIComponent(accessCode ?? '')}`,
        { headers: baseHeaders() },
      );
      if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}（uploadId=${uploadId}）`);
      return Buffer.from(await res.arrayBuffer());
    },
  };

  return client;
}
