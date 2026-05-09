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
  return Boolean(await getLoginExpiredReason(page, config));
}

export async function getLoginExpiredReason(page, config = {}) {
  const url = page.url();

  if (config.loginExpiredSelector && await hasVisibleMatch(page.locator(config.loginExpiredSelector))) {
    return `visible login selector found: ${config.loginExpiredSelector}; url=${url}`;
  }

  const patterns = config.loginExpiredUrlPatterns || ['/login', '/ui/#/login'];
  if (patterns.some((pattern) => url.includes(pattern))) {
    return `login URL pattern matched; url=${url}`;
  }

  const loginPath = config.loginUrl ? new URL(config.loginUrl).pathname : '';
  if (loginPath && loginPath !== '/' && url.includes(loginPath)) {
    return `login path matched; path=${loginPath}; url=${url}`;
  }

  return '';
}

async function hasVisibleMatch(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    if (await locator.nth(index).isVisible()) {
      return true;
    }
  }

  return false;
}
