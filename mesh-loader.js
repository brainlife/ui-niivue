// rc.16 returns the viewer from addMesh and can swallow load failures.
// Track mesh objects, then resolve their current index immediately before removal.
export function createMeshLoader(nv) {
  let tail = Promise.resolve();
  const enqueue = (operation) => {
    const result = tail.then(operation);
    tail = result.catch(() => {});
    return result;
  };
  return {
    add(options) {
      return enqueue(async () => {
        const previous = new Set(nv.meshes);
        await nv.addMesh(options);
        const url = typeof options.url === 'string' ? options.url : options.url.name;
        const mesh = nv.meshes.find(item => !previous.has(item) && item.url === url);
        if (!mesh) throw new Error(`Failed to load ${options.name || url}`);
        await repairTckOffsets(nv, mesh);
        return mesh;
      });
    },
    remove(mesh) {
      return enqueue(async () => {
        const index = nv.meshes.indexOf(mesh);
        if (index >= 0) await nv.removeMesh(index);
      });
    },
    settled() { return tail; },
  };
}

// rc.16 overwrites the initial TCK fencepost and repeats the final one.
// Keep every vertex and restore the original streamline boundaries.
export async function repairTckOffsets(nv, mesh) {
  const tract = mesh.trx;
  if (!/\.tck(?:[?#]|$)/i.test(mesh.url || '') || !tract || tract.offsets[0] === 0) return;
  const old = tract.offsets;
  if (!old.length) return;
  const duplicate = old.length > 1 && old[old.length - 1] === old[old.length - 2];
  const offsets = new Uint32Array(old.length + (duplicate ? 0 : 1));
  offsets.set(duplicate ? old.subarray(0, -1) : old, 1);
  tract.offsets = offsets;
  await nv.setTractOptions(nv.meshes.indexOf(mesh), {});
}
