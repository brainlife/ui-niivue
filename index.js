import * as niivue from "./dist/index.js";
// import { Niivue } from "@niivue/niivue";

let config = window.parent.config || window.config;
if (!config) {
  console.log("Config not set.. using debug config");
  config = {
    path: "../images/mni152.nii.gz", 
  };
}

const drop = document.getElementById("sliceType");
drop.onchange = function () {
  const st = parseInt(document.getElementById("sliceType").value);
  nv1.setSliceType(st);
}

// Tracts render as light streamlines by default (matching brainlife-lite); only
// switch to the heavier tube/colormap rendering once the user touches a slider.
let fiberControlsTouched = false;

function handleIntensityChange(data) {
  document.getElementById("intensity").innerHTML = "&nbsp;&nbsp;" + data.string;
}

const volumeList1 = [
  { 
    url: config.path, // Use the dynamic path from the config object
    colormap: "gray",
    visible: true,
  }, 
];

const nv1 = new niivue.Niivue({
  dragAndDropEnabled: true,
  onLocationChange: handleIntensityChange, 
  isRuler: true, 
  show3Dcrosshair: true, 
});

nv1.attachTo("gl1");

if (config.datatype === "neuro/tcks" || config.datatype === "neuro/track/tck") {
  // nifti.vue enumerates every .tck file and passes a colored mesh per file.
  // We do NOT load them all at once - a full tractogram can be several GB and
  // loading every bundle into WebGL memory OOMs the browser. Instead we render
  // a selectable list and lazily load/unload each bundle on demand, auto-loading
  // only a subset that fits within config.tckBudgetBytes.
  nv1.setSliceType(nv1.sliceTypeMultiplanar);
  setupTractSelector(config.meshes || [], config.tckBudgetBytes || 0);
  setupFiberControls();
} else {
  nv1.loadVolumes(volumeList1).then(() => {
    nv1.setSliceType(nv1.sliceTypeMultiplanar);
  }).catch((error) => {
    console.error("Error loading volumes:", error);
  });
}

// Build a checklist of tract bundles and load/unload them on demand so the
// browser only ever holds the geometry the user has selected. Works for any
// storage backend (osiris/local staged task, s3fs, or pub) because each bundle
// is just a URL fetched when toggled on.
function setupTractSelector(meshes, budgetBytes) {
  // Build (or reuse) the selector UI. We create it in JS rather than relying on
  // markup in index.html so a stale/cached index.html can never make us fall
  // back to loading every tract at once (which OOMs and crashes the tab for
  // multi-GB tractograms).
  const ui = ensureTractPanel();
  const panel = ui.panel, list = ui.list, summary = ui.summary;
  panel.style.display = "block";

  // map a mesh spec -> the loaded NVMesh id (null when not loaded)
  const loaded = new Map();        // meshSpec.url -> NVMesh.id
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
      // addMeshFromUrl appends a single mesh and returns it WITHOUT clearing the
      // existing meshes (unlike loadMeshes, which resets nv1.meshes first).
      // Pass only the fields niivue expects - never the _checkbox DOM node.
      const added = await nv1.addMeshFromUrl({
        url: spec.url, name: spec.name, rgba255: spec.rgba255,
      });
      if (added) loaded.set(spec.url, added.id);
      // Only apply fiber controls once the user has moved a slider off its
      // default; forcing fiberRadius>0 up front renders every streamline as a
      // tube (heavy geometry) and hangs the page for large tractograms.
      if (fiberControlsTouched) applyFiberControlsTo(added);
    } catch (err) {
      console.error("Error loading tract", spec.name, err);
      if (spec._checkbox) spec._checkbox.checked = false;
    } finally {
      inflight.delete(spec.url);
      updateSummary();
    }
  }

  function unloadOne(spec) {
    const id = loaded.get(spec.url);
    if (id == null) return;
    const mesh = nv1.meshes.find(m => m.id === id);
    if (mesh) nv1.removeMesh(mesh);
    loaded.delete(spec.url);
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
    meshes.forEach(spec => { if (loaded.has(spec.url)) { spec._checkbox.checked = false; unloadOne(spec); } });

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

// apply the current fiber control values to a single mesh (used when a tract is
// lazily added after the controls were already set).
function applyFiberControlsTo(mesh) {
  if (!mesh) return;
  const radius = document.getElementById("fiberRadius");
  if (radius) nv1.setMeshProperty(mesh.id, "fiberRadius", radius.value / 10);
  const dither = document.getElementById("fiberDitherSlider");
  if (dither) nv1.setMeshProperty(mesh.id, "fiberDither", dither.value / 10);
  const color = document.getElementById("fiberColor");
  if (color) nv1.setMeshProperty(mesh.id, "fiberColor", color.value);
}

// wire up the fiber (.tck) display controls already present in index.html
function setupFiberControls() {
  const applyAll = (key, val) => {
    fiberControlsTouched = true;
    nv1.meshes.forEach(m => nv1.setMeshProperty(m.id, key, val));
  };

  const radius = document.getElementById("fiberRadius");
  if (radius) radius.oninput = () => applyAll("fiberRadius", radius.value / 10);

  const dither = document.getElementById("fiberDitherSlider");
  if (dither) dither.oninput = () => applyAll("fiberDither", dither.value / 10);

  const color = document.getElementById("fiberColor");
  if (color) color.onchange = () => applyAll("fiberColor", color.value);

  const colormap = document.getElementById("fiberColormap");
  if (colormap) colormap.onchange = () => applyAll("colormap", colormap.value);

  const calMin = document.getElementById("fiberCalMin");
  if (calMin) calMin.oninput = () => applyAll("fiberLength", parseFloat(calMin.value));
}
