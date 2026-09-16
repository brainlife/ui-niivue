import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { volumeOptions } = await import('data:text/javascript;base64,' + readFileSync(new URL('./volume-config.js', import.meta.url)).toString('base64'));
for (const [datatype, name] of [['neuro/mask', 'mask.nii.gz'], ['neuro/microscopy/nifti', 'image.nii.gz']]) {
  test(datatype + ' supplies the format for an extensionless DANDI URL', () => {
    const url = 'https://dandiarchive.s3.amazonaws.com/blobs/uuid';
    assert.deepEqual(volumeOptions({ datatype, path: url }), { url, name, colormap: 'gray', visible: true });
  });
}
test('preserves explicit filenames and existing anatomical images', () => {
  assert.equal(volumeOptions({ path: 'https://example.org/t1.nii.gz?at=token' }).name, 't1.nii.gz');
  assert.equal(volumeOptions({ path: '/file', name: 'custom.nii.gz' }).name, 'custom.nii.gz');
  assert.throws(() => volumeOptions({ datatype: 'neuro/mask' }), /No NIfTI/);
});
