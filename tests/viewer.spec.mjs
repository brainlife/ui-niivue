import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { STREAMLINES, tckBytes, trkBytes, trxBytes } from './fixtures.mjs';

const trxOptions = { groups: { AF_L: [0, 1], CST_R: [2] }, dpv: { FA: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9] } };

// Small deterministic, world-aligned NIfTI and TCK fixtures.
function nifti(frames = 1) {
  const n = 8, voxels = n ** 3;
  const bytes = Buffer.alloc(352 + voxels * frames * 4);
  bytes.writeInt32LE(348, 0);
  [frames > 1 ? 4 : 3, n, n, n, frames, 1, 1, 1].forEach((v, i) => bytes.writeInt16LE(v, 40 + i * 2));
  bytes.writeInt16LE(16, 70); bytes.writeInt16LE(32, 72);
  for (let i = 0; i < 8; i++) bytes.writeFloatLE(1, 76 + i * 4);
  bytes.writeFloatLE(352, 108); bytes.writeFloatLE(1, 112);
  bytes.writeInt16LE(1, 254);
  for (let row = 0; row < 3; row++) bytes.writeFloatLE(1, 280 + row * 16 + row * 4);
  bytes.write('n+1\0', 344);
  for (let i = 0; i < voxels; i++) bytes.writeFloatLE(frames > 1 ? 1 : i % n, 352 + i * 4);
  return bytes;
}
function tract(offset, streamlines) {
  return tckBytes(streamlines || [[[0, offset, 0], [3, offset + 1, 3], [7, offset, 7]]]);
}
const twoStreamlines = [[[0, 0, 0], [1, 1, 1], [2, 2, 2]], [[5, 5, 5], [6, 6, 6], [7, 7, 7]]];
async function openViewer(page, config) {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(config => { window.config = config; }, config);
  // Test-only access to the real instance without a production debug global.
  await page.route('**/index.js', async route => {
    if (new URL(route.request().url()).pathname !== '/index.js') return route.continue();
    await route.fulfill({ contentType: 'text/javascript', body: readFileSync(new URL('../index.js', import.meta.url), 'utf8') + '\nwindow.testViewer = nv1;'});
  });
  await page.route('**/fixture/**', route => {
    const url = route.request().url();
    const body = url.endsWith('tracts.tck') ? tckBytes(STREAMLINES) : url.endsWith('tracts.trk') ? trkBytes(STREAMLINES) :
      url.endsWith('tracts.trx') ? trxBytes(STREAMLINES, trxOptions) : null;
    if (body) return route.fulfill({ contentType: 'application/octet-stream', body });
    return route.fulfill({ contentType: 'application/octet-stream', body: url.endsWith('two.tck') ? tract(0, twoStreamlines) : url.endsWith('.tck') ? tract(url.includes('right') ? 3 : 1) : nifti(url.includes('csd') ? 6 : 1) });
  });
  await page.goto('/');
  return errors;
}

