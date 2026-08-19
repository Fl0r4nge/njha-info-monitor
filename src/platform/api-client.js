/**
 * 工信平台 JSON 接口客户端。
 *
 * 为什么不继续用 DOM 抓取：平台是 Vue SPA，数据全部走 /api/ad/api 与 /api/sa/api 的
 * JSON 接口（见《工信平台接口与数据盘点》第 2 节，那张表里的路径都是实际触发验证过的）。
 * 选择器随平台改版就断，接口稳得多。
 *
 * 鉴权方式未知的防御：登录态由 Playwright 的 storageState 复用，cookie 一定带得上；
 * 但平台可能另外要求一个 token 请求头。这里的做法是——先只带 cookie 试，
 * 遇到 401/403 再依次尝试从 localStorage 探测到的 token 候选头，成功后记住那一个。
 * 不猜、不写死，靠实际响应挑出对的那条。
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

/** 平台端点登记表。danger:true 表示写入类接口，任何调用都必须经 push.js 的守卫。 */
export const PLATFORM_ENDPOINTS = {
  // ---- 试点企业申报 ----
  applyList: { method: 'GET', path: '/api/ad/api/getEnterpriseApplyInfo', note: '申报列表、批次、审核状态、是否入库' },
  applyStatus: { method: 'GET', path: '/api/ad/api/judgeEnterpriseApplyStatus', note: '当前申报状态判定' },
  entInfoDetails: { method: 'POST', path: '/api/ad/api/select/entInfoDetails', note: '企业基本资料与申报详情，可带 applyBatch' },
  applyAuditRecord: { method: 'GET', path: '/api/ad/api/getEnterpriseAuditRecord/{batch}', note: '申报审核记录与备注' },

  // ---- 服务商备案 ----
  providerFilingPage: { method: 'POST', path: '/api/ad/api/serviceProviderFindFilingDeclarePage', note: '服务商备案分页列表' },
  providerFilingDetail: { method: 'GET', path: '/api/ad/api/cityManagerFindFilingDeclareDetail', note: '服务商备案详情，query: filingDeclareId' },
  selectedProvider: { method: 'GET', path: '/api/ad/api/findSelectedProvider', note: '当前企业选定的服务商，query: page/size' },

  // ---- 改造项目管理 ----
  projectPage: { method: 'POST', path: '/api/ad/api/enterpriseBasic/pmpProcessPage', note: '项目列表、阶段、流程状态、服务商与起止时间' },
  projectStageDetail: { method: 'GET', path: '/api/ad/api/pmpProcess/foundProject/{processId}/{stage}', note: '指定项目与阶段的业务详情及文件清单' },
  workflowAudit: { method: 'GET', path: '/api/ad/api/workflow/audit/{workflowId}/{stage}', note: '指定流程阶段的审核记录' },
  workflowProcessList: { method: 'GET', path: '/flow/workflow/process/list', note: '按流程名称查询工作流定义' },

  // ---- 企业档案 ----
  archiveBasic: { method: 'GET', path: '/api/ad/api/entArchive/getOnePhaseEnterpriseArchive', note: '企业档案一阶段基础信息' },
  archiveDemand: { method: 'GET', path: '/api/ad/api/entArchive/getOnePhaseArchiveDemand', note: '数字化转型需求' },
  archiveTransInfo: { method: 'GET', path: '/api/ad/api/entArchive/getOnePhaseArchiveTransInfo', note: '改造情况、投入与改造前成效' },
  archiveTransResult: { method: 'GET', path: '/api/ad/api/entArchive/getTwoPhaseArchiveTransResult', note: '改造后成效、文件与服务商评价' },
  digitalData: { method: 'GET', path: '/api/ad/api/enterprise/digital/getDigitalData', note: '数字化评测数据' },

  // ---- 字典与基础数据 ----
  industries: { method: 'POST', path: '/api/sa/api/industry/getAllIndustry', note: '行业分类' },
  productTypes: { method: 'GET', path: '/api/ad/api/productType/getAllProductType', note: '产品分类' },
  digitalizeTree: { method: 'GET', path: '/api/sa/api/findDigitalizeThreeTree', note: '数字化转型需求三级树' },
  dictProductService: { method: 'GET', path: '/api/sa/api/dictData/type/product_service', note: '产品及服务类别字典' },
  dictYsScene: { method: 'GET', path: '/api/sa/api/dictData/type/ys_scene', note: '约束性应用场景字典' },
  dictZdScene: { method: 'GET', path: '/api/sa/api/dictData/type/zd_scene', note: '指导性应用场景字典' },
  provinceArea: { method: 'POST', path: '/api/ad/api/getProvinceMessage', note: '省市区级联' },
  njArea: { method: 'POST', path: '/api/ad/api/getNjAreaMessage', note: '南京市区级行政区' },

  // ---- 写入类：后果不可逆，只能经 push.js 调用 ----
  uploadFile: { method: 'POST', path: '/api/ad/api/uploadFile', danger: true, note: '上传业务附件：会在平台上真实新增材料' },
  clearFile: { method: 'POST', path: '/api/ad/api/clearFile', danger: true, note: '删除平台上已上传的附件，不可恢复' },
  submitArchiveBasic: { method: 'POST', path: '/api/ad/api/entArchive/onePhaseSubmitEnterpriseArchive', danger: true, note: '提交企业档案基础信息' },
  submitArchiveDemand: { method: 'POST', path: '/api/ad/api/entArchive/onePhaseSubmitArchiveDemand', danger: true, note: '提交数字化转型需求' },
  submitArchiveTransInfo: { method: 'POST', path: '/api/ad/api/entArchive/onePhaseSubmitArchiveTransInfo', danger: true, note: '提交改造情况与改造前成效' },
  submitArchiveTransResult: { method: 'POST', path: '/api/ad/api/entArchive/twoPhaseSubmitArchiveTransResult', danger: true, note: '提交改造后成效，属正式申报数据' },
  addFilingDeclare: { method: 'POST', path: '/api/ad/api/addFilingDeclare', danger: true, note: '新增备案申报' },
  updateFilingDeclare: { method: 'POST', path: '/api/ad/api/updateFilingDeclare', danger: true, note: '修改备案申报' },
  submitSelectProvider: { method: 'POST', path: '/api/ad/api/enterpriseSubmitSelectProvider', danger: true, note: '提交选定服务商' },
  startWorkflow: { method: 'POST', path: '/api/ad/workflow/process/start/{flowId}', danger: true, note: '启动业务流程，会推进正式申报流程' },
  exportProjectAudit: { method: 'POST', path: '/api/ad/api/exportProjectAudit', danger: true, note: '生成奖补申请承诺函，会在平台产生记录' },
};

