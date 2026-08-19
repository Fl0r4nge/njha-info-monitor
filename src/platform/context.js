/**
 * 平台会话上下文：复用人工登录留下的 storageState，校验登录态，构造接口客户端。
 *
 * 登录本身（图形验证码 + 滑块）只能人工完成，见 README 的 npm run login。
 * 这里只负责"拿着已有登录态干活"，登录态不存在或已失效时立刻给出可操作的提示。
 */

import { access } from 'node:fs/promises';
import { openBrowserContext } from '../browser.js';
import { getLoginExpiredReason } from '../login-state.js';
import { createApiClient } from './api-client.js';

/** 从 config.projectUrl 推出接口的 baseUrl（同源） */
export function resolveBaseUrl(config) {
  const source = config.projectUrl || config.loginUrl;
  if (!source) throw new Error('配置缺少 projectUrl 或 loginUrl，无法确定接口地址');
  const url = new URL(source);
  return `${url.protocol}//${url.host}`;
}

export async function withPlatformContext(config, fn, options = {}) {
  const statePath = config.storageStatePath;
  if (!statePath) throw new Error('配置缺少 storageStatePath');
  try {
    await access(statePath);
  } catch {
    throw new Error(
      `登录态文件不存在：${statePath}\n` +
      '平台登录需要人工填写图形验证码并拖动滑块，请先执行：\n' +
      "  GONGXIN_USERNAME='账号' GONGXIN_PASSWORD='密码' GONGXIN_CONFIG='./config.hongguang.json' LOGIN_AUTO_SAVE=1 npm run login",
    );
  }

  const { browser, context } = await openBrowserContext(config, options);
  try {
    const page = await context.newPage();
    await page.goto(config.projectUrl, { waitUntil: 'domcontentloaded' });

    const expiredReason = await getLoginExpiredReason(page, config);
    if (expiredReason) {
      throw new Error(
        `登录态已失效：${expiredReason}\n请重新执行 npm run login 生成新的登录态。`,
      );
    }

    const api = createApiClient({
      page,
      context,
      baseUrl: resolveBaseUrl(config),
      minIntervalMs: options.minIntervalMs ?? 800,
    });

    return await fn({ page, context, api, config });
  } finally {
    await browser.close();
  }
}
