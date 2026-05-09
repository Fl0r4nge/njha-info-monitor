import { loadConfig } from './config.js';
import { sendFeishuWebhook } from './feishu.js';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function buildFeishuSmokeTestMessage() {
  return {
    enterprise: '示例企业有限公司',
    stage: '项目备案',
    status: '项目备案(审核中)',
    time: new Date().toISOString(),
    text: '工信平台流程状态测试：示例企业有限公司 - 项目备案(审核中)'
  };
}

async function main() {
  const config = await loadConfig();
  if (!config.feishuWebhookUrl) {
    throw new Error('Missing FEISHU_WEBHOOK_URL. Put it in .env or config.json.');
  }

  await sendFeishuWebhook(config.feishuWebhookUrl, buildFeishuSmokeTestMessage());
  console.log('飞书测试消息已发送。');
}

export function isCliEntrypoint(importMetaUrl, argvPath) {
  return resolve(fileURLToPath(importMetaUrl)) === resolve(argvPath);
}

if (isCliEntrypoint(import.meta.url, process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
