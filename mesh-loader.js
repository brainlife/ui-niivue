// addMesh can swallow load failures.
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
