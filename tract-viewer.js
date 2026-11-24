import { tractFiles } from "./tract-config.js";
import { groupPalette, scalarChoices, tractOptionsFor } from "./tract-controls.js";

// rc.16 renders tracts as tubes; start with thin, three-sided geometry.
const TRACT_OPTIONS = { fiberRadius: 0.1, fiberSides: 3 };

function ensureBanner() {
  let banner = document.getElementById("tractBanner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "tractBanner";
    banner.setAttribute("role", "status");
    document.body.prepend(banner);
  }
  return banner;
}

export async function startTractViewer(nv, meshLoader, config) {
  const files = tractFiles(config);
  if (config.datatype === "neuro/track/zarr-vectors") {
    ensureBanner().textContent = "Zarr Vectors support is coming";
    return;
  }
  setupViewControls(nv);
  if (config.background?.url) {
    try {
      await nv.loadVolumes([{ url: config.background.url, name: config.background.name, colormap: "gray" }]);
    } catch (error) {
      console.error("Unable to load background image:", error);
      ensureBanner().textContent = "Background image could not be loaded";
    }
  }
  const legacy = config.datatype === "neuro/tcks" || (config.datatype === "neuro/track/tck" && !config.files);
  if (legacy) {
    // nifti.vue enumerates every .tck file and passes a colored mesh per file.
    // We do NOT load them all at once - a full tractogram can be several GB.
    // A selectable list lazily loads/unloads each bundle on demand.
    setupTractSelector(nv, meshLoader, files, createTractControls(nv));
    return;
  }
  const controls = createTractControls(nv);
  const file = files[0];
  if (!file) return;
  const mesh = await meshLoader.add({ url: file.url, name: file.name, tractOptions: { ...TRACT_OPTIONS } });
  await controls.register(mesh, {});
}

