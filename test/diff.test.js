import test from 'node:test';
import assert from 'node:assert/strict';

import { diffProjects } from '../src/diff.js';

test('diffProjects reports added, removed, and changed projects', () => {
  const previous = [
    { id: 'A', name: '项目A', enterprise: '企业A', status: '待区级审核', step: '区级审核' },
    { id: 'B', name: '项目B', enterprise: '企业B', status: '市级审核中', step: '市级审核' },
    { id: 'C', name: '项目C', enterprise: '企业C', status: '已通过', step: '完成' }
  ];
  const current = [
    { id: 'A', name: '项目A', enterprise: '企业A', status: '市级审核中', step: '市级审核' },
    { id: 'B', name: '项目B', enterprise: '企业B', status: '市级审核中', step: '市级审核' },
    { id: 'D', name: '项目D', enterprise: '企业D', status: '待提交', step: '填报' }
  ];

  const changes = diffProjects(previous, current);

  assert.deepEqual(changes, [
    {
      type: 'changed',
      id: 'A',
      before: previous[0],
      after: current[0],
      changedFields: ['status', 'step']
    },
    { type: 'added', id: 'D', after: current[2] },
    { type: 'removed', id: 'C', before: previous[2] }
  ]);
});

test('diffProjects uses stable fallback identity when id is absent', () => {
  const previous = [{ name: '项目A', enterprise: '企业A', status: '待审核' }];
  const current = [{ name: '项目A', enterprise: '企业A', status: '已通过' }];

  const changes = diffProjects(previous, current);

  assert.equal(changes.length, 1);
  assert.equal(changes[0].type, 'changed');
  assert.equal(changes[0].id, '企业A::项目A');
});
