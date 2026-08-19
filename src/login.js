import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { loadConfig } from './config.js';
import { openBrowserContext } from './browser.js';
import { fillLoginForm, submitLoginForm } from './login-form.js';
import { isLoginComplete } from './login-state.js';
import { solveSliderCaptcha } from './slider-captcha.js';

async function main() {
  const config = await loadConfig();
  const { browser, context } = await openBrowserContext(config, {
    headless: false,
    useStorageState: false
  });

  try {
    const page = await context.newPage();
    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded' });

    const credentials = readCredentialsFromEnvironment();
    if (credentials) {
      const { mode, captchaFilled } = await fillLoginForm(page, credentials);
      console.log('已自动填写账号和密码。');

      if (mode === 'enterprise') {
        await submitLoginForm(page, mode);
        await page.waitForSelector('.verifybox', { state: 'visible' });

        if (process.env.GONGXIN_SOLVE_SLIDER !== 'CONFIRMED') {
          console.log('检测到滑块验证码。请确认本次处理后，将 GONGXIN_SOLVE_SLIDER 临时设置为 CONFIRMED 并重新运行。');
        } else {
          const result = await solveSliderCaptcha(page);
          console.log(`滑块验证已完成（匹配置信度 ${result.confidence.toFixed(3)}）。`);
        }
      } else if (captchaFilled) {
        await submitLoginForm(page, mode);
        console.log('已提交登录表单，正在等待登录完成。');
      } else {
        console.log('请在浏览器中填写图片验证码并点击登录。');
      }
    }

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

function readCredentialsFromEnvironment() {
  const username = process.env.GONGXIN_USERNAME;
  const password = process.env.GONGXIN_PASSWORD;
  const captcha = process.env.GONGXIN_CAPTCHA;

  if (!username && !password && !captcha) {
    return null;
  }

  if (!username || !password) {
    throw new Error('GONGXIN_USERNAME and GONGXIN_PASSWORD must both be provided');
  }

  return { username, password, captcha };
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
