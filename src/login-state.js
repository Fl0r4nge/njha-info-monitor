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