test('mask loads, uses nearest interpolation, and view controls work', async ({ page }) => {
  const errors = await openViewer(page, { datatype: 'neuro/mask', path: '/fixture/mask.nii', name: 'mask.nii' });
  await expect.poll(() => page.evaluate(() => window.testViewer?.volumes.length)).toBe(1);
  expect(await page.evaluate(() => window.testViewer.volumeIsNearestInterpolation)).toBe(true);
  expect(await page.evaluate(() => window.testViewer.sliceType)).toBe(4);
  await page.selectOption('#sliceType', 'slices');
  expect(await page.evaluate(() => [window.testViewer.sliceType, window.testViewer.showRender])).toEqual([3,0]);
  await page.selectOption('#sliceType', 'combined');
  await page.selectOption('#layoutSelect', '2');
  await page.uncheck('#equalCheck');
  expect(await page.evaluate(() => { const n = window.testViewer; return [n.sliceType,n.multiplanarType,n.showRender,n.isEqualSize]; })).toEqual([3,2,1,false]);
  await expect(page.locator('[role=alert]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('tract removal resolves shifting indices and radius stays visible', async ({ page }) => {
  const errors = await openViewer(page, { datatype: 'neuro/tcks', meshes: [
    { url: '/fixture/left.tck', name: 'left', rgba255: [255,0,0,255] },
    { url: '/fixture/right.tck', name: 'right', rgba255: [0,255,0,255] },
  ] });
  await expect(page.locator('#tractSummary')).toContainText('1 / 2');
  await page.locator('.tract-row').filter({ hasText: 'right' }).locator('input').check();
  await expect(page.locator('#tractSummary')).toContainText('2 / 2');
  expect(await page.evaluate(() => window.testViewer.meshes.every(m => m.positions.length > 0 && m.tractOptions.fiberRadius > 0))).toBe(true);
  expect(await page.evaluate(() => window.testViewer.meshes.map(m => m.tractOptions.colorBy))).toEqual(['fixed', 'fixed']);
  await page.locator('.tract-row').filter({ hasText: 'left' }).locator('input').uncheck();
  await expect.poll(() => page.evaluate(() => window.testViewer.meshes.map(m => m.name))).toEqual(['right']);
  await page.locator('#fiberRadius').fill('5');
  await page.locator('#fiberRadius').dispatchEvent('change');
  await expect.poll(() => page.evaluate(() => window.testViewer.meshes[0].tractOptions.fiberRadius)).toBe(0.5);
  await page.click('#tractClearAll');
  await expect.poll(() => page.evaluate(() => window.testViewer.meshes.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('CSD MZ3 glyphs retain colors and update/toggle without mesh leaks', async ({ page }) => {
  const errors = await openViewer(page, { datatype: 'neuro/csd', path: '/fixture/csd.nii', name: 'lmax2.nii' });
  await expect(page.locator('#csd-status')).toHaveText(/\d+ glyphs/);
  expect(await page.evaluate(() => { const m=window.testViewer.meshes[0]; return m.positions.length > 0 && new Set(m.perVertexColors).size > 10; })).toBe(true);
  await page.evaluate(() => window.testViewer.setCrosshairPos([2,3,4]));
  await expect(page.locator('#csd-status')).toHaveText(/\d+ glyphs/);
  await expect.poll(() => page.evaluate(() => window.testViewer.meshes.length)).toBe(1);
  await page.screenshot({ path: 'test-results/csd-glyphs.png' });
  await page.uncheck('#csd-visible');
  await expect.poll(() => page.evaluate(() => window.testViewer.meshes.length)).toBe(0);
  await page.check('#csd-visible');
  await expect(page.locator('#csd-status')).toHaveText(/\d+ glyphs/);
  await expect.poll(() => page.evaluate(() => window.testViewer.meshes.length)).toBe(1);
  expect(errors).toEqual([]);
});

test('bundled OME-Zarr loader reads a small multiscale store', async ({ page }) => {
  await openViewer(page, { datatype: 'neuro/mask', path: '/fixture/mask.nii', name: 'mask.nii' });
  await expect.poll(() => page.evaluate(() => window.testViewer?.volumes.length)).toBe(1);
  await page.route('**/tiny.zarr/**', route => {
    const path = new URL(route.request().url()).pathname;
    const json = value => route.fulfill({ contentType: 'application/json', body: JSON.stringify(value) });
    if (path.endsWith('/.zgroup')) return json({ zarr_format: 2 });
    if (path === '/tiny.zarr/.zattrs') return json({ multiscales: [{ version: '0.4', axes: ['z','y','x'].map(name => ({ name, type: 'space', unit: 'micrometer' })), datasets: [{ path: '0', coordinateTransformations: [{ type: 'scale', scale: [1,1,1] }] }] }] });
    if (path.endsWith('/0/.zarray')) return json({ zarr_format: 2, shape: [8,8,8], chunks: [8,8,8], dtype: '|u1', compressor: null, fill_value: 0, order: 'C', filters: null });
    if (path.endsWith('/0/0.0.0')) return route.fulfill({ body: Buffer.from(Array.from({length:512}, (_,i) => i % 8)), contentType: 'application/octet-stream' });
    return route.fulfill({ status: 404, body: '' });
  });
  const result = await page.evaluate(async () => {
    const { loadOmeZarrVolumes } = await import('/dist/index.js');
    const volumes = await loadOmeZarrVolumes(location.origin + '/tiny.zarr', { channels: [0] });
    await window.testViewer.loadVolumes(volumes);
    const volume = window.testViewer.volumes[0];
    return { dims: volume.hdr.dims.slice(1,4), spacing: volume.hdr.pixDims.slice(1,4), range: [volume.globalMin,volume.globalMax] };
  });
  expect(result.dims).toEqual([8,8,8]);
  // The loader retains micrometre-valued coordinates; this smoke test does
  // not assert mm conversion or LINC-specific spatial registration.
  expect(result.spacing).toEqual([1,1,1]);
  expect(result.range).toEqual([0,7]);
});


test('single tract ignores a supplied fixed color', async ({ page }) => {
  const errors = await openViewer(page, { datatype: 'neuro/tcks', meshes: [
    { url: '/fixture/left.tck', name: 'left', rgba255: [255,0,0,255] },
  ] });
  await expect(page.locator('#tractSummary')).toContainText('1 / 1');
  expect(await page.evaluate(() => window.testViewer.meshes[0].tractOptions.colorBy)).not.toBe('fixed');
  expect(errors).toEqual([]);
});

test('TCK keeps its first streamline', async ({ page }) => {
  const errors = await openViewer(page, { datatype: 'neuro/tcks', meshes: [{ url: '/fixture/two.tck', name: 'two' }] });
  await expect.poll(() => page.evaluate(() => window.testViewer.meshes[0]?.trx?.offsets.length)).toBe(3);
  expect(await page.evaluate(() => Array.from(window.testViewer.meshes[0].trx.offsets))).toEqual([0, 3, 6]);
  expect(errors).toEqual([]);
});

for (const [datatype, file] of [['neuro/track/tck', 'tracts.tck'], ['neuro/track/trk', 'tracts.trk'], ['neuro/track/trx', 'tracts.trx']])
  test(`${datatype} loads all three streamlines`, async ({ page }) => {
    const errors = await openViewer(page, { datatype, files: [{ url: '/fixture/' + file, name: file }] });
    await expect.poll(() => page.evaluate(() => window.testViewer.meshes[0]?.trx?.offsets.length)).toBe(4);
    expect(await page.evaluate(() => window.testViewer.meshes.length)).toBe(1);
    expect(await page.evaluate(() => window.testViewer.meshes[0].tractOptions.fiberRadius)).toBe(0.1);
    expect(errors).toEqual([]);
  });

test('TRX groups and scalars are read', async ({ page }) => {
  const errors = await openViewer(page, { datatype: 'neuro/track/trx', files: [{ url: '/fixture/tracts.trx', name: 'tracts.trx' }] });
  await expect.poll(() => page.evaluate(() => window.testViewer.meshes[0]?.trx?.offsets.length)).toBe(4);
  expect(await page.evaluate(() => Object.keys(window.testViewer.meshes[0].trx.groups))).toEqual(['AF_L', 'CST_R']);
  expect(await page.evaluate(() => 'FA' in window.testViewer.meshes[0].trx.dpv)).toBe(true);
  expect(errors).toEqual([]);
});

test('zarr-vectors says it is coming and loads nothing', async ({ page }) => {
  const errors = await openViewer(page, { datatype: 'neuro/track/zarr-vectors', files: [{ url: '/fixture/tracts.zarr', name: 'tracts.zarr' }] });
  await expect(page.getByRole('status').filter({ hasText: 'Zarr Vectors support is coming' })).toBeVisible();
  expect(await page.evaluate(() => window.testViewer.meshes.length)).toBe(0);
  expect(errors).toEqual([]);
});
