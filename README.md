# ui-niivue

Browser viewer for NIfTI volumes and tractograms. The parent page supplies
`window.config` before loading this viewer.

For an external microscopy volume:

```js
window.config = {
  datatype: 'neuro/microscopy/nifti',
  path: 'https://dandiarchive.s3.amazonaws.com/blobs/ASSET_BLOB_ID',
  name: 'image.nii.gz',
};
```

For a mask, use `datatype: 'neuro/mask'` and `name: 'mask.nii.gz'`.
The filename identifies the format when a source URL has no extension.
These two datatypes have default filenames if `name` is omitted.
Masks use nearest-neighbor interpolation; image intensities use the normal
NiiVue interpolation. Source volumes and header geometry remain unchanged.
Public remote URLs must support browser CORS access. Do not append Brainlife
authentication tokens to public provider URLs.

The Warehouse `ui/src/datauis/nifti.vue` wrapper must also support the datatype
and supply the resolved URL. Deploy `index.js` and `volume-config.js` together.

Run configuration tests with `npm test` (Node 18 or later).

## CSD orientation overlay

For `datatype: 'neuro/csd'`, supply the URL and filename of an `lmax*.nii.gz`
volume. The viewer uses its first coefficient volume as the grayscale background
and automatically displays orientation-colored FOD glyphs on the three current
slice planes. No separate T1 image or `response.txt` is required.

The overlay supports MRtrix3 real, even spherical harmonics (orders 2–14), using
the coefficient ordering and phase in MRtrix3's `core/math/SH.h` and
`core/math/legendre.h`. It does not convert legacy MRtrix 0.2 or other SH bases.
Voxel positions use the NIfTI affine; FOD directions use scanner/world coordinates.
Red, green, and blue encode the absolute world X, Y, and Z directions.

Glyphs are normalized independently for orientation inspection, not quantitative
amplitude comparison. Negative lobes are clipped to zero. Voxels below 8% of the
maximum zeroth coefficient are hidden. A bounded, nearest-neighbor sampling grid
keeps slice navigation responsive (up to approximately 500 samples per plane,
or 125 for orders above 8). The overlay updates when the crosshair moves.
Use **CSD glyphs** to toggle it and **Glyph size** to adjust its scale.

## Tractography mode

These datatypes open the tract viewer: `neuro/track/trx`, `neuro/track/tck`,
`neuro/tcks`, `neuro/track/trk` and `neuro/track/zarr-vectors`. The last one
only shows a "Zarr Vectors support is coming" notice. The view starts as
slices plus 3D, and the View menu also offers 3D only, slices only, and single
axial, coronal or sagittal slices.

```js
window.config = {
  datatype: 'neuro/track/trx',
  files: [{
    url: 'https://example.org/bundles.trx',
    name: 'bundles.trx',
    size: 1288490188,                          // bytes, optional
    previewUrl: 'https://example.org/bundles-preview.trx', // optional
    streamlines: 2000000,                      // streamlines in the full file, optional
  }],
  background: { url: 'https://example.org/t1.nii.gz', name: 't1.nii.gz' }, // optional
  budgetBytes: 600 * 1024 * 1024,              // optional, this is the default
};
```

`files` is a list of `{url, name, size, previewUrl, streamlines}`. For `trx`,
`trk` and `tck` with `files`, only the first entry is loaded. `background` is an optional
grayscale volume shown under the tracts; if it fails to load, a notice appears
and the tracts still load. Legacy configs are still accepted: `meshes` is read
when `files` is absent, and `tckBudgetBytes` when `budgetBytes` is absent.
`neuro/tcks`, and `neuro/track/tck` without `files`, use the older checklist
of bundles (`meshes`): only the first bundle loads at start, and the others
load or unload as they are ticked.

### Size budget

If `size` is unknown or at most `budgetBytes`, the file loads in full. If it is
larger and a `previewUrl` is given, the preview loads first and the banner
reads "Preview: N of M streamlines · Load full (size)", where N is the number of
streamlines in the preview and M is the file entry's `streamlines` (without it,
"Preview: N streamlines"). The **Load full**
button (with a confirmation) replaces it with the whole file; if the full load
fails, the preview stays. If it is larger and there is no preview, the viewer
asks before loading, and shows a notice if you decline.