/** 平台返回体里代表成功的 code 取值。平台各接口并不统一，这里放宽兼容。 */
const SUCCESS_CODES = new Set([0, 200, '0', '200', 'success', 'SUCCESS', true]);
const AUTH_FAILURE_CODES = new Set([401, 403, '401', '403']);

function isAuthFailureEnvelope(body) {
  return Boolean(body && typeof body === 'object' && AUTH_FAILURE_CODES.has(body.code));
}

/** 解析 {code,msg,data} 信封；平台也有直接返回数组/对象的接口，两种都要能拿到载荷。 */
export function parseEnvelope(body, contextLabel = '') {
  if (body === null || body === undefined) {
    throw new Error(`${contextLabel} 返回体为空`);
  }
  if (typeof body !== 'object') {
    // 有的接口直接返回字符串（如导出返回文件名），原样交给调用方
    return body;
  }
  if (Array.isArray(body)) return body;

  const hasEnvelope = 'code' in body || 'msg' in body || 'message' in body;
  if (!hasEnvelope) return body;

  const code = body.code;
  const message = body.msg || body.message || '';
  if (code !== undefined && !SUCCESS_CODES.has(code)) {
    throw new Error(`${contextLabel} 平台返回失败：code=${code} msg=${message || '(无)'}`);
  }
  // 有信封但没有 data 字段时，把整个 body 交回去，避免"猜错字段名就丢数据"
  return 'data' in body ? body.data : body;
}

