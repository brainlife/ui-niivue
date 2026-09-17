// MRtrix3 real, even SH basis, including the Condon–Shortley phase.
// Coefficient index: l*(l+1)/2 + m. Directions are in scanner/world space.
// References: MRtrix3 core/math/{SH,legendre}.h.
export function shOrder(count) {
  for (let l = 2; l <= 14; l += 2)
    if (((l + 1) * (l + 2)) / 2 === count) return l;
  throw new Error(
    "CSD requires 6, 15, 28, 45, 66, 91, or 120 SH coefficients per voxel.",
  );
}
export function shBasis(direction, order) {
  const [x, y, z] = direction;
  const phi = Math.atan2(y, x),
    radial = Math.sqrt(Math.max(0, 1 - z * z));
  const result = new Float64Array(((order + 1) * (order + 2)) / 2);
  for (let m = 0; m <= order; m++) {
    let p = 1;
    for (let k = 1; k <= m; k++) p *= -(2 * k - 1) * radial;
    let prev = 0;
    for (let l = m; l <= order; l++) {
      if (l > m) {
        const next = ((2 * l - 1) * z * p - (l + m - 1) * prev) / (l - m);
        prev = p;
        p = next;
      }
      if (l % 2) continue;
      let ratio = 1;
      for (let k = l - m + 1; k <= l + m; k++) ratio /= k;
      const value =
        p *
        Math.sqrt(((2 * l + 1) * ratio) / (4 * Math.PI)) *
        (m ? Math.SQRT2 : 1);
      const center = (l * (l + 1)) / 2;
      result[center + m] = value * Math.cos(m * phi);
      if (m) result[center - m] = value * Math.sin(m * phi);
    }
  }
  return result;
}
export function sphere(subdivisions = 3) {
  const points = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  let faces = [
    [0, 2, 4],
    [2, 1, 4],
    [1, 3, 4],
    [3, 0, 4],
    [2, 0, 5],
    [1, 2, 5],
    [3, 1, 5],
    [0, 3, 5],
  ];
  for (let level = 0; level < subdivisions; level++) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = [Math.min(a, b), Math.max(a, b)].join(":");
      if (cache.has(key)) return cache.get(key);
      const p = points[a].map((v, i) => v + points[b][i]),
        length = Math.hypot(...p);
      const idx = points.push(p.map((v) => v / length)) - 1;
      cache.set(key, idx);
      return idx;
    };
    faces = faces.flatMap(([a, b, c]) => {
      const ab = mid(a, b),
        bc = mid(b, c),
        ca = mid(c, a);
      return [
        [a, ab, ca],
        [ab, b, bc],
        [ca, bc, c],
        [ab, bc, ca],
      ];
    });
  }
  return { points, faces };
}
export function inverseAffine(a) {
  const [[x, y, z], [u, v, w], [p, q, r]] = a;
  const det = x * (v * r - w * q) - y * (u * r - w * p) + z * (u * q - v * p);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-10)
    throw new Error("CSD image has an invalid spatial transform.");
  const inv = [
    [v * r - w * q, z * q - y * r, y * w - z * v],
    [w * p - u * r, x * r - z * p, z * u - x * w],
    [u * q - v * p, y * p - x * q, x * v - y * u],
  ].map((row) => row.map((n) => n / det));
  return (mm) =>
    inv.map((row) => row.reduce((sum, n, i) => sum + n * (mm[i] - a[i][3]), 0));
}
export function createCsdSampler(volume) {
  const hdr = volume.hdr,
    dims = hdr.dims.slice(1, 4),
    count = volume.nFrame4D;
  const order = shOrder(count),
    nvox = dims.reduce((a, b) => a * b, 1);
  if (!volume.img || volume.img.length !== nvox * count)
    throw new Error("CSD coefficient data is incomplete.");
  const affine = hdr.affine,
    inverse = inverseAffine(affine);
  const slope =
    Number.isFinite(hdr.scl_slope) && hdr.scl_slope !== 0 ? hdr.scl_slope : 1;
  const intercept =
    hdr.scl_slope && Number.isFinite(hdr.scl_inter) ? hdr.scl_inter : 0;
  const bounds = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ];
  for (const x of [0, dims[0] - 1])
    for (const y of [0, dims[1] - 1])
      for (const z of [0, dims[2] - 1]) {
        affine.slice(0, 3).forEach((row, i) => {
          const mm = row[0] * x + row[1] * y + row[2] * z + row[3];
          bounds[0][i] = Math.min(bounds[0][i], mm);
          bounds[1][i] = Math.max(bounds[1][i], mm);
        });
      }
  let maximum = 0;
  for (let i = 0; i < nvox; i++) {
    const c = volume.img[i] * slope + intercept;
    if (Number.isFinite(c)) maximum = Math.max(maximum, c);
  }
  const coefficients = new Float64Array(count);
  return {
    order,
    bounds,
    maximum,
    spacing: Math.min(
      ...[0, 1, 2].map((i) =>
        Math.hypot(affine[0][i], affine[1][i], affine[2][i]),
      ),
    ),
    sample(mm) {
      const xyz = inverse(mm).map(Math.round);
      if (xyz.some((v, i) => v < 0 || v >= dims[i])) return null;
      const idx = xyz[0] + dims[0] * (xyz[1] + dims[1] * xyz[2]);
      for (let c = 0; c < count; c++) {
        coefficients[c] = volume.img[idx + c * nvox] * slope + intercept;
        if (!Number.isFinite(coefficients[c])) return null;
      }
      return coefficients;
    },
  };
}
// Build only the current orthogonal slice planes, with a bounded sampling grid.
// Normalize each glyph independently to show orientation, not absolute amplitude.
export async function buildGlyphs(
  sampler,
  crosshair,
  {
    scale = 0.8,
    threshold = 0.08,
    maxPerPlane = sampler.order > 8 ? 125 : 500,
    cancelled = () => false,
    yieldTask = () => new Promise((r) => setTimeout(r, 0)),
  } = {},
) {
  const { points, faces } = sphere(sampler.order > 8 ? 4 : 3);
  const basis = points.map((p) => shBasis(p, sampler.order));
  const positions = [],
    triangles = [],
    colors = [];
  const radii = new Float64Array(points.length);
  const span = sampler.bounds[1].map((v, i) => v - sampler.bounds[0][i]);
  const step = Math.max(
    sampler.spacing,
    Math.sqrt(
      Math.max(span[0] * span[1], span[0] * span[2], span[1] * span[2]) /
        maxPerPlane,
    ),
  );
  let glyphs = 0,
    attempts = 0;
  for (let axis = 0; axis < 3; axis++) {
    const other = [0, 1, 2].filter((i) => i !== axis),
      a = other[0],
      b = other[1];
    for (
      let u = sampler.bounds[0][a] + step / 2;
      u <= sampler.bounds[1][a];
      u += step
    )
      for (
        let v = sampler.bounds[0][b] + step / 2;
        v <= sampler.bounds[1][b];
        v += step
      ) {
        if (++attempts % 32 === 0) {
          await yieldTask();
          if (cancelled()) return null;
        }
        const center = [...crosshair];
        center[a] = u;
        center[b] = v;
        const coefficients = sampler.sample(center);
        if (
          !coefficients ||
          coefficients[0] <= 0 ||
          coefficients[0] < threshold * sampler.maximum
        )
          continue;
        let peak = 0;
        for (let d = 0; d < points.length; d++) {
          let amplitude = 0;
          for (let c = 0; c < coefficients.length; c++)
            amplitude += coefficients[c] * basis[d][c];
          radii[d] = Math.max(0, amplitude);
          peak = Math.max(peak, radii[d]);
        }
        if (peak <= 0) continue;
        const offset = positions.length / 3;
        for (let d = 0; d < points.length; d++) {
          const radius = (radii[d] / peak) * step * 0.45 * scale;
          positions.push(...points[d].map((n, i) => center[i] + n * radius));
          colors.push(
            ...points[d].map((n) => Math.round(Math.abs(n) * 255)),
            255,
          );
        }
        for (const face of faces)
          triangles.push(...face.map((i) => i + offset));
        glyphs++;
      }
  }
  if (cancelled()) return null;
  return {
    positions: new Float32Array(positions),
    triangles: new Uint32Array(triangles),
    colors: new Uint8Array(colors),
    glyphs,
    step,
  };
}
