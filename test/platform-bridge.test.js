import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseEnvelope,
  fillPathParams,
  buildQuery,
  buildTokenHeaderCandidates,
  createApiClient,
  PLATFORM_ENDPOINTS,
} from '../src/platform/api-client.js';
import { pickList, pickField } from '../src/platform/collect.js';
import { safeFileName, findAttachments } from '../src/platform/attachments.js';
import {
  shouldReallySend,
  summarizePayload,
  submitToPlatform,
  CONFIRM_TOKEN,
  WRITE_WHITELIST,
} from '../src/platform/push.js';
import {
  planChunks,
  assertUploadResult,
  createCollectClient,
  COLLECT_CHUNK_BYTES,
} from '../src/bridge/collect-system.js';
import {
  extractByCandidates,
  buildResponsePlan,
  buildImportPlan,
  mapAttachmentToItem,
  PLATFORM_TO_ITEM,
} from '../src/bridge/field-map.js';
import { buildPlatformExportPlan } from '../src/bridge/platform-export.js';
import { isTrueFlag } from '../src/cli.js';

// ---------- api-client ----------

test('parseEnvelope 取出 data，并在 code 非成功时抛错', () => {
  assert.deepEqual(parseEnvelope({ code: 200, data: { a: 1 } }), { a: 1 });
  assert.deepEqual(parseEnvelope({ code: '0', data: [1, 2] }), [1, 2]);
  assert.throws(() => parseEnvelope({ code: 500, msg: '内部错误' }, '[t]'), /内部错误/);
});

test('parseEnvelope 兼容没有信封的返回（直接数组或对象）', () => {
  assert.deepEqual(parseEnvelope([1, 2]), [1, 2]);
  assert.deepEqual(parseEnvelope({ entName: '鸿光' }), { entName: '鸿光' });
});

test('parseEnvelope 有信封但没有 data 字段时不丢数据', () => {
  assert.deepEqual(parseEnvelope({ code: 200, total: 3 }), { code: 200, total: 3 });
});

test('fillPathParams 替换参数，缺参数直接报错', () => {
  assert.equal(fillPathParams('/a/{id}/b/{stage}', { id: 7, stage: 2 }), '/a/7/b/2');
  assert.throws(() => fillPathParams('/a/{id}', {}), /路径参数缺失/);
});

test('buildQuery 忽略空值', () => {
  assert.equal(buildQuery({ page: 1, size: '', q: undefined }), '?page=1');
  assert.equal(buildQuery({}), '');
});

test('buildTokenHeaderCandidates 从 localStorage 里挑候选鉴权头', () => {
  const candidates = buildTokenHeaderCandidates({
    'Admin-Token': 'abcdefghijklmnopqrstuvwxyz',
    unrelated: 'x',
  });
  assert.ok(candidates.length >= 4);
  assert.ok(candidates.some((c) => c.headers.Authorization === 'abcdefghijklmnopqrstuvwxyz'));
  assert.ok(candidates.some((c) => c.headers.Authorization?.startsWith('Bearer ')));
});

test('业务返回 code=401 时切换 localStorage 令牌并重试', async () => {
  const token = 'abcdefghijklmnopqrstuvwxyz';
  const requests = [];
  const page = {
    evaluate: async (_fn, args) => {
      if (!args) return { 'Admin-Token': token };
      requests.push(args);
      if (args.headers.Authorization === token) {
        return { ok: true, status: 200, text: JSON.stringify({ code: 200, data: { ok: true } }) };
      }
      return { ok: true, status: 200, text: JSON.stringify({ code: 401, msg: 'token失效' }) };
    },
  };
  const api = createApiClient({ page, context: {}, baseUrl: 'https://example.test', minIntervalMs: 0 });

  assert.deepEqual(await api.get('archiveBasic'), { ok: true });
  assert.equal(requests.length, 2);
  assert.equal(api.authMode, 'Admin-Token');
});

test('写入类端点都带 danger 标记', () => {
  for (const key of WRITE_WHITELIST) {
    assert.equal(PLATFORM_ENDPOINTS[key].danger, true, `${key} 应标记 danger`);
  }
});

// ---------- collect ----------

test('pickList 能从各种分页壳子里取出列表', () => {
  assert.deepEqual(pickList([1, 2]), [1, 2]);
  assert.deepEqual(pickList({ records: [3] }), [3]);
  assert.deepEqual(pickList({ data: { list: [4] } }), [4]);
  assert.deepEqual(pickList(null), []);
});

test('pickField 按候选键取第一个有值的', () => {
  assert.equal(pickField({ b: '', a: 1 }, ['b', 'a']), 1);
  assert.equal(pickField({}, ['a']), undefined);
});

// ---------- attachments ----------

test('safeFileName 只清洗非法字符，不破坏中文与数字', () => {
  assert.equal(safeFileName('/x/2024年发票 (1).pdf'), '2024年发票 (1).pdf');
  assert.equal(safeFileName('a<b>c.pdf'), 'a_b_c.pdf');
  assert.equal(safeFileName('../../etc/passwd'), 'passwd');
  assert.equal(safeFileName(''), 'attachment');
});

