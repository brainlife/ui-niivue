import { glyphMeshFile } from "./csd-mesh.js";
import { createCsdSampler, buildGlyphs } from "./csd-glyphs.js";

export function attachCsdOverlay(nv, meshLoader, volume) {
  const sampler = createCsdSampler(volume);
  // Keep the slice-plane glyphs visible inside the opaque 3D background.
  nv.meshXRay = 1;
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
  const clear = async () => {
    if (mesh) {
      const old = mesh;
      mesh = null;
      await meshLoader.remove(old);
    }
  };
  const request = () => {
    const crosshair = nv.getCrosshairPos();
    const key = JSON.stringify([crosshair, visible.checked, size.value]);
    if (key === lastKey) return;
    lastKey = key;
    const current = ++generation;
    clearTimeout(timer);
    if (!visible.checked) {
      void clear().catch(error => { status.textContent = error.message; });
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
        await clear();
        if (current !== generation) return;
        if (geometry.glyphs) {
          const added = await meshLoader.add({
            url: glyphMeshFile(geometry),
            name: "CSD orientation glyphs",
            isColorbarVisible: false,
          });
          if (current !== generation) {
            await meshLoader.remove(added);
            return;
          }
          mesh = added;
          nv.meshThicknessOn2D = geometry.step * 0.5;
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
  nv.addEventListener("locationChange", request);
  request();
  return {
    refresh: request,
    async dispose() {
      generation++;
      clearTimeout(timer);
      nv.removeEventListener("locationChange", request);
      await clear();
      controls.remove();
    },
  };
}
