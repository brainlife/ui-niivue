import test from 'node:test';
import assert from 'node:assert/strict';
import { groupPalette, scalarChoices, tractOptionsFor } from './tract-controls.js';

const base = { color: 'global', colormap: 'inferno', calMin: 0.2, calMax: 0.9, radius: 0.1, stride: 2, minLength: 10, visibleGroups: [] };

test('groupPalette gives golden-angle colours by index', () => {
  const p = groupPalette(['A', 'B', 'C']);
  assert.deepEqual(Object.keys(p), ['A', 'B', 'C']);
  const expected = i => [0, 2 * Math.PI / 3, 4 * Math.PI / 3].map(ph => Math.round(145 + 100 * Math.cos(i * 137.508 * Math.PI / 180 + ph))).concat(255);
  assert.deepEqual(p.B, expected(1)); assert.deepEqual(p.C, expected(2));
  for (const c of Object.values(p)) { assert.equal(c.length, 4); assert.equal(c[3], 255); }
  assert.notDeepEqual(p.A, p.B);
  assert.deepEqual(groupPalette(['X']).X, p.A);
});

test('scalarChoices labels per-point and per-streamline scalars', () => {
  const trx = { dpv: { FA: new Float32Array(1) }, dps: { len: new Float32Array(1) } };
  assert.deepEqual(scalarChoices(trx), [
    { value: 'dpv:FA', label: 'FA (per point)' },
    { value: 'dps:len', label: 'len (per streamline)' },
  ]);
  assert.deepEqual(scalarChoices(undefined), []);
  assert.deepEqual(scalarChoices({}), []);
});

test('local and global direction colouring', () => {
  assert.equal(tractOptionsFor({ ...base, color: 'local' }, { groupNames: [] }).colorBy, '');
  assert.equal(tractOptionsFor({ ...base, color: 'global' }, { groupNames: [] }).colorBy, 'global');
});

test('scalar colouring passes colormap and range through', () => {
  const o = tractOptionsFor({ ...base, color: 'dpv:FA' }, { groupNames: [] });
  assert.equal(o.colorBy, 'dpv:FA'); assert.equal(o.colormap, 'inferno'); assert.equal(o.calMin, 0.2); assert.equal(o.calMax, 0.9);
  assert.equal(tractOptionsFor({ ...base, color: 'dps:len' }, { groupNames: [] }).colorBy, 'dps:len');
});

test('common options are always set', () => {
  const o = tractOptionsFor(base, { groupNames: ['A'] });
  assert.equal(o.fiberRadius, 0.1); assert.equal(o.fiberSides, 3); assert.equal(o.decimation, 2); assert.equal(o.minLength, 10);
  assert.deepEqual(o.visibleGroups, []);
  assert.equal(tractOptionsFor(base, { groupNames: [] }).visibleGroups, null);
});

test('bundle colour without groups falls back to a fixed colour', () => {
  const o = tractOptionsFor({ ...base, color: 'bundle', visibleGroups: [] }, { groupNames: [], fileColor: [1, 2, 3, 255] });
  assert.equal(o.colorBy, 'fixed'); assert.deepEqual(o.fixedColor, [1, 2, 3, 255]); assert.equal(o.groupColors, null); assert.equal(o.visibleGroups, null);
  assert.deepEqual(tractOptionsFor({ ...base, color: 'bundle' }, { groupNames: [] }).fixedColor, [255, 255, 255, 255]);
});

test('bundle colour with groups colours only visible groups', () => {
  const o = tractOptionsFor({ ...base, color: 'bundle', visibleGroups: ['B'] }, { groupNames: ['A', 'B'] });
  assert.deepEqual(Object.keys(o.groupColors), ['B']);
  assert.deepEqual(o.groupColors.B, groupPalette(['A', 'B']).B);
  assert.deepEqual(o.visibleGroups, ['B']);
});

test('non-bundle colouring leaves group colours unset but keeps group visibility', () => {
  const o = tractOptionsFor({ ...base, color: 'global', visibleGroups: ['A'] }, { groupNames: ['A', 'B'] });
  assert.equal(o.groupColors, null); assert.deepEqual(o.visibleGroups, ['A']);
});

test('fixed colour uses the file colour', () => {
  const o = tractOptionsFor({ ...base, color: 'fixed' }, { groupNames: [], fileColor: [9, 9, 9, 255] });
  assert.equal(o.colorBy, 'fixed'); assert.deepEqual(o.fixedColor, [9, 9, 9, 255]);
});
