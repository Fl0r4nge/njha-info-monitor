import test from 'node:test';
import assert from 'node:assert/strict';

import { isLoginComplete } from '../src/login-state.js';

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
    getByText() {
      return {
        async count() {
          return visibleCount;
        }
      };
    }
  };
}