// Build a checklist of tract bundles and load/unload them on demand so the
// browser only ever holds the geometry the user has selected. Works for any
// storage backend (osiris/local staged task, s3fs, or pub) because each bundle
// is just a URL fetched when toggled on.
function setupTractSelector(nv1, meshLoader, meshes, controls) {
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
      // "bundle" colour means each file in its own colour; a lone file is not recoloured.
      await controls.register(added, { fileColor: spec.rgba255, defaultColor: meshes.length > 1 ? "bundle" : "global" });
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
    controls.unregister(mesh);
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

// Clip plane and screenshot. A depth of 2 lies outside the volume, which disables the plane.
function setupViewControls(nv) {
  const clipCheck = document.getElementById("clipCheck");
  const clipDepth = document.getElementById("clipDepth");
  const screenshot = document.getElementById("screenshotBtn");
  document.getElementById("tractViewControls").hidden = false;
  const applyClip = () => {
    if (clipCheck.checked) nv.setClipPlaneDepthAziElev(Number(clipDepth.value), 270, 0);
    else nv.setClipPlaneDepthAziElev(2, 0, 0);
  };
  clipCheck.addEventListener("change", applyClip);
  clipDepth.addEventListener("input", applyClip);
  screenshot.addEventListener("click", () => nv.saveBitmap("tracts.png"));
}

const byId = id => document.getElementById(id);
const round = value => Number(Number(value).toPrecision(6));

// Wires the header controls (and, for TRX files with groups, the group list) to
// every tract mesh that has been registered. One apply() reads the current
// control state, so changes made while a file is still loading are not lost.
function createTractControls(nv) {
  const registry = new Map();      // mesh -> { fileColor }
  let touched = false;             // the user has chosen a colour mode
  let groups = null;               // { names, checks } for the single TRX file's group list

  const numberOrUndefined = id => { const v = byId(id).value; return v === "" ? undefined : Number(v); };
  function state() {
    return {
      color: byId("fiberColor").value,
      colormap: byId("fiberColormap").value,
      calMin: numberOrUndefined("fiberCalMin"),
      calMax: numberOrUndefined("fiberCalMax"),
      radius: Number(byId("fiberRadius").value) || 0.1,
      stride: Number(byId("fiberDecimation").value) || 1,
      minLength: Number(byId("fiberMinLength").value) || 0,
      visibleGroups: groups ? groups.names.filter((name, i) => groups.checks[i].checked) : [],
    };
  }

  async function applyTo(mesh) {
    const index = nv.meshes.indexOf(mesh);
    const info = registry.get(mesh);
    if (index < 0 || !info) return;
    const groupNames = Object.keys(mesh.trx?.groups || {});
    const current = state();
    await nv.setTractOptions(index, tractOptionsFor(current, { groupNames, fileColor: info.fileColor }));
    // Indices shift when a mesh is removed during the await above; resolve again.
    const latest = nv.meshes.indexOf(mesh);
    if (latest < 0) return;
    const hidden = groupNames.length > 0 && current.visibleGroups.length === 0;
    nv.setMesh(latest, { opacity: Number(byId("fiberOpacity").value), visible: !hidden });
  }
  async function apply() {
    try { for (const mesh of [...registry.keys()]) await applyTo(mesh); }
    catch (error) { console.error("Unable to update tracts:", error); }
  }

  function scalarMeta(value) {
    const [kind, name] = [value.slice(0, 3), value.slice(4)];
    for (const mesh of registry.keys()) {
      const meta = mesh.trx?.[kind + "Meta"]?.[name];
      if (meta) return meta;
    }
  }
  function prefillRange() {
    const meta = scalarMeta(byId("fiberColor").value);
    if (!meta) return;
    byId("fiberCalMin").value = round(meta.globalMin);
    byId("fiberCalMax").value = round(meta.globalMax);
  }

  function refreshChoices() {
    const select = byId("fiberColor");
    const wanted = select.value;
    for (const option of [...select.options]) if (/^dp[vs]:/.test(option.value)) option.remove();
    const seen = new Set();
    for (const mesh of registry.keys()) for (const choice of scalarChoices(mesh.trx)) {
      if (seen.has(choice.value)) continue;
      seen.add(choice.value);
      select.add(new Option(choice.label, choice.value));
    }
    select.value = [...select.options].some(o => o.value === wanted) ? wanted : "global";
  }

  function buildGroupList(mesh) {
    const names = Object.keys(mesh.trx?.groups || {});
    if (!names.length || groups) return;
    const ui = ensureTractPanel();
    const palette = groupPalette(names);
    ui.panel.style.display = "block";
    const heading = ui.panel.querySelector("h4");
    if (heading) heading.textContent = "Groups";
    ui.selectAll.textContent = "Show all";
    ui.clearAll.textContent = "Hide all";
    const checks = names.map(name => {
      const row = document.createElement("label");
      row.className = "tract-row";
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = true;
      cb.onchange = () => { touched = true; apply(); };
      const swatch = document.createElement("span");
      swatch.className = "tract-swatch";
      swatch.style.background = `rgb(${palette[name].slice(0, 3).join(",")})`;
      const label = document.createElement("span");
      label.className = "tract-name"; label.textContent = name;
      const count = document.createElement("span");
      count.className = "tract-size"; count.textContent = String(mesh.trx.groups[name].length);
      row.append(cb, swatch, label, count);
      ui.list.appendChild(row);
      return cb;
    });
    groups = { names, checks };
    if (ui.summary) ui.summary.textContent = `${names.length} groups`;
    const setAll = value => () => { checks.forEach(cb => { cb.checked = value; }); touched = true; apply(); };
    ui.selectAll.onclick = setAll(true);
    ui.clearAll.onclick = setAll(false);
  }

  async function register(mesh, { fileColor, defaultColor } = {}) {
    registry.set(mesh, { fileColor });
    refreshChoices();
    if (!touched) {
      const hasGroups = Object.keys(mesh.trx?.groups || {}).length > 0;
      byId("fiberColor").value = defaultColor || (hasGroups ? "bundle" : "global");
    }
    buildGroupList(mesh);
    prefillRange();
    await applyTo(mesh);
  }
  function unregister(mesh) { registry.delete(mesh); }

  byId("fiberColor").addEventListener("change", () => { touched = true; prefillRange(); apply(); });
  for (const id of ["fiberRadius", "fiberDecimation", "fiberMinLength", "fiberColormap", "fiberCalMin", "fiberCalMax", "fiberOpacity"])
    byId(id).addEventListener("change", apply);
  byId("fiberOpacity").addEventListener("input", apply);

  return { register, unregister, apply };
}