/** 把 {a} 形式的路径参数替换掉；缺参数直接报错，避免请求到 /foundProject/undefined/1 */
export function fillPathParams(path, pathParams = {}) {
  return path.replace(/\{(\w+)\}/g, (_, name) => {
    const value = pathParams[name];
    if (value === undefined || value === null || value === '') {
      throw new Error(`路径参数缺失：${name}（模板 ${path}）`);
    }
    return encodeURIComponent(String(value));
  });
}

export function buildQuery(query = {}) {
  const entries = Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return `?${entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}`;
}

/** 从 localStorage 快照里挑出可能是登录令牌的值，生成候选请求头 */
export function buildTokenHeaderCandidates(storage = {}) {
  const candidates = [];
  for (const [key, rawValue] of Object.entries(storage)) {
    if (!/token|auth|jwt/i.test(key)) continue;
    let value = rawValue;
    if (typeof value !== 'string') continue;
    // 有的前端把 token 包在 JSON 里存
    if (value.startsWith('{') || value.startsWith('"')) {
      try {
        const parsed = JSON.parse(value);
        value = typeof parsed === 'string'
          ? parsed
          : (parsed.token || parsed.accessToken || parsed.access_token || '');
      } catch {
        // 解析不了就用原值
      }
    }
    if (typeof value !== 'string' || value.length < 16) continue;
    candidates.push({ source: key, headers: { Authorization: value } });
    candidates.push({ source: `${key}(Bearer)`, headers: { Authorization: `Bearer ${value}` } });
    candidates.push({ source: `${key}(token)`, headers: { token: value } });
    candidates.push({ source: `${key}(X-Token)`, headers: { 'X-Token': value } });
  }
  return candidates;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createApiClient({ page, context, baseUrl, logger = console, minIntervalMs = 800 }) {
  if (!page) throw new Error('createApiClient 需要 page');
  if (!baseUrl) throw new Error('createApiClient 需要 baseUrl');

  const rawResponses = [];
  let lastRequestAt = 0;
  let tokenCandidates = null;
  let workingAuth = { source: 'cookie-only', headers: {} };

  async function throttle() {
    const wait = minIntervalMs - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
  }

  async function loadTokenCandidates() {
    if (tokenCandidates) return tokenCandidates;
    const storage = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        out[key] = localStorage.getItem(key);
      }
      return out;
    });
    tokenCandidates = buildTokenHeaderCandidates(storage);
    logger.log?.(`[api] localStorage 中发现 ${tokenCandidates.length} 个候选鉴权头`);
    return tokenCandidates;
  }

  /** 在页面上下文里发同源请求：cookie 自动带上，也避开跨域限制 */
  async function rawRequest(url, { method, headers, body }) {
    return page.evaluate(async ({ url, method, headers, body }) => {
      const init = { method, headers: { ...headers }, credentials: 'include' };
      if (body !== undefined && body !== null) {
        init.headers['Content-Type'] = 'application/json;charset=UTF-8';
        init.body = JSON.stringify(body);
      }
      try {
        const res = await fetch(url, init);
        const text = await res.text();
        return { ok: res.ok, status: res.status, text };
      } catch (error) {
        return { ok: false, status: 0, text: '', networkError: String(error) };
      }
    }, { url, method, headers, body });
  }

  async function request(target, { query, pathParams, body, label } = {}) {
    const endpoint = typeof target === 'string' && PLATFORM_ENDPOINTS[target]
      ? PLATFORM_ENDPOINTS[target]
      : { method: body === undefined ? 'GET' : 'POST', path: String(target) };
    const key = typeof target === 'string' ? target : 'custom';
    const path = fillPathParams(endpoint.path, pathParams) + buildQuery(query);
    const url = `${baseUrl}${path}`;
    const contextLabel = `[${label || key} ${endpoint.method} ${path}]`;

    // 依次尝试：当前已知可用的鉴权方式 → localStorage 探测出的候选
    const attempts = [workingAuth];
    for (const candidate of await loadTokenCandidates()) attempts.push(candidate);

    let lastError = null;
    for (const auth of attempts) {
      for (let retry = 0; retry <= 2; retry += 1) {
        await throttle();
        const res = await rawRequest(url, {
          method: endpoint.method,
          headers: auth.headers,
          body,
        });

        if (res.networkError) {
          lastError = new Error(`${contextLabel} 网络错误：${res.networkError}`);
          await sleep(500 * (retry + 1));
          continue;
        }
        if (res.status >= 500) {
          lastError = new Error(`${contextLabel} 服务端错误 HTTP ${res.status}`);
          await sleep(500 * (retry + 1));
          continue;
        }
        if (res.status === 401 || res.status === 403) {
          lastError = new Error(`${contextLabel} 鉴权失败 HTTP ${res.status}（鉴权方式：${auth.source}）`);
          break; // 换下一种鉴权方式
        }

        let parsedBody;
        try {
          parsedBody = res.text ? JSON.parse(res.text) : null;
        } catch {
          parsedBody = res.text;
        }
        rawResponses.push({
          key,
          path,
          at: new Date().toISOString(),
          status: res.status,
          auth: auth.source,
          body: parsedBody,
        });

        // 此平台会用 HTTP 200 包裹业务层 code=401/403。它与真正的 HTTP
        // 401/403 含义相同：当前鉴权头不可用，应继续尝试 localStorage 候选令牌。
        if (isAuthFailureEnvelope(parsedBody)) {
          const message = parsedBody.msg || parsedBody.message || '令牌失效';
          lastError = new Error(`${contextLabel} 鉴权失败：code=${parsedBody.code} msg=${message}（鉴权方式：${auth.source}）`);
          break;
        }

        if (auth.source !== workingAuth.source) {
          logger.log?.(`[api] 鉴权方式切换为 ${auth.source}`);
          workingAuth = auth;
        }
        return parseEnvelope(parsedBody, contextLabel);
      }
    }
    throw lastError || new Error(`${contextLabel} 请求失败`);
  }

  return {
    get: (target, options = {}) => request(target, options),
    post: (target, body = {}, options = {}) => request(target, { ...options, body }),
    request,
    /** 下载文件：走 context.request，能拿到二进制且共享 cookie */
    async download(url, { headers = {} } = {}) {
      await throttle();
      const absolute = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
      const res = await context.request.get(absolute, {
        headers: { ...workingAuth.headers, ...headers },
      });
      if (!res.ok()) {
        throw new Error(`下载失败 HTTP ${res.status()}：${absolute}`);
      }
      return Buffer.from(await res.body());
    },
    /**
     * multipart 上传（只给 push.js 用，调用方负责守卫）。
     * 走 context.request 而不是页面 fetch：能直接传二进制，且共享登录 cookie。
     */
    async uploadMultipart(path, { fileName, buffer, fieldName = 'file', extraFields = {} }) {
      await throttle();
      const absolute = `${baseUrl}${path}`;
      const multipart = {
        [fieldName]: { name: fileName, mimeType: 'application/octet-stream', buffer },
        ...extraFields,
      };
      const res = await context.request.post(absolute, {
        headers: { ...workingAuth.headers },
        multipart,
      });
      const text = await res.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      rawResponses.push({
        key: 'uploadMultipart',
        path,
        at: new Date().toISOString(),
        status: res.status(),
        auth: workingAuth.source,
        body: parsed,
      });
      if (!res.ok()) {
        throw new Error(`[上传 ${path}] HTTP ${res.status()}：${String(text).slice(0, 200)}`);
      }
      return parseEnvelope(parsed, `[上传 ${path}]`);
    },
    get rawResponses() {
      return rawResponses;
    },
    /** 首次跑通后务必导出一份，用真实字段名校正 bridge/field-map.js 里的候选路径 */
    async dumpRawResponses(targetPath) {
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, JSON.stringify(rawResponses, null, 2), 'utf8');
      return targetPath;
    },
    get authMode() {
      return workingAuth.source;
    },
  };
}
