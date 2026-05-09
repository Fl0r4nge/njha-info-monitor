export async function isLoginComplete(page, config = {}) {
  const url = page.url();
  if (url.includes('/login')) {
    return false;
  }

  const personalCount = await page.getByText('个人中心', { exact: true }).count();
  if (personalCount > 0) {
    return true;
  }

  if (config.enterpriseName) {
    return await page.getByText(config.enterpriseName, { exact: true }).count() > 0;
  }

  return false;
}

export async function isLoginExpired(page, config = {}) {
  if (config.loginExpiredSelector && await page.locator(config.loginExpiredSelector).count() > 0) {
    return true;
  }

  const url = page.url();
  const patterns = config.loginExpiredUrlPatterns || ['/login', '/ui/#/login'];
  if (patterns.some((pattern) => url.includes(pattern))) {
    return true;
  }

  const loginPath = config.loginUrl ? new URL(config.loginUrl).pathname : '';
  return Boolean(loginPath && loginPath !== '/' && url.includes(loginPath));
}
