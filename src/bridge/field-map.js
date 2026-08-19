/**
 * 平台字段 → 佐证材料收集系统条目（itemKey）的映射，以及回灌计划的生成。
 *
 * ⚠️ 关键前提：**平台接口返回体的字段名尚未用真实数据验证过**。
 * 盘点文档只写了"能拿到什么内容"，没有字段名。所以这里每条映射都给多个
 * candidatePaths（候选路径）和 confidence，取不到就记 note，绝不让"猜错一个字段名"
 * 变成整体失败。首次跑通 platform:collect 后，请用 data/raw-responses.json 里的
 * 真实字段名回来校正本文件，并把 confidence 提到 high。
 *
 * itemKey 取自 server/modules/materials/checklist-seed.ts，均为真实存在的条目：
 *   A1 企业全称与统一社会信用代码 / A2 企业地址、成立时间 / A3 联系人姓名与电话
 *   A4 主营产品与所属行业 / A5 近两年员工人数 / A6 项目名称、合同起止日期、服务商名称
 *   A7 数字化改造完成时间 / A8 本次合同改造范围清单 / A9 业务系统地址与账号密码
 *   A10 所属行政区 / A11 所属细分行业 / A12 企业性质 / A13 企业规模 / A14 统计口径
 *   A15 优质中小企业情况 / B0 改造前评测结果数据
 */

