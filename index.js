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

function handleIntensityChange(data) {
  document.getElementById("intensity").innerHTML = "&nbsp;&nbsp;" + data.string;
  console.log(data);
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
  const panel = document.getElementById("tractPanel");
  const list = document.getElementById("tractList");
  const summary = document.getElementById("tractSummary");
  if (!panel || !list) {
    // fallback: no selector UI present, just load everything (old behavior)
    nv1.loadMeshes(meshes).catch(err => console.error("Error loading tcks:", err));
    return;
  }
  panel.style.display = "block";

  // map a mesh spec -> the loaded NVMesh id (null when not loaded)
  const loaded = new Map();        // meshSpec.url -> NVMesh.id
  const inflight = new Set();       // urls currently loading (prevents double clicks)
  const fmtSize = b => (b == null) ? "" :
    (b >= 1024*1024*1024 ? (b/1024/1024/1024).toFixed(1)+" GB"
     : b >= 1024*1024 ? (b/1024/1024).toFixed(0)+" MB"
     : (b/1024).toFixed(0)+" KB");

  // decide which bundles to auto-load: accumulate by size until the budget is
  // hit. Unknown sizes are treated as 0 so they don't block the budget, but if
  // sizes are entirely unknown we cap the count to avoid loading everything.
  const totalKnown = meshes.reduce((s, m) => s + (m.size || 0), 0);
  const autoload = new Set();
  if (budgetBytes > 0 && totalKnown > 0) {
    let acc = 0;
    for (const m of meshes) {
      acc += (m.size || 0);
      if (acc <= budgetBytes) autoload.add(m.url);
      else break;
    }
  } else {
    // sizes unknown - auto-load a small fixed number so the viewer isn't empty
    meshes.slice(0, 5).forEach(m => autoload.add(m.url));
  }

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
      const added = await nv1.addMeshFromUrl(spec);
      if (added) loaded.set(spec.url, added.id);
      applyFiberControlsTo(added);
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
  const selAll = document.getElementById("tractSelectAll");
  const clrAll = document.getElementById("tractClearAll");
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
  const applyAll = (key, val) => nv1.meshes.forEach(m => nv1.setMeshProperty(m.id, key, val));

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
