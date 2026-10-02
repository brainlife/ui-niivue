import * as niivue from "./dist/index.js";
import { volumeOptions } from "./volume-config.js";
import { attachCsdOverlay } from "./csd-overlay.js";
import { createMeshLoader } from "./mesh-loader.js";

let config = window.parent.config || window.config;
if (!config) {
  console.log("Config not set.. using debug config");
  config = {
    path: "../images/mni152.nii.gz",
  };
}

const drop = document.getElementById("sliceType");
drop.onchange = function () {
  const mode = drop.value;
  nv1.showRender = mode === "slices" ? niivue.SHOW_RENDER.NEVER : niivue.SHOW_RENDER.ALWAYS;
  nv1.sliceType = mode === "3d" ? niivue.SLICE_TYPE.RENDER : niivue.SLICE_TYPE.MULTIPLANAR;
  nv1.resize();
};

// rc.16 renders tracts as tubes; start with thin, three-sided geometry.
let fiberControlsTouched = false;

function handleIntensityChange(data) {
  const label = document.getElementById("intensity");
  if (label) label.textContent = "  " + data.string;
}

const nv1 = new niivue.NiiVue({
  backend: "webgl2",
  sliceType: niivue.SLICE_TYPE.RENDER,
  showRender: niivue.SHOW_RENDER.ALWAYS,
  isDragDropEnabled: true,
  volumeIsNearestInterpolation: config.datatype === "neuro/mask",
  isRulerVisible: true,
  is3DCrosshairVisible: true,
});

nv1.addEventListener("locationChange", event => handleIntensityChange(event.detail));
const meshLoader = createMeshLoader(nv1);
let csdOverlay;
window.addEventListener("pagehide", async () => {
  await csdOverlay?.dispose();
  await meshLoader.settled();
  nv1.destroy();
}, { once: true });

async function initializeViewer() {
await nv1.attachTo("gl1");

if (config.datatype === "neuro/tcks" || config.datatype === "neuro/track/tck") {
  // nifti.vue enumerates every .tck file and passes a colored mesh per file.
  // We do NOT load them all at once - a full tractogram can be several GB and
  // loading every bundle into WebGL memory OOMs the browser. Instead we render
  // a selectable list and lazily load/unload each bundle on demand, auto-loading
  // only a subset that fits within config.tckBudgetBytes.
  setupTractSelector(config.meshes || [], config.tckBudgetBytes || 0);
  setupFiberControls();
} else {
  await nv1.loadVolumes([volumeOptions(config)]);
  if (config.datatype === "neuro/csd") {
    csdOverlay = attachCsdOverlay(nv1, meshLoader, nv1.volumes[0]);
  }
}

}
initializeViewer().catch(error => {
  console.error("Error loading viewer:", error);
  const message = document.createElement("div");
  message.setAttribute("role", "alert");
  message.textContent = "Unable to load image: " + error.message;
  document.body.prepend(message);
});

