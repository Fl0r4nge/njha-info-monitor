import test from 'node:test';
import assert from 'node:assert/strict';

import { runNavigationSteps } from '../src/navigation.js';

test('runNavigationSteps clicks configured selectors in order', async () => {
  const clicks = [];
  const page = {
    locator(selector) {
      return fakeLocator(selector, clicks);
    },
    async waitForLoadState() {}
  };

  await runNavigationSteps(page, [
    { selector: '.parent-menu' },
    { selector: '.child-menu', nth: 1 }
  ]);

  assert.deepEqual(clicks, ['.parent-menu#0', '.child-menu#1']);
});

function fakeLocator(selector, clicks) {
  return {
    async count() {
      return selector === '.child-menu' ? 2 : 1;
    },
    nth(index) {
      return {
        async click() {
          clicks.push(`${selector}#${index}`);
        }
      };
    }
  };
}
