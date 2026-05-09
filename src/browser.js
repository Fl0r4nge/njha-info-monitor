import { chromium } from 'playwright';

export async function openBrowserContext(config, options = {}) {
  const browser = await chromium.launch({
    headless: options.headless ?? true,
    slowMo: options.slowMo || 0
  });

  const contextOptions = {
    viewport: { width: 1440, height: 1000 },
    locale: 'zh-CN'
  };

  if (options.useStorageState !== false) {
    contextOptions.storageState = config.storageStatePath;
  }

  const context = await browser.newContext(contextOptions);
  context.setDefaultTimeout(config.timeoutMs);

  return { browser, context };
}
