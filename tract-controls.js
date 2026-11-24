// Pure helpers behind the tract display controls.

// Golden-angle colours, by index (the same ones the tcks checklist uses).
export function groupPalette(names) {
  const out = {};
  names.forEach((name, index) => {
    const hue = index * 137.508 * Math.PI / 180;
    out[name] = [0, 2 * Math.PI / 3, 4 * Math.PI / 3].map(phase => Math.round(145 + 100 * Math.cos(hue + phase))).concat(255);
  });
  return out;
}

export function scalarChoices(trx) {
  return [
    ...Object.keys(trx?.dpv || {}).map(n => ({ value: `dpv:${n}`, label: `${n} (per point)` })),
    ...Object.keys(trx?.dps || {}).map(n => ({ value: `dps:${n}`, label: `${n} (per streamline)` })),
  ];
}

// state: { color, colormap, calMin, calMax, radius, stride, minLength, visibleGroups }
export function tractOptionsFor(state, { groupNames = [], fileColor } = {}) {
  const hasGroups = groupNames.length > 0;
  const visible = state.visibleGroups || [];
  // With every group ticked no mask is needed (a mask would only ever drop streamlines).
  const everyGroup = hasGroups && groupNames.every(name => visible.includes(name));
  const options = {
    fiberRadius: state.radius, fiberSides: 3, decimation: state.stride, minLength: state.minLength,
    visibleGroups: hasGroups && !everyGroup ? visible : null,
    groupColors: null,
  };
  const color = state.color;
  if (color === 'local') options.colorBy = '';
  else if (color === 'global') options.colorBy = 'global';
  else if (color === 'fixed') { options.colorBy = 'fixed'; options.fixedColor = fileColor ?? [255, 255, 255, 255]; }
  else if (color === 'bundle') {
    if (hasGroups) {
      const palette = groupPalette(groupNames);
      options.groupColors = Object.fromEntries(visible.filter(n => n in palette).map(n => [n, palette[n]]));
    } else { options.colorBy = 'fixed'; options.fixedColor = fileColor ?? [255, 255, 255, 255]; }
  } else {
    Object.assign(options, { colorBy: color, colormap: state.colormap });
    // An empty box sends no key: NiiVue auto-ranges only when the range is 0 or absent.
    if (state.calMin !== undefined) options.calMin = state.calMin;
    if (state.calMax !== undefined) options.calMax = state.calMax;
  }
  return options;
}

// TRX streamlines that belong to no group, as one more group, so a group list
// (which drives visibleGroups and groupColors) can still show them.
// Returns { name, ids } or null when the groups cover every streamline.
export function ungroupedGroup(groups, count) {
  const names = Object.keys(groups || {});
  if (!names.length) return null;
  const grouped = new Uint8Array(count);
  for (const name of names) for (const id of groups[name]) if (id < count) grouped[id] = 1;
  const ids = [];
  for (let i = 0; i < count; i++) if (!grouped[i]) ids.push(i);
  if (!ids.length) return null;
  let name = 'Other streamlines';
  for (let n = 2; Object.hasOwn(groups, name); n++) name = `Other streamlines (${n})`;
  return { name, ids: Uint32Array.from(ids) };
}
