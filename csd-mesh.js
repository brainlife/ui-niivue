// MZ3 is a public NiiVue mesh input, avoiding private renderer constructors.
// Little-endian header, triangle indices, XYZ positions, then RGBA bytes.
export function glyphMeshFile({ positions, triangles, colors }) {
  const bytes = new ArrayBuffer(16 + triangles.byteLength + positions.byteLength + colors.byteLength);
  const view = new DataView(bytes);
  view.setUint16(0, 23117, true);
  view.setUint16(2, 7, true); // faces | vertices | RGBA
  view.setUint32(4, triangles.length / 3, true);
  view.setUint32(8, positions.length / 3, true);
  let offset = 16;
  for (const index of triangles) { view.setUint32(offset, index, true); offset += 4; }
  for (const value of positions) { view.setFloat32(offset, value, true); offset += 4; }
  new Uint8Array(bytes, offset).set(colors);
  return new File([bytes], 'csd-glyphs.mz3', { type: 'application/octet-stream' });
}
