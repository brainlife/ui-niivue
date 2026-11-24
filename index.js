import * as niivue from "./dist/index.js";
import { volumeOptions } from "./volume-config.js";
import { attachCsdOverlay } from "./csd-overlay.js";
import { createMeshLoader } from "./mesh-loader.js";
import { receiveConfig } from "./config-channel.js";
import { isTractDatatype } from "./tract-config.js";
import { startTractViewer } from "./tract-viewer.js";

const debugConfig = { path: "../images/mni152.nii.gz" };

const SINGLE_SLICE = {
  axial: niivue.SLICE_TYPE.AXIAL,
  coronal: niivue.SLICE_TYPE.CORONAL,
  sagittal: niivue.SLICE_TYPE.SAGITTAL,
};
function viewSettings(mode) {
  if (mode in SINGLE_SLICE) return { sliceType: SINGLE_SLICE[mode], showRender: niivue.SHOW_RENDER.NEVER };
  return {
    sliceType: mode === "3d" ? niivue.SLICE_TYPE.RENDER : niivue.SLICE_TYPE.MULTIPLANAR,
    showRender: mode === "slices" ? niivue.SHOW_RENDER.NEVER : niivue.SHOW_RENDER.ALWAYS,
  };
}

const drop = document.getElementById("sliceType");
drop.onchange = function () {
  const { sliceType, showRender } = viewSettings(drop.value);
  nv1.showRender = showRender;
  nv1.sliceType = sliceType;
  nv1.resize();
};

function handleIntensityChange(data) {
  const label = document.getElementById("intensity");
  if (label) label.textContent = "  " + data.string;
}

const nv1 = new niivue.NiiVue({
  backend: "webgl2",
  sliceType: niivue.SLICE_TYPE.RENDER,
  showRender: niivue.SHOW_RENDER.ALWAYS,
  isDragDropEnabled: true,
  isRulerVisible: true,
  is3DCrosshairVisible: true,
});

nv1.addEventListener("locationChange", event => handleIntensityChange(event.detail));
const meshLoader = createMeshLoader(nv1);
let csdOverlay;
window.addEventListener("pagehide", async () => {
  await csdOverlay?.dispose();
  await meshLoader.settled();
  nv1.destroy();
}, { once: true });

async function initializeViewer() {
const received = await receiveConfig(window);
if (!received) console.log("Config not set.. using debug config");
const config = received || debugConfig;
nv1.volumeIsNearestInterpolation = config.datatype === "neuro/mask";
await nv1.attachTo("gl1");

if (isTractDatatype(config.datatype)) {
  // Tracts are easiest to read with slices for context next to the 3D render.
  drop.value = "combined";
  drop.onchange();
  await startTractViewer(nv1, meshLoader, config);
} else {
  await nv1.loadVolumes([volumeOptions(config)]);
  if (config.datatype === "neuro/csd") {
    csdOverlay = attachCsdOverlay(nv1, meshLoader, nv1.volumes[0]);
  }
}

}
initializeViewer().catch(error => {
  console.error("Error loading viewer:", error);
  const message = document.createElement("div");
  message.setAttribute("role", "alert");
  message.textContent = "Unable to load image: " + error.message;
  document.body.prepend(message);
});

// These controls map directly to the new reactive viewer properties.
document.getElementById("layoutSelect").onchange = event => { nv1.multiplanarType = Number(event.target.value); };
document.getElementById("equalCheck").onchange = event => { nv1.isEqualSize = event.target.checked; };
