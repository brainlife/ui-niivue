import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { createMeshLoader } = await import('data:text/javascript;base64,' + readFileSync(new URL('./mesh-loader.js', import.meta.url)).toString('base64'));
test('rejects swallowed failures instead of reusing the last loaded mesh', async () => {
  const existing = { url: 'existing.tck' };
  const nv = { meshes: [existing], async addMesh() { return this; } };
  await assert.rejects(createMeshLoader(nv).add({ url: 'missing.tck' }), /Failed to load/);
});
test('serializes additions and resolves removal indices at execution time', async () => {
  const removed = [];
  const nv = { meshes: [], async addMesh(options) { this.meshes.push({ url: options.url }); return this; }, async removeMesh(index) { removed.push(index); this.meshes.splice(index,1); } };
  const loader = createMeshLoader(nv);
  const [a,b] = await Promise.all([loader.add({url:'a.tck'}),loader.add({url:'b.tck'})]);
  await Promise.all([loader.remove(a),loader.remove(b)]);
  assert.deepEqual(removed,[0,0]);
  assert.equal(nv.meshes.length,0);
});
