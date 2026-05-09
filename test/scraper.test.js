import test from 'node:test';
import assert from 'node:assert/strict';

import { extractProjectFromRow } from '../src/scraper.js';

test('extractProjectFromRow reads configured fields from a Playwright-like row', async () => {
  const row = fakeRow({
    '.name': ' 项目A ',
    '.enterprise': '企业A',
    '.status': ' 市级审核中 ',
    '.step': '市级审核',
    '.updated': '2026-05-09 10:00',
    '.detail': '查看'
  }, {
    '.detail': 'https://example.test/detail/1'
  });

  const project = await extractProjectFromRow(row, {
    fields: {
      name: '.name',
      enterprise: '.enterprise',
      status: '.status',
      step: '.step',
      updatedAt: '.updated'
    },
    detailUrl: '.detail'
  });

  assert.deepEqual(project, {
    id: '企业A::项目A',
    name: '项目A',
    enterprise: '企业A',
    status: '市级审核中',
    step: '市级审核',
    updatedAt: '2026-05-09 10:00',
    detailUrl: 'https://example.test/detail/1'
  });
});

function fakeRow(textBySelector, hrefBySelector = {}) {
  return {
    locator(selector) {
      return {
        async count() {
          return Object.hasOwn(textBySelector, selector) || Object.hasOwn(hrefBySelector, selector) ? 1 : 0;
        },
        first() {
          return this;
        },
        async innerText() {
          return textBySelector[selector] || '';
        },
        async getAttribute(name) {
          return name === 'href' ? hrefBySelector[selector] || null : null;
        }
      };
    }
  };
}
