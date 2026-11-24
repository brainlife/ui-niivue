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
  const options = {
    fiberRadius: state.radius, fiberSides: 3, decimation: state.stride, minLength: state.minLength,
    visibleGroups: hasGroups ? visible : null,
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
    Object.assign(options, { colorBy: color, colormap: state.colormap, calMin: state.calMin, calMax: state.calMax });
  }
  return options;
}
