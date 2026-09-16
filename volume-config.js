// Keep a filename separate from the URL: public DANDI blobs have no extension.
export function volumeOptions(config) {
  const defaults = {
    'neuro/mask': 'mask.nii.gz',
    'neuro/microscopy/nifti': 'image.nii.gz',
  };
  if (typeof config.path !== 'string' || !config.path) throw new Error('No NIfTI image URL was provided.');
  return {
    url: config.path,
    name: config.name || defaults[config.datatype] || config.path.split('?')[0].split('/').pop(),
    colormap: 'gray',
    visible: true,
  };
}
