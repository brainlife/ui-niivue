import * as niivue from "../dist/index.js";
// import { Niivue } from "@niivue/niivue";

let config = window.parent.config || window.config;
if (!config) {
  console.log("Config not set.. using debug config");
  config = {
    path: "../images/mni152.nii.gz", 
  };
}

const drop = document.getElementById("sliceType");
drop.onchange = function () {
  const st = parseInt(document.getElementById("sliceType").value);
  nv1.setSliceType(st);
}

function handleIntensityChange(data) {
  document.getElementById("intensity").innerHTML = "&nbsp;&nbsp;" + data.string;
  console.log(data);
}

const volumeList1 = [
  { 
    url: config.path, // Use the dynamic path from the config object
    colormap: "gray",
    visible: true,
  }, 
];

const nv1 = new niivue.Niivue({
  dragAndDropEnabled: true,
  onLocationChange: handleIntensityChange, 
  isRuler: true, 
  show3Dcrosshair: true, 
});

nv1.attachTo("gl1");

if (config.datatype === "neuro/tcks") {
  // nifti.vue enumerates every .tck file and passes a colored mesh per file
  const meshes = config.meshes || [];
  nv1.loadMeshes(meshes)
    .then(() => {
      nv1.setSliceType(nv1.sliceTypeMultiplanar);
      setupFiberControls();
    })
    .catch(err => console.error("Error loading tcks:", err));
} else {
  nv1.loadVolumes(volumeList1).then(() => {
    nv1.setSliceType(nv1.sliceTypeMultiplanar);
  }).catch((error) => {
    console.error("Error loading volumes:", error);
  });
}

// wire up the fiber (.tck) display controls already present in index.html
function setupFiberControls() {
  const applyAll = (key, val) => nv1.meshes.forEach(m => nv1.setMeshProperty(m.id, key, val));

  const radius = document.getElementById("fiberRadius");
  if (radius) radius.oninput = () => applyAll("fiberRadius", radius.value / 10);

  const dither = document.getElementById("fiberDitherSlider");
  if (dither) dither.oninput = () => applyAll("fiberDither", dither.value / 10);

  const color = document.getElementById("fiberColor");
  if (color) color.onchange = () => applyAll("fiberColor", color.value);

  const colormap = document.getElementById("fiberColormap");
  if (colormap) colormap.onchange = () => applyAll("colormap", colormap.value);

  const calMin = document.getElementById("fiberCalMin");
  if (calMin) calMin.oninput = () => applyAll("fiberLength", parseFloat(calMin.value));
}
