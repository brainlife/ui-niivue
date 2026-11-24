import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACT_DATATYPES, isTractDatatype, tractFiles, planLoad, formatSize, DEFAULT_BUDGET_BYTES } from './tract-config.js';

test('tract datatypes', () => {
  assert.deepEqual(TRACT_DATATYPES.filter(isTractDatatype).length, 5);
  assert.equal(isTractDatatype('neuro/anat/t1w'), false);
  assert.equal(isTractDatatype(undefined), false);
});
test('legacy meshes become files', () => {
  assert.deepEqual(tractFiles({ meshes: [{ url: 'a.tck', name: 'a', size: 3 }] }), [{ url: 'a.tck', name: 'a', size: 3 }]);
});
test('files win over meshes, and neither gives an empty list', () => {
  const files = [{ url: 'f.trx', name: 'f' }];
  assert.deepEqual(tractFiles({ files, meshes: [{ url: 'm', name: 'm' }] }), files);
  assert.deepEqual(tractFiles({}), []);
});
test('planLoad', () => {
  assert.equal(planLoad({ url: 'x' }, 10), 'full');
  assert.equal(planLoad({ url: 'x', size: 10 }, 10), 'full');
  assert.equal(planLoad({ url: 'x', size: 11, previewUrl: 'p' }, 10), 'preview');
  assert.equal(planLoad({ url: 'x', size: 11 }, 10), 'ask');
});
test('planLoad defaults to a 600 MiB budget', () => {
  assert.equal(DEFAULT_BUDGET_BYTES, 600 * 1024 * 1024);
  assert.equal(planLoad({ url: 'x', size: DEFAULT_BUDGET_BYTES }), 'full');
  assert.equal(planLoad({ url: 'x', size: DEFAULT_BUDGET_BYTES + 1 }), 'ask');
});
test('sizes format like the tract list', () => {
  assert.equal(formatSize(null), '');
  assert.equal(formatSize(2048), '2 KB');
  assert.equal(formatSize(5 * 1024 * 1024), '5 MB');
  assert.equal(formatSize(1.5 * 1024 ** 3), '1.5 GB');
});
