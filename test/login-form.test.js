import test from 'node:test';
import assert from 'node:assert/strict';

import { fillLoginForm, submitLoginForm } from '../src/login-form.js';

test('fillLoginForm fills credentials without exposing them in a return value', async () => {
  const calls = [];
  const page = fakePage(calls);

  const result = await fillLoginForm(page, {
    username: 'operator',
    password: 'secret'
  });

  assert.deepEqual(calls, [
    ['placeholder', '请输入用户名', 'operator'],
    ['placeholder', '请输入密码', 'secret']
  ]);
  assert.deepEqual(result, { mode: 'service', captchaFilled: false });
  assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('fillLoginForm fills an explicitly supplied captcha', async () => {
  const calls = [];
  const page = fakePage(calls);

  const result = await fillLoginForm(page, {
    username: 'operator',
    password: 'secret',
    captcha: '1234'
  });

  assert.deepEqual(calls.at(-1), ['placeholder', '请输入验证码', '1234']);
  assert.deepEqual(result, { mode: 'service', captchaFilled: true });
});

test('fillLoginForm rejects incomplete credentials', async () => {
  await assert.rejects(
    () => fillLoginForm(fakePage([]), { username: 'operator' }),
    /GONGXIN_USERNAME and GONGXIN_PASSWORD/
  );
});

test('submitLoginForm clicks the login button', async () => {
  const calls = [];
  await submitLoginForm(fakePage(calls));
  assert.deepEqual(calls, [['role', 'button', '登录', 'click']]);
});

function fakePage(calls) {
  return {
    getByPlaceholder(placeholder) {
      return {
        async count() {
          return placeholder === '账号名' ? 0 : 1;
        },
        async fill(value) {
          calls.push(['placeholder', placeholder, value]);
        }
      };
    },
    getByRole(role, options) {
      return {
        async click() {
          calls.push(['role', role, options.name, 'click']);
        }
      };
    },
    locator(selector) {
      return {
        async click() {
          calls.push(['selector', selector, 'click']);
        }
      };
    }
  };
}

test('fillLoginForm supports the enterprise login placeholders', async () => {
  const calls = [];
  const page = fakeEnterprisePage(calls);

  const result = await fillLoginForm(page, {
    username: 'operator',
    password: 'secret'
  });

  assert.deepEqual(result, { mode: 'enterprise', captchaFilled: false });
  assert.deepEqual(calls, [
    ['placeholder', '账号名', 'operator'],
    ['placeholder', '密码', 'secret']
  ]);

  await submitLoginForm(page, result.mode);
  assert.deepEqual(calls.at(-1), ['selector', '.login-btn', 'click']);
});

function fakeEnterprisePage(calls) {
  const page = fakePage(calls);
  page.getByPlaceholder = (placeholder) => ({
    async count() {
      return placeholder === '账号名' ? 1 : 0;
    },
    async fill(value) {
      calls.push(['placeholder', placeholder, value]);
    }
  });
  return page;
}