/** 按候选路径依次尝试取值，全部落空返回 undefined。路径支持 a.b.c 形式 */
export function extractByCandidates(source, candidatePaths = []) {
  for (const path of candidatePaths) {
    const value = path.split('.').reduce(
      (node, key) => (node && typeof node === 'object' ? node[key] : undefined),
      source,
    );
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/** A 类条目是纯文本填写，值形态为 { value: string } */
const asText = (v) => (typeof v === 'string' ? v.trim() : String(v));
const joinPresent = (values, separator) => values
  .filter((value) => value !== undefined && value !== null && value !== '')
  .join(separator);

export const PLATFORM_TO_ITEM = [
  {
    itemKey: 'A1',
    label: '企业全称与统一社会信用代码',
    source: 'archive.basic',
    fallbackSources: ['archive.digitalData', 'apply.details.0.detail'],
    candidatePaths: ['entName', 'enterpriseName', 'companyName', 'name', 'unitName'],
    extraPaths: ['creditCode', 'socialCreditCode', 'unifiedSocialCreditCode', 'uscc', 'socialUnitCreditCode'],
    confidence: 'medium',
    compose: (name, code) => joinPresent([name, code], '　'),
  },
  {
    itemKey: 'A2',
    label: '企业地址、成立时间',
    source: 'archive.basic',
    fallbackSources: ['archive.digitalData', 'apply.details.0.detail'],
    candidatePaths: ['registerAddress', 'address', 'regAddress', 'entAddress', 'unitAddress', 'productionAddress'],
    extraPaths: ['establishDate', 'setupDate', 'foundDate', 'establishTime'],
    confidence: 'medium',
    compose: (addr, date) => joinPresent([addr, date], '　成立于 '),
  },
  {
    itemKey: 'A3',
    label: '联系人姓名与电话',
    source: 'archive.basic',
    fallbackSources: ['archive.digitalData', 'apply.details.0.detail'],
    candidatePaths: ['contactName', 'linkman', 'contacts', 'contactPerson', 'unitLxr'],
    extraPaths: ['contactPhone', 'phone', 'mobile', 'linkPhone', 'unitCellphone'],
    confidence: 'medium',
    compose: (nm, phone) => joinPresent([nm, phone], ' '),
  },
  {
    itemKey: 'A4',
    label: '主营产品与所属行业',
    source: 'archive.basic',
    fallbackSources: ['archive.digitalData', 'apply.details.0.detail'],
    candidatePaths: ['mainProduct', 'mainProducts', 'product', 'majorProduct', 'basicInfo'],
    extraPaths: ['industry', 'industryName', 'trade'],
    confidence: 'low',
    compose: (product, industry) => joinPresent([product, industry], '　行业：'),
  },
  {
    itemKey: 'A5',
    label: '近两年员工人数',
    source: 'archive.basic',
    candidatePaths: ['employeeNum', 'staffNum', 'employeeCount', 'employees'],
    extraPaths: ['lastYearEmployeeNum', 'employeeNumLastYear', 'previousEmployeeCount'],
    confidence: 'low',
    compose: (current, previous) => joinPresent([current, previous], ' / '),
  },
  {
    itemKey: 'A6',
    label: '项目名称、合同起止日期、服务商名称',
    source: 'projects.projects.0',
    candidatePaths: ['projectName', 'name', 'pmpName'],
    extraPaths: ['providerName', 'serviceProviderName', 'provider'],
    confidence: 'low',
    compose: (project, provider) => joinPresent([project, provider], '　服务商：'),
  },
  {
    itemKey: 'A7',
    label: '数字化改造完成时间',
    source: 'archive.transInfo',
    candidatePaths: ['transEndDate', 'endDate', 'finishDate', 'completeDate', 'onlineDate'],
    confidence: 'low',
  },
  {
    itemKey: 'A8',
    label: '本次合同改造范围清单',
    source: 'archive.transInfo',
    candidatePaths: ['transContent', 'transformContent', 'constructionContent', 'content'],
    confidence: 'low',
  },
  {
    itemKey: 'A10',
    label: '所属行政区',
    source: 'archive.basic',
    fallbackSources: ['archive.digitalData', 'apply.details.0.detail'],
    candidatePaths: ['areaName', 'district', 'regionName', 'area', 'ownCity'],
    confidence: 'medium',
  },
  {
    itemKey: 'A11',
    label: '所属细分行业',
    source: 'archive.basic',
    candidatePaths: ['subIndustry', 'industryDetail', 'subIndustryName', 'industryName'],
    confidence: 'low',
  },
  {
    itemKey: 'A12',
    label: '企业性质',
    source: 'archive.basic',
    candidatePaths: ['entNature', 'nature', 'companyType', 'entType'],
    confidence: 'low',
  },
  {
    itemKey: 'A13',
    label: '企业规模',
    source: 'archive.basic',
    candidatePaths: ['entScale', 'scale', 'enterpriseScale', 'scaleName'],
    confidence: 'low',
  },
  {
    itemKey: 'A14',
    label: '统计口径（规模以上/以下）',
    source: 'archive.basic',
    candidatePaths: ['statCaliber', 'aboveScale', 'statisticalScale'],
    confidence: 'low',
  },
  {
    itemKey: 'A15',
    label: '优质中小企业情况',
    source: 'archive.basic',
    candidatePaths: ['qualitySmeType', 'highQualityType', 'enterpriseQualification', 'smeType'],
    confidence: 'low',
  },
];

/**
 * 平台附件 → 收集系统材料槽位。
 * 只有文件名语义足够明确时才给 itemKey；其余只给 suggestedItemKey 或留空，避免错挂。
 */
export const PLATFORM_ATTACHMENT_RULES = [
  { itemKey: 'C1', label: '近两年利润表或财务报表', pattern: /(financialStatementsResource|财务.*(报表|审计)|利润表|资产负债表|现金流量表)/i },
  { itemKey: 'H1', label: '改造前自评测报告', pattern: /改造前.*(自评|评测).*报告/i },
  { itemKey: 'H2', label: '改造后自评测报告', pattern: /改造后.*(自评|评测).*报告/i },
  { itemKey: 'C7', label: '投入清单明细表', pattern: /投入.*(清单|明细)/i },
  { itemKey: 'E6', label: '佐证材料真实性声明', pattern: /(申报资料|佐证材料).*真实性声明/i },
  { itemKey: 'E5', label: '备案或验收材料', pattern: /(备案表|验收申请表|验收书)/i },
  { itemKey: 'C6', label: '发票或付款凭证', pattern: /(发票|付款凭证|支付凭证|银行回单|公对公)/i },
  { itemKey: 'C5', label: '数字化改造合同', pattern: /(数字化|改造|转型).*(合同)|合同.*(数字化|改造|转型)/i },
];

export function mapAttachmentToItem(attachment) {
  const searchable = [attachment?.name, attachment?.sourcePath, attachment?.guessedFrom]
    .filter(Boolean)
    .join(' ');
  for (const rule of PLATFORM_ATTACHMENT_RULES) {
    if (rule.pattern.test(searchable)) {
      return {
        itemKey: rule.itemKey,
        label: rule.label,
        confidence: 'high',
      };
    }
  }

  // 实施方案通常与项目备案一起出现，但 E5 的正式定义是备案表/验收申请表，
  // 因此只建议、不自动挂载。
  if (/实施方案/i.test(searchable)) {
    return {
      itemKey: null,
      suggestedItemKey: 'E5',
      label: '项目实施方案（建议人工确认是否归入 E5）',
      confidence: 'low',
    };
  }
  return { itemKey: null, label: '', confidence: 'none' };
}

/** B0 改造前评测结果数据的六个子字段，来源是"改造情况与改造前成效"接口 */
export const B0_FIELD_MAP = {
  level: ['beforeLevel', 'preLevel', 'levelBefore', 'transBeforeLevel', 'digitalLevel'],
  scoreBasic: ['beforeBasicScore', 'basicScore', 'preBasicScore', 'foundationScore'],
  scoreMgmt: ['beforeManageScore', 'manageScore', 'preManageScore', 'managementScore'],
  scoreEffect: ['beforeEffectScore', 'effectScore', 'preEffectScore', 'benefitScore'],
  constraintScenes: ['beforeConstraintScene', 'constraintSceneNum', 'ysSceneNum', 'ysSceneCount'],
  guideScenes: ['beforeGuideScene', 'guideSceneNum', 'zdSceneNum', 'zdSceneCount'],
};

function readSource(collected, sourcePath) {
  return sourcePath.split('.').reduce(
    (node, key) => (node && typeof node === 'object' ? node[key] : undefined),
    collected,
  );
}

/** 生成"平台值 → 条目值"的候选清单，含取不到的记录 */
export function buildResponsePlan(collected) {
  const plan = [];

  for (const rule of PLATFORM_TO_ITEM) {
    const sourcePaths = [rule.source, ...(rule.fallbackSources || [])];
    let matchedSource = rule.source;
    let primary;
    let extra;
    for (const sourcePath of sourcePaths) {
      const source = readSource(collected, sourcePath);
      const candidate = extractByCandidates(source, rule.candidatePaths);
      const candidateExtra = rule.extraPaths
        ? extractByCandidates(source, rule.extraPaths)
        : undefined;
      if (candidate !== undefined || candidateExtra !== undefined) {
        matchedSource = sourcePath;
        primary = candidate;
        extra = candidateExtra;
        break;
      }
    }
    const raw = rule.compose ? rule.compose(primary, extra) : primary;

    if (raw === undefined || raw === '' || raw === null) {
      plan.push({
        itemKey: rule.itemKey,
        label: rule.label,
        value: null,
        source: matchedSource,
        confidence: rule.confidence,
        note: '候选字段全部落空，需用 raw-responses.json 校正 candidatePaths',
      });
      continue;
    }

    plan.push({
      itemKey: rule.itemKey,
      label: rule.label,
      value: { value: asText(raw) },
      source: matchedSource,
      confidence: rule.confidence,
      note: '',
    });
  }

  // B0：六项一起给，缺哪项填空字符串，保持与前端结构一致
  const transInfo = readSource(collected, 'archive.transInfo');
  if (transInfo) {
    const b0 = {};
    let hit = 0;
    for (const [field, candidates] of Object.entries(B0_FIELD_MAP)) {
      const value = extractByCandidates(transInfo, candidates);
      b0[field] = value === undefined ? '' : asText(value);
      if (value !== undefined) hit += 1;
    }
    plan.push({
      itemKey: 'B0',
      label: '改造前评测结果数据',
      value: hit > 0 ? b0 : null,
      source: 'archive.transInfo',
      confidence: hit >= 4 ? 'medium' : 'low',
      note: hit === 0
        ? '六项全部落空，需用真实返回体校正 B0_FIELD_MAP'
        : `命中 ${hit}/6 项，其余留空待人工补`,
    });
  }

  return plan;
}

/**
 * 与本系统当前清单比对，产出回灌计划。
 * 默认**不覆盖**本系统已有内容——采集值盖掉人工核对过的值会非常难查。
 */
export function buildImportPlan({ collected, checklist, attachments = [] }) {
  const responsePlan = buildResponsePlan(collected);
  const items = new Map((checklist?.items ?? []).map((item) => [item.itemKey, item]));

  const responses = [];
  const conflicts = [];
  const skipped = [];

  for (const entry of responsePlan) {
    const item = items.get(entry.itemKey);
    if (!item) {
      skipped.push({ ...entry, reason: '本系统当前阶段没有这个条目（可能被阶段过滤或未启用）' });
      continue;
    }
    if (entry.value === null) {
      skipped.push({ ...entry, reason: entry.note || '平台侧没取到值' });
      continue;
    }
    const existing = item.textValue;
    const existingText = existing && typeof existing === 'object'
      ? JSON.stringify(existing)
      : String(existing ?? '');
    const incomingText = JSON.stringify(entry.value);

    if (existingText && existingText !== 'null' && existingText !== '{}' && existingText !== incomingText) {
      conflicts.push({ ...entry, existing, incoming: entry.value, reason: '本系统已有不同内容，默认不覆盖' });
      continue;
    }
    responses.push(entry);
  }

  const files = [];
  const skippedFiles = [];
  for (const attachment of attachments.filter((entry) => entry.ok !== false)) {
    const mapped = attachment.itemKey
      ? { itemKey: attachment.itemKey, label: '', confidence: 'manual' }
      : mapAttachmentToItem(attachment);
    const file = {
      fileName: attachment.name,
      savedAs: attachment.savedAs,
      size: attachment.size,
      itemKey: mapped.itemKey ?? null,
      suggestedItemKey: mapped.suggestedItemKey ?? null,
      confidence: mapped.confidence,
      sourcePath: attachment.sourcePath,
      note: mapped.itemKey
        ? `按文件名识别为「${mapped.label || mapped.itemKey}」，写入前请复核`
        : mapped.suggestedItemKey
          ? mapped.label
          : '未能自动判断归属条目，需人工指定 itemKey 后才会上传',
    };

    if (!file.itemKey) {
      files.push(file);
      continue;
    }
    const existingFiles = items.get(file.itemKey)?.files ?? [];
    const duplicate = existingFiles.some((existing) => {
      const sameName = existing.fileName === file.fileName;
      const sameSize = !file.size || !existing.size || Number(existing.size) === Number(file.size);
      return sameName && sameSize;
    });
    if (duplicate) {
      skippedFiles.push({ ...file, reason: '本系统同一条目已有同名同大小文件，跳过重复上传' });
      continue;
    }
    files.push(file);
  }

  return { responses, conflicts, skipped, files, skippedFiles };
}

/** 执行回灌。apply 默认 false，只演练。 */
export async function applyImportPlan(client, plan, { apply = false, onLog = console.log } = {}) {
  const done = { responses: [], files: [], failed: [] };

  for (const entry of plan.responses) {
    if (!apply) {
      onLog(`[演练] 将写入 ${entry.itemKey} ${entry.label}：${JSON.stringify(entry.value)}`);
      continue;
    }
    try {
      await client.saveResponse(entry.itemKey, entry.value);
      done.responses.push(entry.itemKey);
      onLog(`[已写入] ${entry.itemKey} ${entry.label}`);
    } catch (error) {
      done.failed.push({ itemKey: entry.itemKey, error: error.message });
      onLog(`[失败] ${entry.itemKey}：${error.message}`);
    }
  }

  for (const file of plan.files) {
    if (!file.itemKey) {
      onLog(`[跳过] ${file.fileName}：未指定归属条目`);
      continue;
    }
    if (!apply) {
      onLog(`[演练] 将上传 ${file.fileName} → ${file.itemKey}`);
      continue;
    }
    try {
      const saved = await client.uploadFile(file.itemKey, file.savedAs, { stage: 'final' });
      done.files.push({ itemKey: file.itemKey, id: saved.id, fileName: file.fileName });
      onLog(`[已上传] ${file.fileName} → ${file.itemKey}`);
    } catch (error) {
      done.failed.push({ fileName: file.fileName, error: error.message });
      onLog(`[失败] ${file.fileName}：${error.message}`);
    }
  }

  return done;
}
