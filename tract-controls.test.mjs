import test from 'node:test';
import assert from 'node:assert/strict';
import { groupPalette, scalarChoices, tractOptionsFor, ungroupedGroup } from './tract-controls.js';

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

test('every group ticked sends no visibility mask, and bundle colour still colours every group', () => {
  const o = tractOptionsFor({ ...base, color: 'bundle', visibleGroups: ['A', 'B'] }, { groupNames: ['A', 'B'] });
  assert.equal(o.visibleGroups, null);
  assert.deepEqual(Object.keys(o.groupColors), ['A', 'B']);
  assert.equal(tractOptionsFor({ ...base, visibleGroups: ['B', 'A'] }, { groupNames: ['A', 'B'] }).visibleGroups, null);
});

test('an empty range box sends no calMin or calMax key', () => {
  const o = tractOptionsFor({ ...base, color: 'dpv:FA', calMin: undefined, calMax: undefined }, { groupNames: [] });
  assert.equal('calMin' in o, false); assert.equal('calMax' in o, false);
  const half = tractOptionsFor({ ...base, color: 'dpv:FA', calMin: undefined, calMax: 0.5 }, { groupNames: [] });
  assert.equal('calMin' in half, false); assert.equal(half.calMax, 0.5);
});

test('ungroupedGroup collects the streamlines that belong to no group', () => {
  const g = ungroupedGroup({ A: new Uint32Array([0, 2]), B: [3] }, 5);
  assert.equal(g.name, 'Other streamlines');
  assert.deepEqual(Array.from(g.ids), [1, 4]);
  assert.ok(g.ids instanceof Uint32Array);
  assert.equal(ungroupedGroup({ A: [0, 1] }, 2), null);
  assert.equal(ungroupedGroup({}, 3), null);
  assert.equal(ungroupedGroup(undefined, 3), null);
});

test('ungroupedGroup picks a name that is not taken', () => {
  assert.equal(ungroupedGroup({ 'Other streamlines': [0] }, 2).name, 'Other streamlines (2)');
  assert.equal(ungroupedGroup({ 'Other streamlines': [0], 'Other streamlines (2)': [1] }, 3).name, 'Other streamlines (3)');
});
