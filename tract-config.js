export const DEFAULT_BUDGET_BYTES = 600 * 1024 * 1024;

export const TRACT_DATATYPES = [
  'neuro/track/trx',
  'neuro/track/tck',
  'neuro/tcks',
  'neuro/track/trk',
  'neuro/track/zarr-vectors',
];

export function isTractDatatype(datatype) {
  return TRACT_DATATYPES.includes(datatype);
}

export function tractFiles(config) {
  return config?.files || config?.meshes || [];
}

export function formatSize(bytes) {
  if (bytes == null) return "";
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(1) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(0) + " MB";
  return (bytes / 1024).toFixed(0) + " KB";
}

export function planLoad(file, budgetBytes = DEFAULT_BUDGET_BYTES) {
  if (file.size == null || file.size <= budgetBytes) return 'full';
  return file.previewUrl ? 'preview' : 'ask';
}