### Receiving the config

If the parent page's `window.config` can be read (same origin), it is used;
otherwise the viewer's own `window.config`, if set. A
viewer that is not in an iframe with no config falls back to the debug volume at
once. Inside an iframe, the viewer posts `{type: 'niivue-ready'}` to its parent
and waits up to 10 seconds for one `{type: 'niivue-config', config}` message,
then falls back to the debug volume. The message must come from the parent
window, and is accepted only from the same origin (never the opaque `null`),
`https://brainlife.io` and its subdomains, and `http://localhost` or
`http://127.0.0.1` with an explicit port. A host on another origin does:

```js
const frame = document.querySelector('iframe');
window.addEventListener('message', event => {
  if (event.source !== frame.contentWindow || event.data?.type !== 'niivue-ready') return;
  frame.contentWindow.postMessage({ type: 'niivue-config', config }, '*');
});
```

The host itself must be on an allowed origin for the viewer to accept it.

### Controls

- **Colour**: global direction, local direction, bundle colour (each TRX
  group, or each file, in its own colour), fixed colour, or any per-point or
  per-streamline scalar stored in the TRX file. For scalars, **Colormap** and
  **Min**/**Max** set the mapping; the range is filled from the data.
- **Radius** (mm) sets tube thickness. **Stride** draws every Nth streamline.
  **Min length** (mm) hides shorter streamlines. **Opacity** is a slider.
- **Groups**: a TRX file with groups gets a side list to show or hide each one,
  with Show all and Hide all. Streamlines that belong to no group are listed
  as one more group, "Other streamlines".
- **Clip** turns on a clip plane; the slider sets its depth.
- **Screenshot** saves the view as `tracts.png`.
- **View**, **Layout** and **EqualSize** change the slice and 3D arrangement.

## NiiVue 1.0 migration

Pinned to `@niivue/niivue` `1.0.0-rc.238` and `@niivue/nv-ext-tile`
`1.0.0-rc.147` (the OME-Zarr loader, `loadOmeZarrVolumes`, now lives there and
is re-exported from `dist/index.js`), using WebGL2. Run `npm ci` and
`npm run build` to regenerate the checked-in `dist/index.js`; changing only the
npm dependency does not update the deployed viewer. The build bundles bare
imports and dynamic codecs for the static Warehouse `/ui/niivue/` host.

Deploy `index.html`, `index.js`, `dist/index.js`, `volume-config.js`,
`mesh-loader.js`, `csd-mesh.js`, `csd-overlay.js`, `csd-glyphs.js`,
`config-channel.js`, `tract-config.js`, `tract-controls.js`, and
`tract-viewer.js` together.
Warehouse-next's existing `window.config` contract remains compatible.

The migration uses `NiiVue`, reactive display properties, `locationChange`
events, index-based mesh removal, and `setTractOptions`. CSD geometry is loaded
through the public MZ3 `File` interface with per-vertex orientation colors;
it no longer constructs private WebGL mesh objects.

NiiVue tessellates tracts as tubes. Initial loads use a 0.1 mm radius and three
sides, and still auto-load only the first bundle. Large tractograms need memory
validation before production rollout. The old dither control is replaced by
stride (every Nth streamline); color minimum now controls scalar color mapping.
The former rc.16 TCK fencepost repair was removed: rc.238 keeps the first
streamline (covered by a browser test).

Run `npm test` and `npm run test:browser`. Install Chromium with
`npx playwright install chromium`, or set `PW_BROWSER_PATH` to an existing
Chromium executable. Browser tests cover masks, controls, tract geometry/removal,
CSD updates and colors, and a small synthetic OME-Zarr store. The latter checks
the packaged loader; it does not add Zarr routing to the Warehouse wrapper or
validate LINC-scale streaming, authenticated stores, or spatial registration.
