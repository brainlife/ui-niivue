# NiiVue tractography viewer for brainlife — design

Date: 2026-11-24 · Status: draft for review · Owner: Franco Pestilli

## Intent

Give brainlife one NiiVue-based viewer for tractography. It opens the four
streamline formats brainlife stores (TRX, TCK, TRK, Zarr Vectors), shows them
in several linked views at once, and lets the researcher change how the
streamlines are shown and which ones are shown. Both brainlife front ends,
warehouse-next (the current brainlife.io) and brainlife-lite (the React
front end), use this same viewer.

Why NiiVue: Franco is part of the NiiVue project. Gaps belong upstream as
small NiiVue PRs, which the NiiVue maintainers will review, rather than as
local workarounds.

## What exists today (2026-11-24)

| | warehouse-next | brainlife-lite |
|---|---|---|
| Viewer | `brainlife/ui-niivue` (this repo), loaded in an iframe; config arrives as `window.parent.config` from `ui/src/datauis/nifti.vue` | its own `NiiVueViewer.tsx` component |
| `neuro/tcks`, `neuro/track/tck` | tick-box list of bundles, loaded lazily one file at a time under a memory budget | loaded as meshes |
| `neuro/track/trk`, `neuro/track/trx` | not routed; the datatypes have no NiiVue entry | loaded as meshes, with no group list |
| `neuro/track/zarr-vectors` | none | opens an external Neuroglancer page (`zarr-vectors-viewer.web.app`) |
| NiiVue | `1.0.0-rc.16`, with a local TCK fencepost workaround | `1.0.0-rc.16`, with the same workaround copied |

Datatype registrations in brainlife: `neuro/track/trx` (`track.trx`) and
`neuro/track/zarr-vectors` (`vectors.zarrvectors`) list only the File
Viewer; `neuro/track/trk` lists only desktop (noVNC) viewers;
`neuro/track/tck` and `neuro/tcks` already list Niivue.

NiiVue 1.0 now lives in `niivue/mono` (npm `@niivue/niivue@next`,
`1.0.0-rc.238` as of 2026-11-23). Its tract layer already supports, through
`setTractOptions`: `colorBy` (`global`, `local`, `fixed`, `dpv:<name>`,
`dps:<name>`), `colormap`, `calMin`/`calMax`, `fiberRadius`, `fiberSides`,
`minLength`, `decimation`, `groupColors` and `visibleGroups`. TRX groups load
into `NVTractData.groups`. Its TCK reader sets `offsets[0] = 0`, so the rc.16
fencepost bug looks fixed. Tract readers take one file buffer
(`read(buffer)`), so a directory store like Zarr Vectors needs a different
entry point. OME-Zarr volumes load through the `nv-ext-tile` extension, which
uses `@niivue/zarrita-rs`.

## Goals

1. **One viewer, two hosts.** The tractography viewer is built once in this
   repo. warehouse-next keeps embedding it. brainlife-lite embeds it in an
   iframe for the tract datatypes instead of loading tracts in
   `NiiVueViewer.tsx`.
2. **Four formats:** TRX (`.trx`), TCK (`.tck`, and the `neuro/tcks`
   collection), TRK (`.trk`) and Zarr Vectors (`.zarrvectors` store).
3. **Multiple views:** a 3D render next to axial, coronal and sagittal slices
   of the same data, with linked crosshair and camera, and a switch to a
   single large view.
4. **Controls to manipulate what is shown**, all in the browser:
   - tract list: show/hide each bundle (a `neuro/tcks` file or a TRX/Zarr
     Vectors group), with its color swatch, plus show all and hide all;
   - color by global direction, local direction, bundle/group, fixed color,
     or any per-vertex or per-streamline scalar the file carries (e.g. FA),
     with colormap and range;
   - tube radius, every Nth streamline (stride), and opacity;
   - minimum streamline length (mm);
   - clip plane;
   - an optional anatomical background (T1 or template) under the slices;
   - a screenshot of the current view.
5. **Safe with large data:** a tractogram over the budget opens as its
   downsampled preview, with a "Load full" button that warns about the size
   first (decided by Franco).

## Non-goals (this version)

