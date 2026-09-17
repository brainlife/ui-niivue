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
