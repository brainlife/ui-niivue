import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from 'node:fs';
const { shOrder, shBasis, sphere, inverseAffine, createCsdSampler, buildGlyphs } = await import(
  'data:text/javascript;base64,' + readFileSync(new URL('./csd-glyphs.js', import.meta.url)).toString('base64')
);
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
test("MRtrix coefficient counts and analytical l=2 basis including phase", () => {
  assert.equal(shOrder(45), 8);
  assert.equal(shOrder(120), 14);
  assert.throws(() => shOrder(7));
  const [x, y, z] = [1, 2, 3].map((v) => v / Math.sqrt(14));
  const b = shBasis([x, y, z], 2),
    k = Math.sqrt(15 / (4 * Math.PI));
  [
    1 / Math.sqrt(4 * Math.PI),
    k * x * y,
    -k * y * z,
    Math.sqrt(5 / (16 * Math.PI)) * (3 * z * z - 1),
    -k * x * z,
    (k / 2) * (x * x - y * y),
  ].forEach((v, i) => close(b[i], v));
});
test("all supported SH orders have antipodal symmetry and correct polar values", () => {
  for (let l = 2; l <= 14; l += 2) {
    const p = [1, 2, 3].map((v) => v / Math.sqrt(14)),
      a = shBasis(p, l),
      b = shBasis(
        p.map((v) => -v),
        l,
      );
    a.forEach((v, i) => close(v, b[i]));
    const pole = shBasis([0, 0, 1], l);
    for (let band = 0; band <= l; band += 2)
      for (let m = -band; m <= band; m++)
        close(
          pole[(band * (band + 1)) / 2 + m],
          m === 0 ? Math.sqrt((2 * band + 1) / (4 * Math.PI)) : 0,
        );
  }
});
test("sphere triangles point outward", () => {
  const s = sphere();
  for (const [i, j, k] of s.faces) {
    const a = s.points[i],
      b = s.points[j].map((v, q) => v - a[q]),
      c = s.points[k].map((v, q) => v - a[q]);
    assert.ok(
      a[0] * (b[1] * c[2] - b[2] * c[1]) +
        a[1] * (b[2] * c[0] - b[0] * c[2]) +
        a[2] * (b[0] * c[1] - b[1] * c[0]) >
        0,
    );
  }
});
test("sampling uses native voxel affine, coefficient frames, and NIfTI scaling", () => {
  const affine = [
      [0, -2, 0, 10],
      [3, 0, 0, -8],
      [0, 0, 4, 6],
      [0, 0, 0, 1],
    ],
    dims = [4, 2, 2, 2, 6],
    img = new Float32Array(8 * 6);
  for (let c = 0; c < 6; c++) img[1 + c * 8] = c + 1;
  const sampler = createCsdSampler({
    hdr: { dims, affine, scl_slope: 2, scl_inter: 0.5 },
    nFrame4D: 6,
    img,
  });
  assert.deepEqual(
    Array.from(sampler.sample([10, -5, 6])),
    [2.5, 4.5, 6.5, 8.5, 10.5, 12.5],
  );
  assert.equal(sampler.sample([100, 0, 0]), null);
  assert.deepEqual(inverseAffine(affine)([10, -5, 6]), [1, 0, 0]);
  assert.throws(
    () =>
      createCsdSampler({
        hdr: { dims, affine },
        nFrame4D: 6,
        img: new Float32Array(8),
      }),
    /incomplete/,
  );
});
test("glyphs are bounded, colored, cancellable, and mask empty signal", async () => {
  const s = {
    order: 2,
    spacing: 1,
    bounds: [
      [0, 0, 0],
      [4, 4, 4],
    ],
    maximum: 1,
    sample: () => new Float64Array([1, 0, 0, 0, 0, 0]),
  };
  const g = await buildGlyphs(s, [2, 2, 2], {
    maxPerPlane: 4,
    yieldTask: async () => {},
  });
  assert.equal(g.glyphs, 12);
  assert.equal(g.colors.length, (g.positions.length / 3) * 4);
  assert.ok(g.triangles.every((i) => i < g.positions.length / 3));
  assert.ok(g.positions.every(Number.isFinite));
  assert.equal(
    await buildGlyphs(s, [2, 2, 2], {
      cancelled: () => true,
      yieldTask: async () => {},
    }),
    null,
  );
  const empty = await buildGlyphs(
    { ...s, sample: () => new Float64Array(6) },
    [2, 2, 2],
  );
  assert.equal(empty.glyphs, 0);
});
test("an oblique single-fiber FOD reconstructs the expected direction, including off-diagonal terms", () => {
  const axis = [1, -2, 3].map((v) => v / Math.sqrt(14));
  const coefficients = Array.from(
    shBasis(axis, 2),
    (v) => (v * 8 * Math.PI) / 15,
  );
  coefficients[0] = (0.2 + 1 / 3) * Math.sqrt(4 * Math.PI);
  for (const direction of sphere(2).points) {
    const actual = shBasis(direction, 2).reduce(
      (sum, v, i) => sum + v * coefficients[i],
      0,
    );
    const dot = direction.reduce((sum, v, i) => sum + v * axis[i], 0);
    close(actual, 0.2 + dot * dot);
  }
});