- ROI, box or waypoint dissection (selecting streamlines through a region).
- Saving a filtered or edited tractogram back to brainlife.
- `neuro/wmc` (White Matter Classification); WMC Tract View stays.
- Converting between formats.
- Volumes, masks and CSD in brainlife-lite: `NiiVueViewer.tsx` keeps them.

## Anti-goals

- Regressing what works now: warehouse-next's existing NiiVue config
  (`window.parent.config` with `datatype`, `path`/`name`, `meshes`,
  `tckBudgetBytes`) and its volume, mask and CSD views keep working
  unchanged.
- A tab that freezes or crashes on a multi-GB tractogram.
- Forking NiiVue, or keeping brainlife-only patches to NiiVue behaviour that
  belong upstream.
- Two diverging tract viewers again.

## Approaches

- **1. One viewer used by both front ends (chosen by Franco).** Build it in
  `ui-niivue`; brainlife-lite embeds it by iframe for tract datatypes. One
  place for formats, controls and NiiVue upgrades. Costs an embedding
  contract that works for both hosts.
- 2. Build into brainlife-lite's React `NiiVueViewer` only. Simplest if
  warehouse-next were going away, but it is still brainlife.io.
- 3. Extend ui-niivue for warehouse-next only. Leaves brainlife-lite's tract
  code to drift further.

## Design

### Viewer (this repo)

- **Tract mode** is chosen when the config's datatype is one of
  `neuro/track/trx`, `neuro/track/tck`, `neuro/tcks`, `neuro/track/trk`,
  `neuro/track/zarr-vectors`. Everything else keeps today's code path.
- **Config contract.** Keep today's `window.parent.config` / `window.config`
  object (same-origin hosts). Add a second channel for hosts on another
  origin: the viewer posts `{type: 'niivue-ready'}` to its parent and accepts
  one `{type: 'niivue-config', config}` message, checking the sender's origin
  against an allow-list. New optional fields: `files` (list of `{url, name,
  size, previewUrl?}`; one entry for trx/tck/trk/zarr-vectors, many for
  tcks),
  `background` (`{url, name}` of a volume), `budgetBytes`.
- **Loading.**
  - TRX, TCK, TRK: NiiVue's own readers.
  - `neuro/tcks`: today's lazy per-file list, unchanged in behaviour.
  - TRX groups: one mesh; the tract list drives `visibleGroups` and
    `groupColors` instead of loading and unloading files.
  - Zarr Vectors: see the NiiVue PRs below.
  - Budget: NiiVue's readers download and parse the whole file, and stride
    only thins what is drawn, so stride cannot protect memory. When a
    single-file tractogram is larger than `budgetBytes`, the viewer loads
    `previewUrl` instead (warehouse-next already serves a downsampled copy
    with `?preview=1` on `viz-file`) and shows "Preview: N of M streamlines ·
    Load full (X GB)". "Load full" confirms the size, then swaps the mesh.
    Without a `previewUrl`, it asks before loading the full file. True
    partial reads (range requests, selected TRX groups) are later, as NiiVue
    PRs (decided by Franco).
- **Views.** NiiVue multiplanar with the render tile (3D plus three slices),
  and a single-view switch (3D, axial, coronal, sagittal). Tracts show in the
  2D tiles where they cross the slice. There is no background by default;
  when a host passes `background` (e.g. the subject's T1), the volume is
  loaded under the tracts. A T1 picker in the hosts is later (decided by
  Franco). The builder confirms NiiVue draws tracts in 2D tiles with no
  volume loaded; if it needs one, use an empty volume sized to the
  tractogram's bounding box.
- **Controls** map one-to-one onto `setTractOptions` fields and NiiVue
  viewer properties; the scalar menu lists the file's `dpv`/`dps` names.
- **Upgrade NiiVue** from `1.0.0-rc.16` to the current 1.0 release candidate
  and drop `repairTckOffsets` once a test shows the first streamline
  survives.
  In 1.0 the OME-Zarr loader moved to `@niivue/nv-ext-tile` (`/zarr`), so
  the bundle adds it to keep `loadOmeZarrVolumes` working.

### NiiVue PRs (upstream, small, one concern each)

1. **Zarr Vectors streamline loader.** A loader that opens a `.zarrvectors`
   store over HTTP and returns NiiVue's existing `NVTractData` (positions +
   offsets, `dpv`, `dps`, `groups`, `dpg`), plus a way to add a tract mesh
   from `NVTractData` if none exists. It most likely lives in an extension
   package next to `nv-ext-tile` and reuses `@niivue/zarrita-rs`. The
   mapping follows Franco's TRX ↔ Zarr Vectors design
   (`francopestilli/trx-zarr-vectors/DESIGN.md`). Scope: Zarr Vectors format
   0.9.0 and later only. The loader takes a custom `fetch` (or request
   hook) so a host can add brainlife tokens or signed URLs per chunk
   (decided by Franco). For stores larger than the
   budget, read a coarser resolution level, if the store has one, the way
   `loadOmeZarrVolumes` uses `levelBudgetBytes`.
