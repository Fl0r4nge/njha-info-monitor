import test from 'node:test';
import assert from 'node:assert/strict';

import { getLoginExpiredReason, isLoginComplete, isLoginExpired } from '../src/login-state.js';

test('isLoginComplete returns true when personal center text is visible away from login page', async () => {
  const page = fakePage('http://180.101.239.176:9443/', 1);

  assert.equal(await isLoginComplete(page, { enterpriseName: '南京浩安机械刀具有限公司' }), true);
});

test('isLoginComplete returns false on login page', async () => {
  const page = fakePage('http://180.101.239.176:9443/ui/#/login', 1);

  assert.equal(await isLoginComplete(page, { enterpriseName: '南京浩安机械刀具有限公司' }), false);
});

function fakePage(url, visibleCount) {
  return {
    url() {
      return url;
    },
    locator() {
      return {
        async count() {
          return 0;
        }
      };
    },
    getByText() {
      return {
        async count() {
          return visibleCount;
        }
      };
    }
  };
}

function fakePageWithLoginSelector(url, selectorVisible) {
  return {
    url() {
      return url;
    },
    locator() {
      return {
        async count() {
          return 1;
        },
        nth() {
          return {
            async isVisible() {
              return selectorVisible;
            }
          };
        }
      };
    },
    getByText() {
      return {
        async count() {
          return 0;
        }
      };
    }
  };
}

test('isLoginExpired does not treat root loginUrl as expired for personal page', async () => {
  const page = fakePage('http://180.101.239.176:9443/personal', 1);

  assert.equal(await isLoginExpired(page, {
    loginUrl: 'http://180.101.239.176:9443/',
    loginExpiredUrlPatterns: ['/login', '/ui/#/login']
  }), false);
});

test('isLoginExpired detects login route by configured URL patterns', async () => {
  const page = fakePage('http://180.101.239.176:9443/ui/#/login', 1);

  assert.equal(await isLoginExpired(page, {
    loginUrl: 'http://180.101.239.176:9443/',
    loginExpiredUrlPatterns: ['/login', '/ui/#/login']
  }), true);
});

test('isLoginExpired ignores hidden login form fields left in the SPA DOM', async () => {
  const page = fakePageWithLoginSelector('http://180.101.239.176:9443/personal', false);

  assert.equal(await isLoginExpired(page, {
    loginExpiredSelector: 'form input[type="password"]',
    loginExpiredUrlPatterns: ['/login', '/ui/#/login']
  }), false);
});

test('isLoginExpired detects visible login form fields', async () => {
  const page = fakePageWithLoginSelector('http://180.101.239.176:9443/personal', true);

  assert.equal(await isLoginExpired(page, {
    loginExpiredSelector: 'form input[type="password"]',
    loginExpiredUrlPatterns: ['/login', '/ui/#/login']
  }), true);
});

test('getLoginExpiredReason explains visible login field matches', async () => {
  const page = fakePageWithLoginSelector('http://180.101.239.176:9443/personal', true);

  const reason = await getLoginExpiredReason(page, {
    loginExpiredSelector: 'form input[type="password"]'
  });

  assert.match(reason, /visible login selector found/);
});
