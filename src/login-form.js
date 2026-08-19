export async function fillLoginForm(page, credentials) {
  const username = String(credentials?.username || '').trim();
  const password = String(credentials?.password || '');
  const captcha = String(credentials?.captcha || '').trim();

  if (!username || !password) {
    throw new Error('GONGXIN_USERNAME and GONGXIN_PASSWORD must both be provided');
  }

  const mode = await hasPlaceholder(page, '账号名') ? 'enterprise' : 'service';
  const usernamePlaceholder = mode === 'enterprise' ? '账号名' : '请输入用户名';
  const passwordPlaceholder = mode === 'enterprise' ? '密码' : '请输入密码';

  await page.getByPlaceholder(usernamePlaceholder, { exact: true }).fill(username);
  await page.getByPlaceholder(passwordPlaceholder, { exact: true }).fill(password);

  if (captcha && mode === 'service') {
    await page.getByPlaceholder('请输入验证码', { exact: true }).fill(captcha);
  }

  return { mode, captchaFilled: Boolean(captcha && mode === 'service') };
}

export async function submitLoginForm(page, mode = 'service') {
  if (mode === 'enterprise') {
    await page.locator('.login-btn').click();
    return;
  }

  await page.getByRole('button', { name: '登录', exact: true }).click();
}

async function hasPlaceholder(page, placeholder) {
  return await page.getByPlaceholder(placeholder, { exact: true }).count() > 0;
}
