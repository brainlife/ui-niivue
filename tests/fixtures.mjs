// Deterministic tractography fixtures: TCK, TRK and TRX writers.
export const STREAMLINES = [
  [[0, 0, 0], [1, 0, 0]],                                   // 2 points, 1 mm
  [[0, 5, 0], [10, 5, 0], [20, 5, 0]],                      // 3 points, 20 mm
  [[0, 10, 0], [10, 10, 0], [20, 10, 0], [40, 10, 0]],      // 4 points, 40 mm
];

export function tckBytes(streamlines = STREAMLINES) {
  const points = streamlines.flatMap(line => [...line, [NaN, NaN, NaN]]).concat([[Infinity, Infinity, Infinity]]);
  const bytes = Buffer.alloc(1000 + points.length * 3 * 4);
  bytes.write(`mrtrix tracks\ncount: ${streamlines.length}\ndatatype: Float32LE\nfile: . 1000\nEND\n`);
  points.flat().forEach((v, i) => bytes.writeFloatLE(v, 1000 + i * 4));
  return bytes;
}

export function trkBytes(streamlines = STREAMLINES) {
  const size = 1000 + streamlines.reduce((n, line) => n + 4 + line.length * 12, 0);
  const bytes = Buffer.alloc(size);
  bytes.write('TRACK\0', 0, 'latin1');
  [64, 64, 64].forEach((v, i) => bytes.writeInt16LE(v, 6 + i * 2));
  [1, 1, 1].forEach((v, i) => bytes.writeFloatLE(v, 12 + i * 4));
  // vox_to_ras identity at offset 440
  for (let i = 0; i < 4; i++) bytes.writeFloatLE(1, 440 + i * 20);
  bytes.write('RAS\0', 948, 'latin1');   // voxel_order
  bytes.writeInt32LE(streamlines.length, 988);
  bytes.writeInt32LE(2, 992);
  bytes.writeInt32LE(1000, 996);
  let at = 1000;
  for (const line of streamlines) {
    bytes.writeInt32LE(line.length, at); at += 4;
    for (const p of line) for (const v of p) { bytes.writeFloatLE(v, at); at += 4; }
  }
  return bytes;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Uncompressed ("stored") zip with local and central directory headers.
function zipStored(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, data] of entries) {
    const nameBytes = Buffer.from(name);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuf, end]);
}

const f32 = values => { const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeFloatLE(v, i * 4)); return b; };
const u32 = values => { const b = Buffer.alloc(values.length * 4); values.forEach((v, i) => b.writeUInt32LE(v, i * 4)); return b; };

// groups: { name: [streamline indices] }; dpv/dps: { name: values } (dpv per vertex, dps per streamline)
export function trxBytes(streamlines = STREAMLINES, { groups = {}, dpv = {}, dps = {} } = {}) {
  const positions = streamlines.flat().flat();
  const offsets = [0];
  for (const line of streamlines) offsets.push(offsets.at(-1) + line.length);
  const header = {
    DIMENSIONS: [64, 64, 64],
    NB_STREAMLINES: streamlines.length,
    NB_VERTICES: positions.length / 3,
    VOXEL_TO_RASMM: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]],
  };
  return zipStored([
    ['header.json', Buffer.from(JSON.stringify(header))],
    ['positions.3.float32', f32(positions)],
    ['offsets.uint32', u32(offsets)],
    ...Object.entries(groups).map(([name, ids]) => [`groups/${name}.uint32`, u32(ids)]),
    ...Object.entries(dpv).map(([name, values]) => [`dpv/${name}.float32`, f32(values)]),
    ...Object.entries(dps).map(([name, values]) => [`dps/${name}.float32`, f32(values)]),
  ]);
}
