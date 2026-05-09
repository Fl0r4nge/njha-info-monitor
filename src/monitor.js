import { loadConfig } from './config.js';
import { openBrowserContext } from './browser.js';
import { diffProjects } from './diff.js';
import { buildFeishuFlowPayload, buildLoginExpiredMessage, sendFeishuWebhook } from './feishu.js';
import { extractProjects } from './scraper.js';
import { runNavigationSteps } from './navigation.js';
import { JsonSnapshotStore } from './store.js';

async function main() {
  const config = await loadConfig();
  if (!config.feishuWebhookUrl) {
    throw new Error('Missing FEISHU_WEBHOOK_URL or config.feishuWebhookUrl');
  }

  const { browser, context } = await openBrowserContext(config);
  const store = new JsonSnapshotStore(config.snapshotPath);

  try {
    const page = await context.newPage();
    await page.goto(config.projectUrl, { waitUntil: 'domcontentloaded' });

    if (await isLoginExpired(page, config)) {
      await sendFeishuWebhook(config.feishuWebhookUrl, buildLoginExpiredMessage(config.enterpriseName));
      throw new Error('Login state expired');
    }

    await runNavigationSteps(page, config.navigationSteps);

    const previous = await store.load();
    const current = await extractProjects(page, config.selectors);
    const changes = diffProjects(previous, current, config.compareFields);

    if (changes.length > 0) {
      for (const change of changes) {
        await sendFeishuWebhook(config.feishuWebhookUrl, buildFeishuFlowPayload(change));
      }
    }

    await store.save(current);
    console.log(`巡检完成：项目 ${current.length} 个，变更 ${changes.length} 条。`);
  } finally {
    await browser.close();
  }
}

async function isLoginExpired(page, config) {
  if (config.loginExpiredSelector && await page.locator(config.loginExpiredSelector).count() > 0) {
    return true;
  }

  const url = page.url();
  return config.loginUrl && url.includes(new URL(config.loginUrl).pathname);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
