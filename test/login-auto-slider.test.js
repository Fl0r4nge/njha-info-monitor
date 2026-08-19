import test from 'node:test';
import assert from 'node:assert/strict';

import { persistStorageState, solveEnterpriseSlider } from '../src/login.js';

test('login storage state is persisted once and the saved value is returned', async () => {
  const expected = { cookies: [{ name: 'session', value: 'saved' }], origins: [] };
  const calls = [];
  const context = {
    storageState: async (options) => {
      calls.push(options);
      return expected;
    },
  };

  const result = await persistStorageState(context, '/tmp/gongxin-test/storage_state.json');

  assert.equal(result, expected);
  assert.deepEqual(calls, [{ path: '/tmp/gongxin-test/storage_state.json' }]);
});

test('enterprise slider is attempted automatically and retried without an opt-in flag', async () => {
  let attempts = 0;
  let pauses = 0;
  const page = {
    waitForTimeout: async () => { pauses += 1; },
  };

  const result = await solveEnterpriseSlider(page, {
    sliderAttempts: 3,
    solveSlider: async () => {
      attempts += 1;
      if (attempts < 3) throw new Error('challenge refreshed');
      return { distance: 88, confidence: 0.998 };
    },
  });

  assert.deepEqual(result, { distance: 88, confidence: 0.998 });
  assert.equal(attempts, 3);
  assert.equal(pauses, 2);
});

test('enterprise slider reports a bounded failure after all automatic attempts', async () => {
  await assert.rejects(
    solveEnterpriseSlider(
      { waitForTimeout: async () => {} },
      {
        sliderAttempts: 2,
        solveSlider: async () => { throw new Error('still visible'); },
      },
    ),
    /自动滑块验证连续失败 2 次：still visible/,
  );
});