test('findAttachments 递归识别并去重', () => {
  const payload = {
    detail: {
      fileList: [
        { fileName: '合同.pdf', fileUrl: '/upload/2024/contract.pdf' },
        { fileName: '发票.pdf', fileUrl: '/upload/2024/invoice.pdf' },
      ],
      nested: { attachUrl: '/upload/2024/contract.pdf' },
    },
  };
  const found = findAttachments(payload, { sourceLabel: 'test' });
  assert.equal(found.length, 2, '重复地址应被去重');
  assert.ok(found.some((f) => f.name === '合同.pdf'));
});

test('findAttachments 不把普通字符串当成文件', () => {
  assert.deepEqual(findAttachments({ entName: '南京鸿光环境科技有限公司' }), []);
});

// ---------- push（高风险守卫）----------

test('shouldReallySend 只有 dryRun:false + 正确 confirm 才放行', () => {
  assert.equal(shouldReallySend({ dryRun: true, confirm: CONFIRM_TOKEN }), false);
  assert.equal(shouldReallySend({ dryRun: false, confirm: 'yes' }), false);
  assert.equal(shouldReallySend({ dryRun: false }), false);
  assert.equal(shouldReallySend({}), false);
  assert.equal(shouldReallySend({ dryRun: false, confirm: CONFIRM_TOKEN }), true);
});

test('submitToPlatform 默认只演练，不调用 api', async () => {
  let called = false;
  const api = { post: async () => { called = true; } };
  const result = await submitToPlatform(api, 'submitArchiveTransResult', { a: 1 }, {
    logger: { warn() {} },
  });
  assert.equal(called, false);
  assert.equal(result.dryRun, true);
  assert.ok(result.wouldSend.path.includes('twoPhaseSubmitArchiveTransResult'));
});

test('submitToPlatform 拒绝白名单外的端点（如启动流程）', async () => {
  const api = { post: async () => { throw new Error('不该被调用'); } };
  await assert.rejects(
    () => submitToPlatform(api, 'startWorkflow', {}, { dryRun: false, confirm: CONFIRM_TOKEN }),
    /不在写入白名单/,
  );
});

test('summarizePayload 脱敏敏感字段并截断长文本', () => {
  const summary = summarizePayload({
    entName: '鸿光',
    creditCode: '91320000XXXXXXXX',
    contactPhone: '13800000000',
    memo: 'x'.repeat(300),
  });
  assert.equal(summary.creditCode, '[已脱敏]');
  assert.equal(summary.contactPhone, '[已脱敏]');
  assert.equal(summary.entName, '鸿光');
  assert.ok(summary.memo.includes('共 300 字'));
});

// ---------- 收集系统客户端 ----------

test('planChunks 切片连续、不重叠、覆盖完整', () => {
  assert.deepEqual(planChunks(0), []);
  assert.deepEqual(planChunks(100), [{ index: 0, start: 0, end: 100 }]);
  const plan = planChunks(COLLECT_CHUNK_BYTES * 2 + 123);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].end, plan[1].start);
  assert.equal(plan.at(-1).end, COLLECT_CHUNK_BYTES * 2 + 123);
});

test('assertUploadResult 没有 id 就判失败（防网关假成功）', () => {
  assert.deepEqual(assertUploadResult(201, { id: 'x' }, 'a.pdf'), { id: 'x' });
  assert.throws(
    () => assertUploadResult(200, { code: 'k_func_ec_400002757', msg: 'Request payload exceeds the maximum limit of 12 MB.' }, 'a.pdf'),
    /被平台网关拦截/,
  );
  assert.throws(() => assertUploadResult(200, '<html>', 'a.pdf'), /上传未生效/);
});

test('管理侧文件下载拒绝外部地址，避免泄露管理密钥', async () => {
  const client = createCollectClient({
    baseUrl: 'https://collect.example/app/app_x',
    slug: 'demo',
    adminKey: 'secret',
    fetchImpl: async () => { throw new Error('不应发出请求'); },
  });
  await assert.rejects(
    () => client.downloadManifestFile('https://evil.example/file.pdf'),
    /拒绝下载非本系统导出地址/,
  );
});

// ---------- 字段映射与回灌计划 ----------

test('extractByCandidates 按候选路径依次尝试', () => {
  assert.equal(extractByCandidates({ b: 'v' }, ['a', 'b']), 'v');
  assert.equal(extractByCandidates({ a: { b: 'deep' } }, ['a.b']), 'deep');
  assert.equal(extractByCandidates({}, ['a']), undefined);
});

test('映射表里的 itemKey 都是收集系统真实存在的条目', () => {
  const valid = /^(A([1-9]|1[0-5])|B0)$/;
  for (const rule of PLATFORM_TO_ITEM) {
    assert.match(rule.itemKey, valid, `${rule.itemKey} 不像真实 itemKey`);
  }
});

test('buildResponsePlan 取不到值时标注待校正而不是硬失败', () => {
  const plan = buildResponsePlan({ archive: { basic: {}, transInfo: {} } });
  const a1 = plan.find((p) => p.itemKey === 'A1');
  assert.equal(a1.value, null);
  assert.match(a1.note, /校正/);
});

