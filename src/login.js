import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { pathToFileURL } from 'node:url';

import { loadConfig } from './config.js';
import { openBrowserContext } from './browser.js';
import { fillLoginForm, submitLoginForm } from './login-form.js';
import { isLoginComplete } from './login-state.js';
import { solveSliderCaptcha } from './slider-captcha.js';

export async function loginAndSave(config, credentials, options = {}) {
  const { browser, context } = await openBrowserContext(config, {
    headless: options.headless ?? false,
    useStorageState: false
  });

  try {
    const page = await context.newPage();
    await page.goto(config.loginUrl, { waitUntil: 'domcontentloaded' });

    if (credentials) {
      const { mode, captchaFilled } = await fillLoginForm(page, credentials);
      console.log('已自动填写账号和密码。');

      if (mode === 'enterprise') {
        await submitLoginForm(page, mode);
        await page.waitForSelector('.verifybox', { state: 'visible' });
        const result = await solveEnterpriseSlider(page, options);
        console.log(`滑块验证已自动完成（匹配置信度 ${result.confidence.toFixed(3)}）。`);
      } else if (captchaFilled) {
        await submitLoginForm(page, mode);
        console.log('已提交登录表单，正在等待登录完成。');
      } else {
        console.log('请在浏览器中填写图片验证码并点击登录。');
      }
    }

    if (options.autoSave ?? process.env.LOGIN_AUTO_SAVE === '1') {
      await waitForAutoLogin(page, config);
    } else {
      const rl = createInterface({ input, output });
      await rl.question('请在浏览器中完成账号密码登录和滑块验证。登录成功后回到这里按 Enter 保存登录态。');
      rl.close();
    }

    await mkdir(dirname(config.storageStatePath), { recursive: true });
    await context.storageState({ path: config.storageStatePath });
    console.log(`登录态已保存到 ${config.storageStatePath}`);
    return context.storageState();
  } finally {
    await browser.close();
  }
}

async function main() {
  const config = await loadConfig();
  return loginAndSave(config, readCredentialsFromEnvironment());
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

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

async function waitForAutoLogin(page, config) {
  const timeoutMs = Number(process.env.LOGIN_TIMEOUT_MS || 600000);
  const startedAt = Date.now();
  console.log('正在等待平台登录完成；自动验证失败时才会转入人工接管。');

  while (Date.now() - startedAt < timeoutMs) {
    if (await isLoginComplete(page, config)) {
      return;
    }
    await page.waitForTimeout(2000);
  }

  throw new Error('Timed out waiting for login to complete');
}

export async function solveEnterpriseSlider(page, options = {}) {
  const configuredAttempts = Number(options.sliderAttempts ?? process.env.GONGXIN_SLIDER_ATTEMPTS ?? 3);
  const attempts = Number.isFinite(configuredAttempts)
    ? Math.max(1, Math.min(5, Math.floor(configuredAttempts)))
    : 3;
  const solve = options.solveSlider ?? solveSliderCaptcha;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await solve(page);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await page.waitForTimeout(600);
      }
    }
  }

  throw new Error(`自动滑块验证连续失败 ${attempts} 次：${lastError?.message || String(lastError)}`);
}
