# Tractography viewer (ui-niivue) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ui-niivue opens TRX, TCK, TRK (and the `neuro/tcks` collection) as a tractography viewer with 3D + slice views, tract/group selection, display controls and a memory budget, on NiiVue 1.0 rc.238.

**Architecture:** `index.js` gets its config from the host (today's `window.parent.config`, or a `postMessage` from an allowed origin), then either runs today's volume/mask/CSD path or the new tract mode. Tract mode lives in `tract-viewer.js` and uses three small pure modules (`tract-config.js`, `tract-controls.js`, `config-channel.js`) that carry the logic and are unit-tested with `node --test`; browser behaviour is tested with Playwright against tiny generated fixtures.

**Tech Stack:** plain ES modules, no framework; `@niivue/niivue@1.0.0-rc.238` and `@niivue/nv-ext-tile@1.0.0-rc.147` bundled by esbuild into `dist/index.js`; `node --test`; Playwright (Chromium, SwiftShader WebGL2).

**Spec:** `docs/superpowers/specs/2026-11-24-tractography-viewer-design.md`

This is plan 1 of 4 (design "Order of work" steps 1–2). Later plans: the NiiVue Zarr Vectors loader (niivue/mono), warehouse-next routing, brainlife-lite embedding.

## Global Constraints

- Hosts are static: deploy files are served as-is from warehouse `/ui/niivue/`; the only build step is `npm run build` producing the checked-in `dist/index.js`.
- Today's contract keeps working unchanged: `window.parent.config || window.config` with `datatype`, `path`, `name`, `meshes`, `tckBudgetBytes`; volume, `neuro/mask`, `neuro/microscopy/nifti` and `neuro/csd` views behave as before.
- Tract datatypes: `neuro/track/trx`, `neuro/track/tck`, `neuro/tcks`, `neuro/track/trk`, `neuro/track/zarr-vectors` (the last is routed but shows "Zarr Vectors support is coming" until plan 2 lands).
- No local patches to NiiVue behaviour; a NiiVue gap becomes a note for an upstream PR.
- No background volume by default; `config.background = {url, name}` loads one.
- Budget default 600 MiB (`DEFAULT_BUDGET_BYTES = 600 * 1024 * 1024`, same as warehouse-next's `tckBudgetBytes`).
- Run `npm test` and `npm run test:browser` green at the end of every task.

## Review Focus

1. A legacy warehouse-next config (`datatype: 'neuro/tcks', meshes: [...]`, no `files`) must load exactly as today: first bundle auto-loaded, lazy checklist. (Test in Task 3.)
2. A config message from an origin that is not allowed must be ignored, and the viewer must not hang forever waiting for one. (Tests in Task 2.)
3. A TRX with no groups must show no group panel and colour "by bundle" must fall back to a fixed colour rather than hiding every streamline (NiiVue's `groupColors` hides streamlines outside listed groups). (Test in Task 4.)
4. A file whose size is unknown must still load (hosts may not send `size`); a file over budget with no `previewUrl` must ask first and show a message if declined. (Tests in Task 6.)
5. Tracts must be visible in the 2D slice tiles with no background volume loaded. (Test in Task 5.)

---

### Task 1: Upgrade NiiVue to 1.0.0-rc.238

**Files:**
- Modify: `package.json`, `package-lock.json`, `build.mjs`, `dist/index.js` (rebuilt), `mesh-loader.js`, `mesh-loader.test.mjs`, `index.js` (only if an API moved)
- Test: `tests/viewer.spec.mjs`

**Interfaces:**
- Produces: `dist/index.js` exporting everything from `@niivue/niivue` plus `loadOmeZarrVolumes` from `@niivue/nv-ext-tile/zarr`. `createMeshLoader(nv)` keeps `add/remove/settled`, without the TCK repair.

- [ ] **Step 1: Write the failing test** — in `tests/viewer.spec.mjs`, a two-streamline TCK keeps both streamlines:

```js
test('TCK keeps its first streamline', async ({ page }) => {
  const errors = await openViewer(page, { datatype: 'neuro/tcks', meshes: [{ url: '/fixture/two.tck', name: 'two' }] });
  await expect.poll(() => page.evaluate(() => window.testViewer.meshes[0]?.trx?.offsets.length)).toBe(3);
  expect(await page.evaluate(() => Array.from(window.testViewer.meshes[0].trx.offsets))).toEqual([0, 3, 6]);
  expect(errors).toEqual([]);
});
```

  Extend the fixture route so `two.tck` serves a TCK with two 3-point streamlines (generalise `tract()` to take a list of streamlines).

- [ ] **Step 2: Run on rc.16 to see today's behaviour**

  Run: `npm run test:browser -- -g "first streamline"`
  Expected: PASS (rc.16 + `repairTckOffsets` already restores it). This pins the behaviour across the upgrade.

- [ ] **Step 3: Upgrade** — `npm install @niivue/niivue@1.0.0-rc.238 @niivue/nv-ext-tile@1.0.0-rc.147 --save-exact`. In `build.mjs` the entry becomes `export * from '@niivue/niivue'; export { loadOmeZarrVolumes } from '@niivue/nv-ext-tile/zarr';`. `npm run build`.

- [ ] **Step 4: Run the whole browser suite**

  Run: `npm test && npm run test:browser`
  Expected: all pass. Any failure from a moved API is fixed in `index.js`/`csd-overlay.js` against `node_modules/@niivue/niivue/dist/NVControlBase.d.ts`; ledger each.

- [ ] **Step 5: Remove the workaround** — delete `repairTckOffsets` and its call from `mesh-loader.js` and its tests from `mesh-loader.test.mjs`; update the README's NiiVue section (pinned version, no TCK repair, nv-ext-tile).

- [ ] **Step 6: Prove the workaround is no longer needed**

  Run: `npm test && npm run test:browser`
  Expected: all pass, including `TCK keeps its first streamline`. If it fails, rc.238 still has the bug: restore the workaround, ledger it, and note an upstream NiiVue PR.

- [ ] **Step 7: Commit** — `git commit -am "Upgrade NiiVue to 1.0.0-rc.238; bundle nv-ext-tile for OME-Zarr; drop TCK fencepost repair"`

### Task 2: Config from the host (`config-channel.js`, `tract-config.js`)

**Files:**
- Create: `config-channel.js`, `config-channel.test.mjs`, `tract-config.js`, `tract-config.test.mjs`
- Modify: `index.js` (config acquisition)

**Interfaces:**
- Produces:
  - `isAllowedOrigin(origin: string, ownOrigin: string): boolean` — true for `ownOrigin`, `https://brainlife.io`, `https://<sub>.brainlife.io`, `http://localhost:<port>`, `http://127.0.0.1:<port>`.
  - `receiveConfig(win: Window, { timeoutMs = 10000 } = {}): Promise<object | null>` — returns `win.parent.config` (reading it inside try/catch, since a cross-origin parent throws) or `win.config` if set; otherwise posts `{ type: 'niivue-ready' }` to `win.parent` and resolves with the `config` of the first `{ type: 'niivue-config', config }` message whose `event.origin` is allowed; resolves `null` after the timeout.
  - `TRACT_DATATYPES: string[]`, `isTractDatatype(datatype): boolean`.
  - `tractFiles(config): Array<{ url, name, size?, previewUrl?, rgba255? }>` — `config.files` if present, else legacy `config.meshes`.
  - `planLoad(file, budgetBytes = DEFAULT_BUDGET_BYTES): 'full' | 'preview' | 'ask'` — `full` when size is unknown or within budget; over budget: `preview` if `previewUrl`, else `ask`.
  - `DEFAULT_BUDGET_BYTES`.

- [ ] **Step 1: Write the failing tests**

```js
// config-channel.test.mjs
test('same origin and brainlife hosts are allowed, others are not', () => {
  const own = 'https://brainlife.io';
  for (const o of [own, 'https://lite.brainlife.io', 'http://localhost:5173', 'http://127.0.0.1:8767'])
    assert.equal(isAllowedOrigin(o, own), true, o);
  for (const o of ['https://evil.example', 'https://brainlife.io.evil.example', 'http://brainlife.io', 'null'])
    assert.equal(isAllowedOrigin(o, own), false, o);
});
test('a parent config wins without messaging', async () => { /* fake win with parent.config → resolves it, postMessage never called */ });
test('a cross-origin parent falls back to a message from an allowed origin', async () => { /* parent.config getter throws; message from evil ignored; message from https://lite.brainlife.io resolves its config; niivue-ready was posted */ });
test('no config resolves null after the timeout', async () => { /* timeoutMs: 20 → null */ });

// tract-config.test.mjs
test('tract datatypes', () => { assert.deepEqual(TRACT_DATATYPES.filter(isTractDatatype).length, 5); assert.equal(isTractDatatype('neuro/anat/t1w'), false); });
test('legacy meshes become files', () => { assert.deepEqual(tractFiles({ meshes: [{ url: 'a.tck', name: 'a', size: 3 }] }), [{ url: 'a.tck', name: 'a', size: 3 }]); });
test('planLoad', () => {
  assert.equal(planLoad({ url: 'x' }, 10), 'full');
  assert.equal(planLoad({ url: 'x', size: 10 }, 10), 'full');
  assert.equal(planLoad({ url: 'x', size: 11, previewUrl: 'p' }, 10), 'preview');
  assert.equal(planLoad({ url: 'x', size: 11 }, 10), 'ask');
});
```

  The fake window is a plain object with `parent`, `config`, `addEventListener`/`removeEventListener` and a way for the test to dispatch `{ origin, data }`.

- [ ] **Step 2: Run** — `npm test` → FAIL (modules missing).
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** — `npm test` → PASS.
- [ ] **Step 5: Use it** — `index.js` replaces `let config = window.parent.config || window.config` with `const config = (await receiveConfig(window)) || debugConfig` inside `initializeViewer()`; the `volumeIsNearestInterpolation` option is set after config arrives (`nv1.volumeIsNearestInterpolation = …`).
- [ ] **Step 6: Run** — `npm test && npm run test:browser` → all pass (existing tests use `window.config`).
- [ ] **Step 7: Commit** — `git add -A && git commit -m "Receive config from the parent or an allowed postMessage; tract config helpers"`

### Task 3: Tract mode for TRX, TRK, TCK and tcks

**Files:**
- Create: `tract-viewer.js`, `tests/fixtures.mjs`
- Modify: `index.js` (dispatch; move `setupTractSelector`, `ensureTractPanel`, `injectTractStyles` into `tract-viewer.js`), `tests/viewer.spec.mjs`

**Interfaces:**
- Consumes: `isTractDatatype`, `tractFiles` (Task 2); `createMeshLoader` (Task 1).
- Produces:
  - `startTractViewer(nv, meshLoader, config): Promise<void>` — `neuro/tcks`: today's lazy checklist; other tract datatypes: load `files[0]` as one mesh with `tractOptions: { fiberRadius: 0.1, fiberSides: 3 }`; `neuro/track/zarr-vectors`: show `role=status` text "Zarr Vectors support is coming" and load nothing.
  - `tests/fixtures.mjs`: `STREAMLINES` (three streamlines: 2 points/1 mm, 3 points/~20 mm, 4 points/~40 mm), `tckBytes(streamlines)`, `trkBytes(streamlines)`, `trxBytes(streamlines, { groups, dpv, dps })` (uncompressed zip with CRC-32, `header.json`, `positions.3.float32`, `offsets.uint32`, `groups/<name>.uint32`, `dpv/<name>.float32`, `dps/<name>.float32`).

- [ ] **Step 1: Write the failing tests** — the fixture route serves `/fixture/tracts.{tck,trk,trx}` from `tests/fixtures.mjs` (TRX with groups `{ AF_L: [0, 1], CST_R: [2] }` and dpv `FA`):

```js
for (const [datatype, file] of [['neuro/track/tck','tracts.tck'], ['neuro/track/trk','tracts.trk'], ['neuro/track/trx','tracts.trx']])
  test(`${datatype} loads all three streamlines`, async ({ page }) => {
    const errors = await openViewer(page, { datatype, files: [{ url: '/fixture/' + file, name: file }] });
    await expect.poll(() => page.evaluate(() => window.testViewer.meshes[0]?.trx?.offsets.length)).toBe(4);
    expect(errors).toEqual([]);
  });
test('TRX groups and scalars are read', async ({ page }) => { /* Object.keys(trx.groups) = ['AF_L','CST_R'], 'FA' in trx.dpv */ });
test('zarr-vectors says it is coming and loads nothing', async ({ page }) => { /* role=status text, meshes.length 0, no errors */ });
```

  The existing `neuro/tcks` tests stay as the legacy guard (Review Focus 1).

- [ ] **Step 2: Run** — `npm run test:browser` → new tests FAIL.
- [ ] **Step 3: Implement** `tests/fixtures.mjs`, `tract-viewer.js`, and the dispatch in `index.js` (`isTractDatatype(config.datatype)` → `startTractViewer`, else today's volume path).
- [ ] **Step 4: Run** — `npm test && npm run test:browser` → all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "Tract mode: open TRX, TRK and TCK files"`

### Task 4: Display controls and the TRX group list

**Files:**
- Create: `tract-controls.js`, `tract-controls.test.mjs`
- Modify: `index.html` (controls), `tract-viewer.js`, `tests/viewer.spec.mjs`

**Interfaces:**
- Consumes: `startTractViewer` (Task 3).
- Produces:
  - `groupPalette(names: string[]): Record<string, [r,g,b,255]>` — today's golden-angle colours, by index.
  - `scalarChoices(trx): Array<{ value: 'dpv:<n>' | 'dps:<n>', label: string }>` — labels `"<n> (per point)"` / `"<n> (per streamline)"`.
  - `tractOptionsFor(state, { groupNames, fileColor }): Partial<NVTractOptions>` where `state = { color, colormap, calMin, calMax, radius, stride, minLength, visibleGroups }` and `color ∈ 'global' | 'local' | 'bundle' | 'fixed' | 'dpv:<n>' | 'dps:<n>'`.
    - `local` → `colorBy: ''`; `global` → `'global'`; scalars pass through with `colormap`, `calMin`, `calMax`.
    - `bundle` with groups → `groupColors` restricted to `visibleGroups`, `visibleGroups` as given; `bundle` with no groups → `colorBy: 'fixed', fixedColor: fileColor ?? [255,255,255,255]`, `groupColors: null`.
    - Always `fiberRadius: radius`, `fiberSides: 3`, `decimation: stride`, `minLength`, `visibleGroups: groupNames.length ? visibleGroups : null`.
- Controls (ids): `fiberColor` (options built from `scalarChoices`), `fiberColormap`, `fiberCalMin`/`fiberCalMax` (number inputs prefilled from `dpvMeta`/`dpsMeta` `globalMin`/`globalMax` when a scalar is chosen), `fiberRadius` (mm, 0.05–2), `fiberDecimation` (1–20), `fiberMinLength` (mm, 0–200), `fiberOpacity` (0.1–1, applied with `nv.setMesh(index, { opacity })`). Group list: same panel and row markup as the tcks checklist (`#tractPanel`, `.tract-row`), plus "Show all"/"Hide all".

- [ ] **Step 1: Write the failing unit tests** for `groupPalette`, `scalarChoices`, and each `tractOptionsFor` branch, including:

```js
test('bundle colour without groups falls back to a fixed colour', () => {
  const o = tractOptionsFor({ ...base, color: 'bundle', visibleGroups: [] }, { groupNames: [], fileColor: [1,2,3,255] });
  assert.equal(o.colorBy, 'fixed'); assert.deepEqual(o.fixedColor, [1,2,3,255]); assert.equal(o.groupColors, null); assert.equal(o.visibleGroups, null);
});
test('bundle colour with groups colours only visible groups', () => { /* groupNames ['A','B'], visibleGroups ['B'] → groupColors has only B, visibleGroups ['B'] */ });
```

- [ ] **Step 2: Run** — `npm test` → FAIL.
- [ ] **Step 3: Implement** `tract-controls.js`.
- [ ] **Step 4: Run** — `npm test` → PASS.
- [ ] **Step 5: Write the failing browser tests** with `tracts.trx`:
  - the group panel lists `AF_L` and `CST_R`; unchecking `CST_R` → `meshes[0].tractOptions.visibleGroups` is `['AF_L']`;
  - choosing `dpv:FA` → `tractOptions.colorBy === 'dpv:FA'` and the min/max inputs hold the fixture's FA range;
  - min length 10 → `tractOptions.minLength === 10`; stride 2 → `decimation === 2`; opacity 0.5 → `meshes[0].opacity === 0.5`;
  - a TRX with no groups shows no group panel and "bundle" colour gives `colorBy 'fixed'` (Review Focus 3).
- [ ] **Step 6: Run** — `npm run test:browser` → FAIL.
- [ ] **Step 7: Implement** the controls in `index.html` and their wiring in `tract-viewer.js` (one `apply()` that calls `setTractOptions(index, tractOptionsFor(...))` for each tract mesh; the tcks checklist passes each file's `rgba255` as `fileColor`).
- [ ] **Step 8: Run** — `npm test && npm run test:browser` → all pass.
- [ ] **Step 9: Commit** — `git add -A && git commit -m "Tract controls: colour modes, scalars, length, stride, opacity, TRX groups"`

### Task 5: Views, clip plane, background, screenshot

**Files:**
- Modify: `index.html`, `index.js` (view select), `tract-viewer.js`, `tests/viewer.spec.mjs`

**Interfaces:**
- Consumes: Task 3–4 tract mode.
- Produces: `#sliceType` gains `axial`, `coronal`, `sagittal` (mapping to `SLICE_TYPE.AXIAL/CORONAL/SAGITTAL` with `showRender = NEVER`); tract mode starts on `combined` (multiplanar + render). `#clipCheck` + `#clipDepth` (−1…1) call `nv.setClipPlaneDepthAziElev(depth, 270, 0)` / `(2, 0, 0)` to disable; `#screenshotBtn` calls `nv.saveBitmap('tracts.png')`. `config.background` → `nv.loadVolumes([{ url, name, colormap: 'gray' }])` before the tracts.

- [ ] **Step 1: Write the failing browser tests**
  - tract mode opens with `sliceType === SLICE_TYPE.MULTIPLANAR` and `showRender === SHOW_RENDER.ALWAYS`; selecting `axial` gives `sliceType === SLICE_TYPE.AXIAL` and `showRender === SHOW_RENDER.NEVER`;
  - with no background, the axial tile draws tract pixels: screenshot the canvas in `axial` view and assert it has non-background pixels (Review Focus 5). If NiiVue draws nothing in 2D without a volume, ledger it, add an empty background volume sized to the tractogram's bounds, and note an upstream NiiVue PR;
  - `background: { url: '/fixture/mask.nii', name: 'mask.nii' }` → `volumes.length === 1` and the tract mesh still loads;
  - checking `#clipCheck` changes `getClipPlaneDepthAziElev()[0]` to the slider value; `#screenshotBtn` triggers a download (`page.waitForEvent('download')`).
- [ ] **Step 2: Run** — `npm run test:browser` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — `npm test && npm run test:browser` → all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "Tract views: multiplanar + 3D, single slices, clip plane, background, screenshot"`

### Task 6: Budget and preview

**Files:**
- Modify: `tract-viewer.js`, `index.html` (banner), `tests/viewer.spec.mjs`

**Interfaces:**
- Consumes: `planLoad`, `DEFAULT_BUDGET_BYTES` (Task 2); `config.budgetBytes ?? config.tckBudgetBytes ?? DEFAULT_BUDGET_BYTES`.
- Produces: `#tractBanner` (`role=status`). `preview` → loads `previewUrl`, banner "Preview · Load full (X GB)"; the button `confirm()`s the size, then replaces the mesh with the full file. `ask` → `confirm()` before loading; declined → banner "Not loaded: X GB is over the Y MB limit" and no mesh.

- [ ] **Step 1: Write the failing browser tests** (`budgetBytes: 10`, fixture sizes from the served bytes):
  - over budget with `previewUrl: '/fixture/preview.tck'` (one streamline) → mesh has 1 streamline, banner shows "Preview"; clicking "Load full" with the dialog accepted → 3 streamlines;
  - over budget, no `previewUrl`, dialog dismissed → no mesh, banner "Not loaded"; dialog accepted → 3 streamlines;
  - no `size` given → loads directly, no dialog (Review Focus 4).
- [ ] **Step 2: Run** — `npm run test:browser` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — `npm test && npm run test:browser` → all pass.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "Tract budget: preview first, load full on request"`

### Task 7: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** Document tract mode: the five datatypes, the config fields (`files[{url,name,size,previewUrl}]`, `background`, `budgetBytes`, legacy `meshes`/`tckBudgetBytes`), the `postMessage` handshake (`niivue-ready` → `niivue-config`, allowed origins), the controls, the budget behaviour, and the updated deploy file list (`config-channel.js`, `tract-config.js`, `tract-controls.js`, `tract-viewer.js` added).
- [ ] **Step 2: Run** — `npm test && npm run test:browser` → all pass.
- [ ] **Step 3: Commit** — `git commit -am "README: tract mode, host config and deploy list"`
