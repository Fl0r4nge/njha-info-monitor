import { loadConfig } from './config.js';
import { openBrowserContext } from './browser.js';
import { getLoginExpiredReason } from './login-state.js';
import { extractProjects } from './scraper.js';
import { runNavigationSteps } from './navigation.js';

async function main() {
  const config = await loadConfig();
  const { browser, context } = await openBrowserContext(config);

  try {
    const page = await context.newPage();
    await page.goto(config.projectUrl, { waitUntil: 'domcontentloaded' });

    const loginExpiredReason = await getLoginExpiredReason(page, config);
    if (loginExpiredReason) {
      throw new Error(`登录态已失效：${loginExpiredReason}`);
    }

    await runNavigationSteps(page, config.navigationSteps);
    const projects = await extractProjects(page, config.selectors);

    console.log(JSON.stringify({
      queriedAt: new Date().toISOString(),
      enterprise: config.enterpriseName,
      count: projects.length,
      projects
    }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
