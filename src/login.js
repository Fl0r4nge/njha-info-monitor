import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { loadConfig } from './config.js';
import { openBrowserContext } from './browser.js';
import { isLoginComplete } from './login-state.js';

async function main() {
  const config = await loadConfig();
  const { browser, context } = await openBrowserContext(config, {
    headless: false,
    useStorageState: false
  });

  try {
    const page = await context.newPage();
    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded' });

    if (process.env.LOGIN_AUTO_SAVE === '1') {
      await waitForAutoLogin(page, config);
    } else {
      const rl = createInterface({ input, output });
      await rl.question('请在浏览器中完成账号密码登录和滑块验证。登录成功后回到这里按 Enter 保存登录态。');
      rl.close();
    }

    await mkdir(dirname(config.storageStatePath), { recursive: true });
    await context.storageState({ path: config.storageStatePath });
    console.log(`登录态已保存到 ${config.storageStatePath}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function waitForAutoLogin(page, config) {
  const timeoutMs = Number(process.env.LOGIN_TIMEOUT_MS || 600000);
  const startedAt = Date.now();
  console.log('请在 noVNC 浏览器中完成登录。登录成功后会自动保存登录态。');

  while (Date.now() - startedAt < timeoutMs) {
    if (await isLoginComplete(page, config)) {
      return;
    }
    await page.waitForTimeout(2000);
  }

  throw new Error('Timed out waiting for login to complete');
}
