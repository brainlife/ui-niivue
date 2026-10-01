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

## NiiVue 1.0 migration

Pinned to `@niivue/niivue` `1.0.0-rc.16`, using WebGL2. Run `npm ci` and
`npm run build` to regenerate the checked-in `dist/index.js`; changing only the
npm dependency does not update the deployed viewer. The build bundles bare
imports and dynamic codecs for the static Warehouse `/ui/niivue/` host.

Deploy `index.html`, `index.js`, `dist/index.js`, `volume-config.js`,
`mesh-loader.js`, `csd-mesh.js`, `csd-overlay.js`, and `csd-glyphs.js` together.
Warehouse-next's existing `window.config` contract remains compatible.

The migration uses `NiiVue`, reactive display properties, `locationChange`
events, index-based mesh removal, and `setTractOptions`. CSD geometry is loaded
through the public MZ3 `File` interface with per-vertex orientation colors;
it no longer constructs private WebGL mesh objects.

rc.16 tessellates tracts as tubes. Initial loads use a 0.1 mm radius and three
sides, and still auto-load only the first bundle. Large tractograms need memory
validation before production rollout. The old dither control is replaced by
stride (every Nth streamline); color minimum now controls scalar color mapping.
`mesh-loader.js` also repairs rc.16's TCK fenceposts, which otherwise omit the
first streamline. Re-evaluate this workaround on the next NiiVue upgrade.

Run `npm test` and `npm run test:browser`. Install Chromium with
`npx playwright install chromium`, or set `PW_BROWSER_PATH` to an existing
Chromium executable. Browser tests cover masks, controls, tract geometry/removal,
CSD updates and colors, and a small synthetic OME-Zarr store. The latter checks
the packaged loader; it does not add Zarr routing to the Warehouse wrapper or
validate LINC-scale streaming, authenticated stores, or spatial registration.
