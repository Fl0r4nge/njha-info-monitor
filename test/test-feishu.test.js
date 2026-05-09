import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildFeishuSmokeTestMessage, isCliEntrypoint } from '../src/feishu-smoke.js';

test('buildFeishuSmokeTestMessage creates a text webhook payload', () => {
  const message = buildFeishuSmokeTestMessage();

  assert.equal(message.enterprise, '示例企业有限公司');
  assert.equal(message.stage, '项目备案');
  assert.equal(message.status, '项目备案(审核中)');
  assert.match(message.text, /工信平台流程状态测试/);
});

test('isCliEntrypoint detects direct execution for the current platform path', () => {
  const path = fileURLToPath(import.meta.url);

  assert.equal(isCliEntrypoint(pathToFileURL(path).href, path), true);
});
