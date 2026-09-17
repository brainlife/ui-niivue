import { createCsdSampler, buildGlyphs } from "./csd-glyphs.js";

export function attachCsdOverlay(nv, NVMesh, volume) {
  const sampler = createCsdSampler(volume);
  const controls = document.createElement("span");
  controls.id = "csd-controls";
  controls.innerHTML =
    '<label><input id="csd-visible" type="checkbox" checked> CSD glyphs</label> <label>Glyph size <input id="csd-size" type="range" min="0.2" max="1.5" step="0.1" value="0.8"></label> <span id="csd-status" role="status"></span>';
  controls.title =
    "MRtrix3 orientation glyphs, normalized per voxel. Red: left/right; green: anterior/posterior; blue: superior/inferior. Sampling is reduced to keep slice navigation responsive.";
  document.querySelector("header").append(controls);
  const visible = controls.querySelector("#csd-visible"),
    size = controls.querySelector("#csd-size"),
    status = controls.querySelector("#csd-status");
  let generation = 0,
    timer,
    mesh,
    lastKey = "";
  const clear = () => {
    if (mesh) {
      const old = mesh;
      mesh = null;
      nv.removeMesh(old);
    }
  };
  const request = () => {
    const crosshair = Array.from(nv.frac2mm(nv.scene.crosshairPos)).slice(0, 3);
    const key = JSON.stringify([crosshair, visible.checked, size.value]);
    if (key === lastKey) return;
    lastKey = key;
    const current = ++generation;
    clearTimeout(timer);
    if (!visible.checked) {
      clear();
      status.textContent = "";
      return;
    }
    status.textContent = "Updating glyphs…";
    timer = setTimeout(async () => {
      try {
        const geometry = await buildGlyphs(sampler, crosshair, {
          scale: Number(size.value),
          cancelled: () => current !== generation,
        });
        if (!geometry || current !== generation) return;
        clear();
        if (geometry.glyphs) {
          mesh = new NVMesh(
            geometry.positions,
            geometry.triangles,
            "CSD orientation glyphs",
            geometry.colors,
            1,
            true,
            nv.gl,
          );
          mesh.colorbarVisible = false;
          nv.setMeshThicknessOn2D(geometry.step * 0.5);
          nv.addMesh(mesh);
        }
        status.textContent = geometry.glyphs
          ? `${geometry.glyphs} glyphs`
          : "No CSD signal on these slices";
      } catch (error) {
        status.textContent = "Unable to draw CSD glyphs: " + error.message;
      }
    }, 80);
  };
  visible.addEventListener("change", request);
  size.addEventListener("input", request);
  const previous = nv.onLocationChange;
  nv.onLocationChange = (data) => {
    previous(data);
    request();
  };
  request();
  return {
    refresh: request,
    dispose() {
      generation++;
      clearTimeout(timer);
      nv.onLocationChange = previous;
      clear();
      controls.remove();
    },
  };
}
