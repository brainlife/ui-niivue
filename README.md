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
