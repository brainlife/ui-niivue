<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/brand/brainlife-mark-on-dark.svg">
    <img src=".github/brand/brainlife-mark-on-light.svg" alt="brainlife.io" width="140">
  </picture>
</p>

<h1 align="center">ui-niivue</h1>

<p align="center">
  See your brainlife.io data in the browser: volumes, masks, tractograms and fibre orientations, with NiiVue.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-active-brightgreen.svg" alt="Status: active">
  <a href="https://brainlife.io"><img src="https://img.shields.io/badge/brainlife.io-site-3b9fd0.svg" alt="brainlife.io"></a>
  <a href="https://brainlife.io/docs"><img src="https://img.shields.io/badge/Docs-brainlife.io%2Fdocs-005981.svg" alt="Documentation"></a>
  <a href="https://doi.org/10.1038/s41592-024-02237-2"><img src="https://img.shields.io/badge/DOI-10.1038%2Fs41592--024--02237--2-e57536.svg" alt="Nature Methods paper"></a>
</p>

## 🧠 At a glance

| | |
|---|---|
| 🧭 **What** | Static web viewer opened by brainlife.io for a dataset; the parent page sets `window.config` (datatype, URL, filename) and the viewer loads it |
| 🧠 **Datatypes** | NIfTI volumes (incl. `neuro/microscopy/nifti`), `neuro/mask` (nearest-neighbour), tractograms, `neuro/csd` (FOD glyph overlay) |
| 🧱 **Stack** | [NiiVue](https://github.com/niivue/niivue) `1.0.0-rc.16` (WebGL2) · plain ES modules bundled by `build.mjs` · Node test runner · Playwright |
| 🌐 **Served from** | The warehouse UI at `/ui/niivue/`, wrapped by `ui/src/datauis/nifti.vue` in [warehouse-next](https://github.com/brainlife/warehouse-next) |

## 🚀 Quick start

```bash
git clone https://github.com/brainlife/ui-niivue && cd ui-niivue
npm ci
npm run build          # regenerates the checked-in dist/index.js
npm start              # dev server (web-dev-server) with watch
npm test               # configuration tests (Node 18 or later)
npm run test:browser   # Playwright
```

Point the viewer at a file by setting `window.config` before `index.js` loads:

```js
window.config = {
  datatype: 'neuro/microscopy/nifti',
  path: 'https://dandiarchive.s3.amazonaws.com/blobs/ASSET_BLOB_ID',
  name: 'image.nii.gz',   // the filename identifies the format when the URL has no extension
};
```

Public remote URLs must allow browser CORS; never append brainlife tokens to public provider URLs.

## 📦 Deploying

Changing the npm dependency alone does not update the viewer: run `npm run build`, then deploy `index.html`, `index.js`, `dist/index.js`, `volume-config.js`, `mesh-loader.js`, `csd-mesh.js`, `csd-overlay.js` and `csd-glyphs.js` together. The warehouse wrapper must support any new datatype and pass the resolved URL.

<details>
<summary><b>🧭 CSD orientation overlay</b></summary>

For `datatype: 'neuro/csd'`, supply the URL and filename of an `lmax*.nii.gz` volume. The viewer uses its first coefficient volume as the grayscale background and displays orientation-coloured FOD glyphs on the three current slice planes. No separate T1 image or `response.txt` is required.

The overlay supports MRtrix3 real, even spherical harmonics (orders 2–14), using the coefficient ordering and phase in MRtrix3's `core/math/SH.h` and `core/math/legendre.h`. It does not convert legacy MRtrix 0.2 or other SH bases. Voxel positions use the NIfTI affine; FOD directions use scanner/world coordinates. Red, green and blue encode the absolute world X, Y and Z directions.

Glyphs are normalized independently for orientation inspection, not quantitative amplitude comparison. Negative lobes are clipped to zero. Voxels below 8% of the maximum zeroth coefficient are hidden. A bounded nearest-neighbour sampling grid keeps slice navigation responsive (about 500 samples per plane, or 125 for orders above 8). Use **CSD glyphs** to toggle the overlay and **Glyph size** to scale it.

</details>

<details>
<summary><b>⬆️ NiiVue 1.0 migration notes</b></summary>

The viewer uses the `NiiVue` class, reactive display properties, `locationChange` events, index-based mesh removal and `setTractOptions`. CSD geometry loads through the public MZ3 `File` interface with per-vertex orientation colours. The warehouse `window.config` contract is unchanged.

rc.16 tessellates tracts as tubes: initial loads use a 0.1 mm radius and three sides and auto-load only the first bundle. Large tractograms need memory validation before production rollout. Stride (every Nth streamline) replaces the old dither control; colour minimum controls scalar colour mapping. `mesh-loader.js` repairs rc.16's TCK fenceposts, which otherwise omit the first streamline; re-evaluate this on the next NiiVue upgrade.

</details>

## 🔗 Related repositories

| Repository | Role |
|---|---|
| [warehouse-next](https://github.com/brainlife/warehouse-next) | Hosts the viewer and passes it `window.config` |
| [brainlife-lite](https://github.com/brainlife/brainlife-lite) | Web app with its own embedded NiiVue viewer |
| [ui-tractview](https://github.com/brainlife/ui-tractview) | Earlier tract viewer |

## 📚 Citing

If you use brainlife.io in your work, please cite:

> Hayashi S, Caron BA, Heinsfeld AS, et al. brainlife.io: a decentralized and open-source cloud platform to support neuroscience research. *Nature Methods* 21:809–813 (2024). [doi:10.1038/s41592-024-02237-2](https://doi.org/10.1038/s41592-024-02237-2)

## 💰 Funding

brainlife.io is developed by the Pestilli Lab at The University of Texas at Austin and is publicly funded; acknowledging that support helps keep it running.

<details>
<summary>Grants (verified list, from <a href="https://github.com/brainlife/ezbids/blob/master/CREDITS.md#funding">ezbids CREDITS.md</a>)</summary>

| Funder | Award | Title |
|---|---|---|
| NIH NINDS | [U24NS140384](https://reporter.nih.gov/project-details/U24NS140384) | BRAIN CONNECTS: The Axonal Projectome EXchange (APEX) |
| NIH NIMH | [R01MH126699](https://reporter.nih.gov/project-details/R01MH126699) | Community-driven development of BIDS |
| NIH NIBIB | [R01EB030896](https://reporter.nih.gov/project-details/R01EB030896) | CRCNS US-France: open science and cloud computing of MEEG |
| NIH NIBIB | [R01EB029272](https://reporter.nih.gov/project-details/R01EB029272) | CRCNS US-France: lowering the barrier of entry to network neuroscience |
| NSF | [BCS-1636893](https://www.nsf.gov/awardsearch/showAward?AWD_ID=1636893), [2148729](https://www.nsf.gov/awardsearch/showAward?AWD_ID=2148729) | BD Spokes: Advanced Computational Neuroscience Network |
| NSF | [BCS-1734853](https://www.nsf.gov/awardsearch/showAward?AWD_ID=1734853), [2203524](https://www.nsf.gov/awardsearch/showAward?AWD_ID=2203524) | NCS-FO: Connectome mapping algorithms |
| NSF | [IIS-1912270](https://www.nsf.gov/awardsearch/showAward?AWD_ID=1912270), [2148700](https://www.nsf.gov/awardsearch/showAward?AWD_ID=2148700) | CRCNS US-German: DataLad |
| NSF | [ACI-1916518](https://www.nsf.gov/awardsearch/showAward?AWD_ID=1916518) | BD Hubs: Midwest Big Data Hub |
| Wellcome Trust | [226486](https://grantnav.threesixtygiving.org/grant/360G-Wellcome-226486_Z_22_Z) | Developing an international governance framework to advance global brain and mental health data equity and innovation |

</details>

## 🤝 Contributing

Issues and pull requests are welcome in this repository. For help using brainlife.io, see the [documentation](https://brainlife.io/docs).

## ⚖️ License

This repository does not include a license file yet.

<p align="center"><sub>brainlife.io · Brain data across scales. One place to analyze, share and publish it. · The University of Texas at Austin</sub></p>
