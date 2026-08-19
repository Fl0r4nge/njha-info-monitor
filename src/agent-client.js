import { randomBytes } from 'node:crypto';

function trimBaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

async function parseResponse(response) {
  if (response.ok) {
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  const text = await response.text();
  let message = text || `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(text);
    message = parsed.message || parsed.error || message;
  } catch {
    // 非 JSON 错误体直接使用原文。
  }
  throw new Error(`佐证系统接口失败 (${response.status})：${message}`);
}

export function createAgentClient({ baseUrl, agentKey, csrfToken, fetchImpl = fetch }) {
  const base = trimBaseUrl(baseUrl);
  if (!base || !agentKey) throw new Error('缺少 COLLECT_AGENT_BASE_URL 或 COLLECT_AGENT_KEY');
  const csrf = csrfToken || randomBytes(18).toString('base64url');
  const csrfHeaders = {
    'X-Suda-Csrf-Token': csrf,
    Cookie: `suda-csrf-token=${csrf}`,
  };

  const requestHeaders = (extra = {}) => ({ ...csrfHeaders, ...extra });
  const request = (path, options = {}) => fetchImpl(`${base}${path}`, {
    ...options,
    headers: requestHeaders(options.headers),
  }).then(parseResponse);
  const runHeaders = (runToken, extra = {}) => ({
    'X-Platform-Run-Token': runToken,
    ...extra,
  });

  return {
    claim() {
      return request('/api/platform-agent/jobs/claim', {
        method: 'POST',
        headers: { 'X-Platform-Agent-Key': agentKey },
      });
    },

    importValues(runId, runToken, entries) {
      return request(`/api/platform-agent/runs/${runId}/import-values`, {
        method: 'POST',
        headers: runHeaders(runToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify({ entries }),
      });
    },

    importFile(runId, runToken, itemKey, fileName, buffer, mimeType) {
      const form = new FormData();
      form.append('file', new Blob([buffer], { type: mimeType || 'application/octet-stream' }), fileName);
      return request(`/api/platform-agent/runs/${runId}/import-file/${encodeURIComponent(itemKey)}`, {
        method: 'POST',
        headers: runHeaders(runToken),
        body: form,
      });
    },

    async downloadFile(path, runToken) {
      const response = await fetchImpl(`${base}${path}`, {
        headers: requestHeaders(runHeaders(runToken)),
      });
      if (!response.ok) await parseResponse(response);
      return Buffer.from(await response.arrayBuffer());
    },

    complete(runId, runToken, payload) {
      return request(`/api/platform-agent/runs/${runId}/complete`, {
        method: 'POST',
        headers: runHeaders(runToken, { 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });
    },
  };
}
