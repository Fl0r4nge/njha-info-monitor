/**
 * 平台数据采集。
 *
 * 组织方式按《工信平台接口与数据盘点》第 6 节的建议：
 * 先拿列表，再按需取阶段详情，审核记录单独调，避免无谓抓取。
 *
 * 关键设计：**任何单个接口失败都不能让整次采集失败**。平台字段名与可选模块
 * 都还没用真实返回体验证过，采集器必须是"能拿多少拿多少 + 明确记录拿不到什么"。
 */

/** 包一层：接口出错时记进 warnings 而不是抛出，保证整体降级可用 */
async function safeCall(warnings, label, fn) {
  try {
    return await fn();
  } catch (error) {
    warnings.push({ label, message: error.message || String(error) });
    return null;
  }
}

/** 从任意返回结构里尽量取出"列表" —— 平台各接口的分页壳子不统一 */
export function pickList(payload) {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  for (const key of ['records', 'list', 'rows', 'content', 'data', 'items', 'result']) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = pickList(value);
      if (nested.length > 0) return nested;
    }
  }
  return [];
}

/** 从对象里按多个候选键名取第一个有值的（平台字段名未验证，必须容错） */
export function pickField(obj, candidates) {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of candidates) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return undefined;
}

/** 企业档案：基础信息、转型需求、改造情况（含改造前成效）、改造后成效 */
export async function collectArchive(api) {
  const warnings = [];
  const raw = {};

  raw.basic = await safeCall(warnings, '企业档案基础信息', () => api.get('archiveBasic'));
  raw.demand = await safeCall(warnings, '数字化转型需求', () => api.get('archiveDemand'));
  raw.transInfo = await safeCall(warnings, '改造情况与改造前成效', () => api.get('archiveTransInfo'));
  raw.transResult = await safeCall(warnings, '改造后成效', () => api.get('archiveTransResult'));
  raw.digitalData = await safeCall(warnings, '数字化评测数据', () => api.get('digitalData'));

  return { data: raw, raw, warnings };
}

/** 试点企业申报：列表 + 每个批次的详情与审核记录 */
export async function collectApply(api, { maxBatches = 5 } = {}) {
  const warnings = [];
  const listPayload = await safeCall(warnings, '申报列表', () => api.get('applyList'));
  const list = pickList(listPayload);

  const details = [];
  const auditRecords = [];
  for (const item of list.slice(0, maxBatches)) {
    const batch = pickField(item, ['applyBatch', 'batch', 'batchNo', 'applyBatchNo', 'id']);
    const detail = await safeCall(warnings, `申报详情(批次 ${batch ?? '未知'})`, () =>
      api.post('entInfoDetails', batch ? { applyBatch: batch } : {}));
    if (detail) details.push({ batch, detail });

    if (batch) {
      const audit = await safeCall(warnings, `申报审核记录(批次 ${batch})`, () =>
        api.get('applyAuditRecord', { pathParams: { batch } }));
      if (audit) auditRecords.push({ batch, audit });
    }
  }

  if (list.length === 0) {
    warnings.push({ label: '申报列表', message: '返回体里没识别出列表结构，请对照 raw-responses.json 校正 pickList' });
  }

  return {
    data: { list, details, auditRecords },
    raw: { listPayload },
    warnings,
  };
}

/**
 * 改造项目：列表 → 各阶段详情 → 各阶段审核记录。
 * 阶段编号未在盘点文档中给出确切取值，先按项目自带的阶段字段取，取不到时用 1..6 兜底探测。
 */
export async function collectProjects(api, { stageFallback = [1, 2, 3, 4, 5, 6], maxProjects = 5 } = {}) {
  const warnings = [];
  const pagePayload = await safeCall(warnings, '改造项目列表', () =>
    api.post('projectPage', { pageNum: 1, pageSize: 20 }));
  const projects = pickList(pagePayload);

  const stageDetails = [];
  const auditRecords = [];

  for (const project of projects.slice(0, maxProjects)) {
    const processId = pickField(project, ['processId', 'pmpProcessId', 'id', 'projectId']);
    const workflowId = pickField(project, ['workflowId', 'flowId', 'processInstanceId']);
    if (!processId) {
      warnings.push({ label: '项目阶段详情', message: '项目记录里没识别出 processId，跳过阶段详情' });
      continue;
    }
    const currentStage = pickField(project, ['stage', 'step', 'currentStage', 'processStage']);
    const stages = currentStage ? [currentStage] : stageFallback;

    for (const stage of stages) {
      const detail = await safeCall(warnings, `阶段详情(${processId}/${stage})`, () =>
        api.get('projectStageDetail', { pathParams: { processId, stage } }));
      if (detail) stageDetails.push({ processId, stage, detail });

      if (workflowId) {
        const audit = await safeCall(warnings, `阶段审核记录(${workflowId}/${stage})`, () =>
          api.get('workflowAudit', { pathParams: { workflowId, stage } }));
        if (audit) auditRecords.push({ workflowId, stage, audit });
      }
    }
  }

  return {
    data: { projects, stageDetails, auditRecords },
    raw: { pagePayload },
    warnings,
  };
}

/** 服务商备案（合同、承诺函等附件在这里） */
export async function collectProviderFiling(api, { maxItems = 5 } = {}) {
  const warnings = [];
  const pagePayload = await safeCall(warnings, '服务商备案列表', () =>
    api.post('providerFilingPage', { pageNum: 1, pageSize: 20 }));
  const list = pickList(pagePayload);

  const details = [];
  for (const item of list.slice(0, maxItems)) {
    const id = pickField(item, ['filingDeclareId', 'id', 'declareId']);
    if (!id) continue;
    const detail = await safeCall(warnings, `服务商备案详情(${id})`, () =>
      api.get('providerFilingDetail', { query: { filingDeclareId: id } }));
    if (detail) details.push({ id, detail });
  }

  const selected = await safeCall(warnings, '已选定服务商', () =>
    api.get('selectedProvider', { query: { page: 1, size: 20 } }));

  return { data: { list, details, selected }, raw: { pagePayload }, warnings };
}

/** 一次跑完全部采集 */
export async function collectAll(api, options = {}) {
  const archive = await collectArchive(api);
  const apply = await collectApply(api, options);
  const projects = await collectProjects(api, options);
  const providerFiling = await collectProviderFiling(api, options);

  return {
    collectedAt: new Date().toISOString(),
    authMode: api.authMode,
    archive: archive.data,
    apply: apply.data,
    projects: projects.data,
    providerFiling: providerFiling.data,
    warnings: [
      ...archive.warnings,
      ...apply.warnings,
      ...projects.warnings,
      ...providerFiling.warnings,
    ],
  };
}