2. Any other gap found while building, e.g. reading the size of a file
   before fetching it, raised as its own PR rather than patched locally.

### warehouse-next

`ui/src/datauis/nifti.vue` routes `neuro/track/trx`, `neuro/track/trk` and
`neuro/track/zarr-vectors` to this viewer with resolved URLs, as it already
does for tck. Today it rewrites every tck datatype to `neuro/tcks`; it should
pass the real datatype once the viewer understands all of them.

### brainlife-lite

For the five tract datatypes, `VisualizeDatatypeButton` opens this viewer in
its existing visualizer modal (`viewerModal`), as an iframe (it already iframes other viewers via `frame.path`) and sends the
config. `NiiVueViewer.tsx` drops only its tract-specific code
(`niivueTracts.ts` and the tract routing); its general mesh path stays,
because the `surfaces` and `tractview` UIs use it (*builder's call*).
The Zarr Vectors Neuroglancer link stays as a second option.

### brainlife datatype registrations (admin)

Add the Niivue UI (`66e4788b77aba166ce69446f`) to `neuro/track/trx`,
`neuro/track/trk` and `neuro/track/zarr-vectors`.

## Testing

- Unit tests (`node --test`) for config parsing, the message channel, and
  the control → `setTractOptions` mapping.
- Playwright browser tests with a small fixture per format (TRX with two
  groups and a dpv scalar, TCK, TRK, Zarr Vectors store; the same few
  streamlines in each) checking: streamline count, the first streamline
  present, group show/hide, scalar coloring, minimum length, stride, view
  switching, and the budget prompt.
- One manual check per host on brainlife with real data. No dataset is
  waiting for this yet, so the builder writes the fixtures (with
  trx-python and zarr-vectors-py) and uploads a TRX and a Zarr Vectors
  store to a test project for the manual check.

## Left to the builder

- Exact layout and styling of the controls.
- How the viewer is hosted for brainlife-lite (same path as warehouse-next's
  `/ui/niivue/`, or another), and the origin allow-list.
- Which NiiVue extension package holds the Zarr Vectors loader; agree with
  the NiiVue maintainers in the PR.
- Budget defaults.

## Order of work

1. NiiVue upgrade in this repo, keeping today's behaviour (tests first).
2. Tract mode: TRX/TRK/TCK, views, controls, budget.
3. NiiVue PR: Zarr Vectors loader; then wire it in.
4. warehouse-next routing; datatype registrations.
5. brainlife-lite iframe embedding; remove its tract code.

Steps 4 and 5 ship with TRX, TCK and TRK without waiting for the Zarr
Vectors PR; Zarr Vectors is routed to the viewer once a NiiVue release
carries the loader. Until then brainlife-lite's Neuroglancer link is the
Zarr Vectors path. No interim local copy of the loader (*builder's call*).

## Addendum (2026-11-24): TRX on brainlife

The `neuro/track/trx` datatype stores `track.trx`, and its description says it
may be the unzipped TRX directory. No brainlife visualizer uses TRX, and the one
app that reads it (`gamorosino/app-trak2zarr-vectors`) passes it to trx-python,
which accepts both forms. Decision (Franco: "assume what you need"): warehouse-next
routes `track.trx` as a zipped single file now; the directory form comes with the
Zarr Vectors loader, which needs the same "tract mesh from tract data" entry point.
