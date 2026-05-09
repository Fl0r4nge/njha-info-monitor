import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFeishuFlowPayload, buildFeishuMessage, buildLoginExpiredMessage } from '../src/feishu.js';

test('buildFeishuMessage formats changed project notifications', () => {
  const message = buildFeishuMessage([
    {
      type: 'changed',
      id: 'A',
      before: { name: '项目A', enterprise: '企业A', status: '待区级审核', step: '区级审核' },
      after: { name: '项目A', enterprise: '企业A', status: '市级审核中', step: '市级审核', updatedAt: '2026-05-09 10:00' },
      changedFields: ['status', 'step']
    }
  ]);

  assert.equal(message.msg_type, 'interactive');
  assert.equal(message.card.header.title.content, '工信平台流程状态变更');
  assert.match(JSON.stringify(message), /待区级审核/);
  assert.match(JSON.stringify(message), /市级审核中/);
  assert.match(JSON.stringify(message), /2026-05-09 10:00/);
});

test('buildFeishuFlowPayload formats a changed project for Feishu flow webhooks', () => {
  const payload = buildFeishuFlowPayload({
    type: 'changed',
    id: 'A',
    before: { enterprise: '南京浩安机械刀具有限公司', status: '项目备案(审核中)', step: '项目备案' },
    after: {
      enterprise: '南京浩安机械刀具有限公司',
      status: '申请验收(待提交)',
      step: '申请验收',
      updatedAt: '2026-05-09 16:20:00'
    }
  });

  assert.deepEqual(payload, {
    enterprise: '南京浩安机械刀具有限公司',
    stage: '申请验收',
    status: '申请验收(待提交)',
    time: '2026-05-09 16:20:00',
    text: '工信平台流程状态更新：南京浩安机械刀具有限公司 - 申请验收 - 申请验收(待提交)'
  });
});

test('buildLoginExpiredMessage formats login expiry for Feishu flow webhooks', () => {
  const payload = buildLoginExpiredMessage('南京浩安机械刀具有限公司', '2026-05-09 16:30:00');

  assert.deepEqual(payload, {
    enterprise: '南京浩安机械刀具有限公司',
    stage: '系统巡检',
    status: '登录态已失效',
    time: '2026-05-09 16:30:00',
    text: '工信平台巡检异常：登录态已失效，请重新登录并更新 storage_state.json'
  });
});
