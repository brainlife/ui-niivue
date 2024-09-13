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

nv1.loadVolumes(volumeList1).then(() => {
  nv1.setSliceType(nv1.sliceTypeMultiplanar); 
}).catch((error) => {
  console.error("Error loading volumes:", error);
});