test('buildResponsePlan 命中字段时产出 A 类的 {value} 结构', () => {
  const plan = buildResponsePlan({
    archive: { basic: { entName: '南京鸿光环境科技有限公司', creditCode: '913201XXXX' } },
  });
  const a1 = plan.find((p) => p.itemKey === 'A1');
  assert.ok(a1.value.value.includes('南京鸿光环境科技有限公司'));
});

test('buildResponsePlan 保留数值 0，不把零值当成空', () => {
  const plan = buildResponsePlan({
    archive: { basic: { employeeNum: 0, lastYearEmployeeNum: 12 } },
  });
  const a5 = plan.find((entry) => entry.itemKey === 'A5');
  assert.equal(a5.value.value, '0 / 12');
});

test('buildImportPlan 不覆盖本系统已有的不同内容', () => {
  const collected = { archive: { basic: { entName: '鸿光' } } };
  const checklist = {
    items: [
      { itemKey: 'A1', textValue: { value: '人工填过的名字' }, files: [] },
    ],
  };
  const plan = buildImportPlan({ collected, checklist });
  assert.equal(plan.responses.length, 0);
  assert.equal(plan.conflicts.length, 1);
  assert.match(plan.conflicts[0].reason, /不覆盖/);
});

test('buildImportPlan 对本系统没有的条目记入 skipped', () => {
  const plan = buildImportPlan({
    collected: { archive: { basic: { entName: '鸿光' } } },
    checklist: { items: [] },
  });
  assert.ok(plan.skipped.some((s) => s.itemKey === 'A1'));
  assert.equal(plan.responses.length, 0);
});

test('平台附件按明确文件名映射到收集系统条目', () => {
  assert.equal(mapAttachmentToItem({ name: '数字化改造合同.pdf' }).itemKey, 'C5');
  assert.equal(mapAttachmentToItem({ name: '投入发票及银行回单.pdf' }).itemKey, 'C6');
  assert.equal(mapAttachmentToItem({ name: '申报资料真实性声明.pdf' }).itemKey, 'E6');
  assert.equal(mapAttachmentToItem({ name: '改造前数字化水平自评测报告.pdf' }).itemKey, 'H1');
});

test('低置信附件只建议归类，不自动带 itemKey', () => {
  const mapped = mapAttachmentToItem({ name: '数字化项目实施方案.pdf' });
  assert.equal(mapped.itemKey, null);
  assert.equal(mapped.suggestedItemKey, 'E5');
});

test('buildImportPlan 跳过同一条目已有的同名同大小附件', () => {
  const plan = buildImportPlan({
    collected: { archive: { basic: {} } },
    checklist: {
      items: [
        {
          itemKey: 'C5',
          textValue: null,
          files: [{ fileName: '数字化改造合同.pdf', size: 1024 }],
        },
      ],
    },
    attachments: [
      {
        name: '数字化改造合同.pdf',
        savedAs: 'data/attachments/数字化改造合同.pdf',
        size: 1024,
        ok: true,
      },
    ],
  });
  assert.equal(plan.files.length, 0);
  assert.equal(plan.skippedFiles.length, 1);
  assert.match(plan.skippedFiles[0].reason, /重复上传/);
});

test('反向导出只包含有平台落点的最终版文件，并排除 A9 密码', () => {
  const plan = buildPlatformExportPlan({
    project: { id: 'p1', name: '示例企业' },
    categories: [
      {
        key: 'A',
        name: '基本信息',
        items: [
          { item_key: 'A1', name: '企业信息', text_value: { value: '示例企业' }, files: [] },
          { item_key: 'A9', name: '系统账号', text_value: { value: 'secret' }, files: [] },
        ],
      },
      {
        key: 'C',
        name: '财务材料',
        items: [
          {
            item_key: 'C5',
            name: '数字化改造合同',
            text_value: null,
            files: [
              {
                upload_id: 'u-final',
                file_name: '合同-final.pdf',
                stage: 'final',
                download_url: '/api/export/p1/file/u-final',
              },
              {
                upload_id: 'u-draft',
                file_name: '合同-draft.pdf',
                stage: 'draft',
                download_url: '/api/export/p1/file/u-draft',
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(plan.values.length, 1);
  assert.equal(plan.values[0].itemKey, 'A1');
  assert.equal(plan.files.length, 1);
  assert.equal(plan.files[0].uploadId, 'u-final');
  assert.ok(plan.skipped.some((entry) => entry.itemKey === 'A9'));
  assert.ok(plan.skipped.some((entry) => entry.fileName === '合同-draft.pdf'));
});

// ---------- CLI 开关 ----------

test('isTrueFlag 把 --apply=false 当作假', () => {
  assert.equal(isTrueFlag(true), true);
  assert.equal(isTrueFlag('true'), true);
  assert.equal(isTrueFlag('false'), false);
  assert.equal(isTrueFlag('0'), false);
  assert.equal(isTrueFlag(undefined), false);
});