// Build a checklist of tract bundles and load/unload them on demand so the
// browser only ever holds the geometry the user has selected. Works for any
// storage backend (osiris/local staged task, s3fs, or pub) because each bundle
// is just a URL fetched when toggled on.
function setupTractSelector(meshes, budgetBytes) {
  meshes = meshes.map((spec, index) => {
    const hue = index * 137.508 * Math.PI / 180;
    const color = [0, 2 * Math.PI / 3, 4 * Math.PI / 3].map(phase => Math.round(145 + 100 * Math.cos(hue + phase)));
    return { ...spec, rgba255: meshes.length > 1 ? spec.rgba255 || [...color, 255] : undefined };
  });
  // Build (or reuse) the selector UI. We create it in JS rather than relying on
  // markup in index.html so a stale/cached index.html can never make us fall
  // back to loading every tract at once (which OOMs and crashes the tab for
  // multi-GB tractograms).
  const ui = ensureTractPanel();
  const panel = ui.panel, list = ui.list, summary = ui.summary;
  panel.style.display = "block";

  // Map source URLs to mesh objects; indices change whenever a mesh is removed.
  const loaded = new Map();        // meshSpec.url -> mesh
  const inflight = new Set();       // urls currently loading (prevents double clicks)
  const fmtSize = b => (b == null) ? "" :
    (b >= 1024*1024*1024 ? (b/1024/1024/1024).toFixed(1)+" GB"
     : b >= 1024*1024 ? (b/1024/1024).toFixed(0)+" MB"
     : (b/1024).toFixed(0)+" KB");

  // Auto-load ONLY the first tract to keep initial memory use minimal; the user
  // selects any additional tracts on demand. This applies to every launch point
  // (publications, direct s3fs, and staged tasks) since they all route here.
  const autoload = new Set();
  if (meshes.length > 0) autoload.add(meshes[0].url);

  function rgbaToCss(c) {
    if (!c) return "#888";
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  async function loadOne(spec) {
    if (loaded.has(spec.url) || inflight.has(spec.url)) return;
    inflight.add(spec.url);
    try {
      const added = await meshLoader.add({
        url: spec.url, name: spec.name,
        tractOptions: {
          fiberRadius: 0.1, fiberSides: 3,
          ...(spec.rgba255 ? { colorBy: "fixed", fixedColor: spec.rgba255 } : {}),
        },
      });
      // Clear/uncheck during a fetch must also remove the eventual result.
      if (!spec._checkbox.checked) {
        await meshLoader.remove(added);
        return;
      }
      loaded.set(spec.url, added);
      // Preserve bundle colors until the user changes the tract controls.
      if (fiberControlsTouched) await applyFiberControlsTo(added);
    } catch (err) {
      console.error("Error loading tract", spec.name, err);
      if (spec._checkbox) spec._checkbox.checked = false;
    } finally {
      inflight.delete(spec.url);
      updateSummary();
    }
  }

  async function unloadOne(spec) {
    const mesh = loaded.get(spec.url);
    if (!mesh) return;
    loaded.delete(spec.url);
    try { await meshLoader.remove(mesh); }
    catch (error) { console.error("Unable to remove tract:", error); }
    updateSummary();
  }

  function updateSummary() {
    if (!summary) return;
    let bytes = 0;
    for (const m of meshes) if (loaded.has(m.url)) bytes += (m.size || 0);
    summary.textContent = `${loaded.size} / ${meshes.length} tracts loaded` +
      (bytes ? ` (~${fmtSize(bytes)})` : "");
  }

  // build the checklist rows
  meshes.forEach(spec => {
    const row = document.createElement("label");
    row.className = "tract-row";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = autoload.has(spec.url);
    cb.onchange = () => cb.checked ? loadOne(spec) : unloadOne(spec);

    const swatch = document.createElement("span");
    swatch.className = "tract-swatch";
    swatch.style.background = rgbaToCss(spec.rgba255);

    const label = document.createElement("span");
    label.className = "tract-name";
    label.textContent = spec.name;

    const size = document.createElement("span");
    size.className = "tract-size";
    size.textContent = fmtSize(spec.size);

    row.append(cb, swatch, label, size);
    list.appendChild(row);

    spec._checkbox = cb;
  });

  // select-all / clear-all
  const selAll = ui.selectAll;
  const clrAll = ui.clearAll;
  if (selAll) selAll.onclick = () => {
    if (meshes.length > 10 &&
        !confirm(`Load all ${meshes.length} tracts? This may use a lot of memory and could crash the tab for large tractograms.`)) return;
    meshes.forEach(spec => { if (!loaded.has(spec.url)) { spec._checkbox.checked = true; loadOne(spec); } });
  };
  if (clrAll) clrAll.onclick = () =>
    meshes.forEach(spec => { spec._checkbox.checked = false; void unloadOne(spec); });

  // kick off the auto-load subset sequentially (avoids hammering the network /
  // WebGL with many concurrent mesh uploads)
  (async () => {
    for (const spec of meshes) {
      if (autoload.has(spec.url)) await loadOne(spec);
    }
  })();
  updateSummary();
}

// Get the tract selector DOM, creating it if index.html doesn't provide it.
// Returns {panel, list, summary, selectAll, clearAll}. Building it here means we
// never depend on a redeployed/uncached index.html and never fall back to
// loading every tract at once.
function ensureTractPanel() {
  let panel = document.getElementById("tractPanel");
  if (!panel) {
    const host = document.getElementById("canvas-container") || document.body;
    if (getComputedStyle(host).position === "static") host.style.position = "relative";

    panel = document.createElement("aside");
    panel.id = "tractPanel";
    Object.assign(panel.style, {
      display: "none", position: "absolute", top: "0", left: "0",
      width: "260px", maxHeight: "100%", overflowY: "auto",
      background: "rgba(255,255,255,0.92)", borderRight: "1px solid #ccc",
      boxSizing: "border-box", padding: "8px", fontSize: "12px", zIndex: "10",
    });

    const h = document.createElement("h4");
    h.textContent = "Tracts";
    h.style.margin = "0 0 6px";

    const actions = document.createElement("div");
    Object.assign(actions.style, { display: "flex", gap: "6px", marginBottom: "6px" });
    const selectAll = document.createElement("button");
    selectAll.id = "tractSelectAll"; selectAll.type = "button"; selectAll.textContent = "Select all";
    const clearAll = document.createElement("button");
    clearAll.id = "tractClearAll"; clearAll.type = "button"; clearAll.textContent = "Clear all";
    [selectAll, clearAll].forEach(b => Object.assign(b.style, { flex: "1", cursor: "pointer", fontSize: "11px", padding: "2px 4px" }));
    actions.append(selectAll, clearAll);

    const summary = document.createElement("div");
    summary.id = "tractSummary";
    Object.assign(summary.style, { color: "#555", marginBottom: "6px", fontSize: "11px" });

    const list = document.createElement("div");
    list.id = "tractList";

    panel.append(h, actions, summary, list);
    host.appendChild(panel);

    injectTractStyles();
    return { panel, list, summary, selectAll, clearAll };
  }
  injectTractStyles();
  return {
    panel,
    list: document.getElementById("tractList") || panel,
    summary: document.getElementById("tractSummary"),
    selectAll: document.getElementById("tractSelectAll"),
    clearAll: document.getElementById("tractClearAll"),
  };
}

// Inject the row styles once (only needed when the panel was built in JS and
// index.html lacks the matching CSS).
function injectTractStyles() {
  if (document.getElementById("tractSelectorStyles")) return;
  const style = document.createElement("style");
  style.id = "tractSelectorStyles";
  style.textContent = `
    .tract-row { display:flex; align-items:center; gap:6px; padding:2px 0; cursor:pointer; }
    .tract-swatch { display:inline-block; width:10px; height:10px; border-radius:2px; flex:0 0 auto; }
    .tract-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .tract-size { color:#888; flex:0 0 auto; }
  `;
  document.head.appendChild(style);
}

// New tract controls use typed options and the mesh's current index.
async function applyFiberControlsTo(mesh) {
  const index = nv1.meshes.indexOf(mesh);
  if (index < 0) return;
  const mode = document.getElementById("fiberColor").value;
  const scalar = Object.keys(mesh.trx?.dpv || {})[0];
  await nv1.setTractOptions(index, {
    fiberRadius: Number(document.getElementById("fiberRadius").value) / 10,
    fiberSides: 3,
    decimation: Number(document.getElementById("fiberDecimation").value),
    colorBy: mode === "Global" ? "global" : mode === "Fixed" ? "fixed" :
      mode === "DPV0" && scalar ? `dpv:${scalar}` : "",
    colormap: document.getElementById("fiberColormap").value,
    calMin: Number(document.getElementById("fiberCalMin").value),
  });
}

function setupFiberControls() {
  const apply = async () => {
    fiberControlsTouched = true;
    try {
      for (const mesh of nv1.meshes.slice()) await applyFiberControlsTo(mesh);
    } catch (error) { console.error("Unable to update tracts:", error); }
  };
  for (const id of ["fiberRadius", "fiberDecimation", "fiberColor", "fiberColormap", "fiberCalMin"])
    document.getElementById(id).onchange = apply;
}

// These controls map directly to the new reactive viewer properties.
document.getElementById("layoutSelect").onchange = event => { nv1.multiplanarType = Number(event.target.value); };
document.getElementById("equalCheck").onchange = event => { nv1.isEqualSize = event.target.checked; };
