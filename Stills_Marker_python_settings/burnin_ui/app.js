const API_BASE = "http://127.0.0.1:8765";

const OGC_PRESETS = {
  arri_alexa35: [4608, 3164],
  arri_alexalf: [4448, 3096],
  sony_venice1: [6048, 4032],
  sony_venice2: [8640, 5760],
};

function getOGCNativeRatio() {
  const preset = state.open_gate_crop_preset || "arri_alexa35";
  if (preset === "custom") {
    const w = Number(state.open_gate_crop_custom_w) || 3;
    const h = Number(state.open_gate_crop_custom_h) || 2;
    return w / h;
  }
  const dims = OGC_PRESETS[preset] || [4608, 3164];
  return dims[0] / dims[1];
}

const els = {
  saveStatus: document.getElementById("saveStatus"),

  metadataTokenList: document.getElementById("metadataTokenList"),
  metaPosX: document.getElementById("metaPosX"),
  metaPosXVal: document.getElementById("metaPosXVal"),
  metaPosY: document.getElementById("metaPosY"),
  metaPosYVal: document.getElementById("metaPosYVal"),
  metaAlign: document.getElementById("metaAlign"),
  metaFontSize: document.getElementById("metaFontSize"),
  metaOpacity: document.getElementById("metaOpacity"),
  metaOpacityVal: document.getElementById("metaOpacityVal"),
  metaBold: document.getElementById("metaBold"),
  metaFontFamily: document.getElementById("metaFontFamily"),
  metaTemplateCustom: document.getElementById("metaTemplateCustom"),
  metaColor: document.getElementById("metaColor"),
  btnAddMeta: document.getElementById("btnAddMeta"),
  burninLayoutList: document.getElementById("burninLayoutList"),

  imgPicker: document.getElementById("imgPicker"),

  fontPath: document.getElementById("fontPath"),
  fontFilePicker: document.getElementById("fontFilePicker"),
  opacity: document.getElementById("opacity"),
  opacityVal: document.getElementById("opacityVal"),

  btnReload: document.getElementById("btnReload"),

  canvas: document.getElementById("previewCanvas"),

  metaBgOpacity: document.getElementById("metaBgOpacity"),
  metaBgOpacityVal: document.getElementById("metaBgOpacityVal"),
  imageRatio: document.getElementById("imageRatio"),
  maskOpacityVal: document.getElementById("maskOpacityVal"),
};

const ctx = els.canvas.getContext("2d");

let state = {
  selectedIndex: null,
  burnin_font_path: "",
  burnin_opacity: 0.5,
  burnin_font_family: "Arial",
  elements: [],
  image_ratio: 1.77,
  image_ratio_mode: "crop", // "crop" | "fit"
  mask_style: "bars",       // "bars" | "lines" | "bars_lines"
  mask_opacity: 1.0,
  open_gate_crop_preset: "arri_alexa35",
  open_gate_crop_custom_w: 3,
  open_gate_crop_custom_h: 2,
  open_gate_safety: 100,
  ogc_show_frameline: false,
  frameline_orientation: "horizontal_16_9", // "horizontal_16_9" | "vertical_9_16"
  frameline_offset_x: 0,  // % of canvas width,  0 = centré
  frameline_offset_y: 0,  // % of canvas height, 0 = centré
  still_naming_template: "",
};

// --- Undo / Redo Stacks ---
let undoStack = [];
let redoStack = [];
const MAX_UNDO = 50;

function pushUndoState(){
  // Deep clone only elements (lightweight history)
  const snapshot = JSON.stringify(state.elements);
  undoStack.push(snapshot);
  if(undoStack.length > MAX_UNDO){
    undoStack.shift();
  }
  // Any new action clears the redo stack
  redoStack = [];
}

function undoLastAction(){
  if(undoStack.length === 0) return;
  // Save current state to redo stack before reverting
  redoStack.push(JSON.stringify(state.elements));
  const last = undoStack.pop();
  try{
    state.elements = JSON.parse(last);
    state.selectedIndex = null;
    renderLayoutList();
    render();
    setStatus("Annulation","ok");
  }catch(e){
    console.warn("Undo failed", e);
  }
}

function redoLastAction(){
  if(redoStack.length === 0) return;
  // Save current state to undo stack before re-applying
  undoStack.push(JSON.stringify(state.elements));
  const next = redoStack.pop();
  try{
    state.elements = JSON.parse(next);
    state.selectedIndex = null;
    renderLayoutList();
    render();
    setStatus("Rétabli","ok");
  }catch(e){
    console.warn("Redo failed", e);
  }
}

// Map UI metadata keys to real JSON paths inside Timeline_*_stills_full_metadata.json
// Order of lookup matters.
const metadataKeyMap = {
  "timeline_frame": ["timeline_frame"],
  "timeline_TC": ["timeline_TC", "timeline_tc"],

  "Timeline": [
    "timeline_name",
    "Timeline",
    "timeline"
  ],

  "Clipname": [
    "clip_name",
    "Clipname",
    "clip_properties.Clip Name"
  ],

  "Source_TC": [
    "source_tc",
    "Source_TC"
  ],

  "Source_Resolution": [
    "source_resolution",
    "Source_Resolution"
  ],

  "Scene": [
    "metadata.Scene",
    "clip_properties.Scene",
    "Scene"
  ],

  "Shot": [
    "metadata.Shot",
    "clip_properties.Shot",
    "Shot"
  ],

  "Take": [
    "metadata.Take",
    "clip_properties.Take",
    "Take"
  ],

  "Good_Take": [
    "metadata.Good Take",
    "clip_properties.Good Take",
    "Good_Take"
  ],

  "Camera_#": [
    "metadata.Camera #",
    "clip_properties.Camera #",
    "metadata.Camera#",
    "Camera_#"
  ],

  "Reel_Name": [
    "clip_properties.Reel Name",
    "Reel_Name"
  ],

  "File_Name": [
    "clip_properties.File Name",
    "File_Name"
  ],

  "Resolution": [
    "clip_properties.Resolution",
    "Resolution"
  ],

  "FPS": [
    "clip_properties.FPS",
    "FPS"
  ],

  "Duration": [
    "clip_properties.Duration",
    "Duration"
  ],

  "Start_TC": [
    "clip_properties.Start TC",
    "Start_TC"
  ],

  "End_TC": [
    "clip_properties.End TC",
    "End_TC"
  ],

  "Video_Codec": [
    "clip_properties.Video Codec",
    "Video_Codec"
  ],

  "Shutter_Angle": [
    "clip_properties.Shutter Angle",
    "Shutter_Angle"
  ],

  "LUT1": [
    "clip_properties.LUT 1",
    "LUT1"
  ],

  "LUT2": [
    "clip_properties.LUT 2",
    "LUT2"
  ],

  "LUT3": [
    "clip_properties.LUT 3",
    "LUT3"
  ],

  "Comments": [
    "clip_properties.Comments",
    "Comments"
  ],

  "Angle": [
    "metadata.Angle",
    "clip_properties.Angle",
    "Angle"
  ],

  "Move": [
    "metadata.Move",
    "clip_properties.Move",
    "Move"
  ],

  "Keywords": [
    "metadata.Keywords",
    "clip_properties.Keywords",
    "Keywords"
  ],

  "Shoot_Day": [
    "metadata.Shoot Day",
    "clip_properties.Shoot Day",
    "Shoot_Day"
  ],

  "Date_Recorded": [
    "metadata.Date Recorded",
    "clip_properties.Date Recorded",
    "Date_Recorded"
  ],

  "Location": [
    "metadata.Location",
    "clip_properties.Location",
    "Location"
  ],

  "Setup": [
    "metadata.Setup",
    "clip_properties.Setup",
    "Setup"
  ],

  "Camera_Type": [
    "metadata.Cam Type",
    "clip_properties.Cam Type",
    "Camera_Type"
  ],

  "Camera_Serial": [
    "metadata.Cam Serial #",
    "clip_properties.Cam Serial #",
    "Camera_Serial"
  ],

  "Camera_ID": [
    "metadata.Cam ID",
    "clip_properties.Cam ID",
    "Camera_ID"
  ],

  "Camera_Notes": [
    "metadata.Cam Notes",
    "clip_properties.Cam Notes",
    "Camera_Notes"
  ],

  "ISO": [
    "metadata.ISO",
    "clip_properties.ISO",
    "ISO"
  ],

  "White_Balance": [
    "metadata.White Point (Kelvin)",
    "clip_properties.White Point (Kelvin)",
    "metadata.White Point",
    "clip_properties.White Point",
    "White_Balance"
  ],

  "White_Balance_Tint": [
    "metadata.White Balance Tint",
    "clip_properties.White Balance Tint",
    "White_Balance_Tint"
  ],

  "Lens_Type": [
    "metadata.Lens Type",
    "clip_properties.Lens Type",
    "Lens_Type"
  ],

  "Lens_Notes": [
    "metadata.Lens Notes",
    "clip_properties.Lens Notes",
    "Lens_Notes"
  ],

  "Aperture": [
    "metadata.Camera Aperture",
    "clip_properties.Camera Aperture",
    "metadata.Cam Aperture",
    "clip_properties.Cam Aperture",
    "Aperture"
  ],

  "Focal_Length": [
    "metadata.Focal Point (mm)",
    "clip_properties.Focal Point (mm)",
    "Focal_Length"
  ],

  "Filter": [
    "metadata.Filter",
    "clip_properties.Filter",
    "Filter"
  ],

  "LUT_Used": [
    "metadata.LUT Used",
    "clip_properties.LUT Used",
    "LUT_Used"
  ],

  "Director": [
    "metadata.Director",
    "clip_properties.Director",
    "Director"
  ],

  "DOP": [
    "metadata.DOP",
    "clip_properties.DOP",
    "DOP"
  ],

  "Production_Name": [
    "metadata.Production Name",
    "clip_properties.Production Name",
    "Production_Name"
  ],

  "Record_TC": [
    "record_tc",
    "Record_TC"
  ],

  "Date": [
    "metadata.Date",
    "clip_properties.Date",
    "Date"
  ],

  "Project_Name": [
    "project_name",
    "Project_Name"
  ],

  "Marker_Name": [
    "marker_name",
    "Marker_Name"
  ],

  "Marker_Notes": [
    "marker_notes",
    "Marker_Notes"
  ]
};
let metadataKeys = Object.keys(metadataKeyMap);

// Keys shown at top of the token list without "show more"
const FAVORITES = [
  "Timeline", "Clipname", "Camera_#", "Scene", "Shot", "Take",
  "Start_TC", "End_TC", "Shoot_Day", "ISO", "White_Balance",
  "Date", "Reel_Name", "Resolution", "FPS", "Source_TC",
  "Good_Take", "Video_Codec", "Source_Resolution", "File_Name", "Duration"
];

// --- Custom template parsing ---
// Supports writing: "%Scene / %Shot - %Take %Camera#" and stores it as parts.
const tokenAliasMap = {
  "Camera#": "Camera_#",
  "Camera": "Camera_#", // optional convenience
};

function normalizeTokenKey(raw){
  const t = String(raw || "").trim();
  if(!t) return "";
  // Remove leading % if present
  const noPct = t.startsWith("%") ? t.slice(1) : t;
  // Exact alias match first
  if(tokenAliasMap[noPct]) return tokenAliasMap[noPct];
  // Accept Camera# as Camera_#
  if(noPct.toLowerCase() === "camera#") return "Camera_#";
  // Keep as-is
  return noPct;
}

function compileTemplateParts(templateStr){
  const s = String(templateStr || "");
  const parts = [];
  const re = /%[A-Za-z0-9#](?:[A-Za-z0-9_#]*[A-Za-z0-9#])?/g;
  let last = 0;
  let m;
  while((m = re.exec(s))){
    if(m.index > last){
      parts.push({ type: "text", value: s.slice(last, m.index) });
    }
    const rawToken = m[0];
    const tokenKey = normalizeTokenKey(rawToken);
    if(tokenKey){
      // Accept ANY %Token and let Python resolve it later
      parts.push({ type: "token", value: tokenKey });
    } else {
      parts.push({ type: "text", value: rawToken });
    }
    last = m.index + rawToken.length;
  }
  if(last < s.length){
    parts.push({ type: "text", value: s.slice(last) });
  }
  // Merge adjacent text nodes
  const merged = [];
  for(const p of parts){
    const prev = merged[merged.length - 1];
    if(prev && prev.type === "text" && p.type === "text"){
      prev.value += p.value;
    } else {
      merged.push(p);
    }
  }
  // --- Return object with parts and explicit token list
  const tokenKeys = merged
    .filter(p => p.type === "token")
    .map(p => p.value);

  return {
    parts: merged,
    tokens: tokenKeys
  };
}

function buildTextFromParts(previewMetadata, templateObj){
  if(!templateObj || !Array.isArray(templateObj.parts)) return "";
  const parts = templateObj.parts;
  let out = "";

  for(const p of parts){
    if(p.type === "text"){
      out += String(p.value || "");
    }
    else if(p.type === "token"){
      const rawValue = resolveMetadataValue(previewMetadata, p.value);

      // Special case: Good_Take = 1/true/yes → display as [*]
      if(p.value === "Good_Take"){
        out += "[Good_Take]";
        continue;
      }

      if(rawValue && String(rawValue).trim() !== ""){
        out += `[${rawValue}]`;
      } else {
        // If metadata missing, show token name
        out += `[${p.value}]`;
      }
    }
  }

  return out;
}

let bgImage = null;
let saveTimer = null;

let drag = { active:false, index:null, offsetX:0, offsetY:0, snapAxisX:null, snapAxisY:null, snapTypeX:null, snapTypeY:null };

// Axes magnétiques fixes (relatif 0-1)
const SNAP_AXES_X = [0, 0.05, 0.1, 0.333, 0.5, 0.667, 0.9, 0.95, 1.0];
const SNAP_AXES_Y = [0, 0.05, 0.1, 0.333, 0.5, 0.667, 0.9, 0.95, 1.0];
const SNAP_THRESHOLD = 0.02;

function snapToAxis(val, fixedAxes, dynamicAxes, threshold) {
  const allAxes = fixedAxes.concat(dynamicAxes);
  for (const axis of allAxes) {
    if (Math.abs(val - axis) < threshold) return axis;
  }
  return val;
}
let lastBoxes = []; // [{index, x,y,w,h}]
let activeFrameline = null; // OGC frameline rect {x,y,w,h} — set each render(), used by drag
const loadedFontFamilies = new Set(["Arial"]);
const systemFontFamilies = [
  "Arial","Helvetica","Times New Roman","Courier New","Verdana",
  "Georgia","Trebuchet MS","Avenir","Menlo","Monaco"
];

function pctLabel(v01){
  const p = (clamp(v01,0,1)*100).toFixed(1);
  return `${p}%`;
}

function fillSelect(el, values, current){
  if(!el) return;
  const prev = el.value;
  el.innerHTML = "";
  values.forEach(v=>{
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    el.appendChild(opt);
  });
  el.value = current || prev || values[0] || "";
}

function getValueByPath(obj, path){
  const parts = String(path||"").split(".");
  let val = obj;
  for(const p of parts){
    if(val && typeof val === "object" && p in val){
      val = val[p];
    } else {
      return undefined;
    }
  }
  return val;
}

function resolveMetadataValue(previewMetadata, uiKey){
  if(!previewMetadata || !uiKey) return "";

  // 1) If key exists in explicit metadataKeyMap, try mapped paths first
  const mappedPaths = metadataKeyMap[uiKey];
  if(Array.isArray(mappedPaths)){
    for(const path of mappedPaths){
      const val = getValueByPath(previewMetadata, path);
      if(val !== undefined && val !== null && String(val).trim() !== ""){
        return String(val);
      }
    }
  }

  // 2) Dynamic fallback:
  // Allow ANY token name that matches directly in metadata JSON
  // Supports nested lookup in:
  // - top-level
  // - metadata
  // - clip_properties

  const normalize = (s) =>
    String(s || "")
      .replace(/\s+/g, "_")
      .replace("#", "_#")
      .toLowerCase()
      .trim();

  const target = normalize(uiKey);

  // Top-level
  for(const k in previewMetadata){
    if(normalize(k) === target){
      const v = previewMetadata[k];
      if(v !== undefined && v !== null && String(v).trim() !== ""){
        return String(v);
      }
    }
  }

  // metadata block
  if(previewMetadata.metadata && typeof previewMetadata.metadata === "object"){
    for(const k in previewMetadata.metadata){
      if(normalize(k) === target){
        const v = previewMetadata.metadata[k];
        if(v !== undefined && v !== null && String(v).trim() !== ""){
          return String(v);
        }
      }
    }
  }

  // clip_properties block
  if(previewMetadata.clip_properties && typeof previewMetadata.clip_properties === "object"){
    for(const k in previewMetadata.clip_properties){
      if(normalize(k) === target){
        const v = previewMetadata.clip_properties[k];
        if(v !== undefined && v !== null && String(v).trim() !== ""){
          return String(v);
        }
      }
    }
  }

  return "";
}

function getItemText(previewMetadata, item){
  if(!previewMetadata) return "";

  if(item.key === "custom"){
    // Prefer structured parts (source of truth)
    if(item.template_parts && item.template_parts.parts){
      const out = buildTextFromParts(previewMetadata, item.template_parts);
      if(out && out.trim() !== ""){
        return out;
      }
      return "[custom]";
    }

    // Fallback for older saves: compile from template_custom
    if(item.template_custom && String(item.template_custom).includes("%")){
      const tplObj = compileTemplateParts(item.template_custom);
      item.template_parts = tplObj;
      item.custom_tokens = tplObj.tokens;
      const out = buildTextFromParts(previewMetadata, tplObj);
      if(out && out.trim() !== ""){
        return out;
      }
      return "[custom]";
    }

    return "[custom]";
  }

  const val = resolveMetadataValue(previewMetadata, item.key);
  return val || `[${item.key}]`;
}

// Conditional formatting (minimal v1): if Good_Take is truthy -> bold
function applyConditionalFormatting(previewMetadata, item){
  const out = {
    font_weight: item.font_weight || "normal",
    opacity: (item.opacity != null ? Number(item.opacity) : state.burnin_opacity)
  };
  // Example conditional: make bold when Good_Take truthy
  const gt = resolveMetadataValue(previewMetadata, "Good_Take");
  if(String(gt).trim().toLowerCase() === "1" || String(gt).trim().toLowerCase() === "true" || String(gt).trim().toLowerCase() === "yes"){
    out.font_weight = "bold";
  }
  return out;
}

function setStatus(text, mode){
  els.saveStatus.textContent = text;
  els.saveStatus.style.color =
    mode === "ok" ? "#22c55e" :
    mode === "bad" ? "#ef4444" : "#9aa3b2";
}

function bindInputs(){

  if(els.opacity){
    els.opacity.addEventListener("input", () => {
      state.burnin_opacity = Number(els.opacity.value);
      if(els.opacityVal) els.opacityVal.value = state.burnin_opacity.toFixed(2);
      render();
      scheduleSave();
    });
  }

  if(els.opacityVal){
    els.opacityVal.addEventListener("input", () => {
      state.burnin_opacity = clamp(Number(els.opacityVal.value), 0, 1);
      if(els.opacity) els.opacity.value = state.burnin_opacity;
      render();
      scheduleSave();
    });
  }

  els.btnReload.addEventListener("click", loadFromServer);

  const tokenSearchInput = document.getElementById("tokenSearch");
  if(tokenSearchInput){
    tokenSearchInput.addEventListener("input", () => {
      renderMetadataTokens(tokenSearchInput.value);
    });
  }
  // --- Help Overlay ---
  const btnHelp = document.getElementById("btnHelp");
  const helpOverlay = document.getElementById("helpOverlay");
  const btnCloseHelp = document.getElementById("btnCloseHelp");

  if(btnHelp && helpOverlay){
    btnHelp.addEventListener("click", ()=>{
      helpOverlay.classList.remove("hidden");
    });
  }

  if(btnCloseHelp && helpOverlay){
    btnCloseHelp.addEventListener("click", ()=>{
      helpOverlay.classList.add("hidden");
    });
  }

  // --- Presets Overlay ---
  const btnPresets = document.getElementById("btnPresets");
  const presetsOverlay = document.getElementById("presetsOverlay");
  const btnClosePresets = document.getElementById("btnClosePresets");

  if (btnPresets) {
    btnPresets.addEventListener("click", fetchAndShowPresets);
  }
  if (btnClosePresets && presetsOverlay) {
    btnClosePresets.addEventListener("click", () => {
      presetsOverlay.classList.add("hidden");
    });
  }

  // Keyboard shortcuts
  document.addEventListener("keydown", (ev)=>{
    // Escape: close overlays
    if(ev.key === "Escape"){
      if(helpOverlay && !helpOverlay.classList.contains("hidden")){
        helpOverlay.classList.add("hidden");
      }
      if(presetsOverlay && !presetsOverlay.classList.contains("hidden")){
        presetsOverlay.classList.add("hidden");
      }
    }

    // Ignore shortcuts when typing in an input/textarea/select
    const tag = document.activeElement && document.activeElement.tagName;
    if(tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    // Delete / Backspace: remove focused token
    if((ev.key === "Delete" || ev.key === "Backspace") && state.selectedIndex != null){
      ev.preventDefault();
      pushUndoState();
      state.elements.splice(state.selectedIndex, 1);
      state.selectedIndex = null;
      renderLayoutList();
      render();
      scheduleSave();
      return;
    }

    // Arrow keys: move focused token — 0.1% normal, 1% with Shift
    const ARROW_STEP = ev.shiftKey ? 0.01 : 0.001;
    const arrowMap = { ArrowLeft: [-ARROW_STEP, 0], ArrowRight: [ARROW_STEP, 0], ArrowUp: [0, -ARROW_STEP], ArrowDown: [0, ARROW_STEP] };
    if(arrowMap[ev.key] && state.selectedIndex != null){
      ev.preventDefault();
      const item = state.elements[state.selectedIndex];
      const [dx, dy] = arrowMap[ev.key];
      item.x = clamp((item.x || 0) + dx, 0, 1);
      item.y = clamp((item.y || 0) + dy, 0, 1);
      if(els.metaPosX){ els.metaPosX.value = item.x * 100; }
      if(els.metaPosXVal){ els.metaPosXVal.value = (item.x * 100).toFixed(1); }
      if(els.metaPosY){ els.metaPosY.value = item.y * 100; }
      if(els.metaPosYVal){ els.metaPosYVal.value = (item.y * 100).toFixed(1); }
      render();
      scheduleSave();
    }
  });

  const btnExportXml = document.getElementById("btnExportXml");
  if (btnExportXml) {
    btnExportXml.addEventListener("click", exportResolveXml);
  }

  const btnSendToResolve = document.getElementById("btnSendToResolve");
  if(btnSendToResolve){
    btnSendToResolve.addEventListener("click", sendToResolve);
  }

  const btnResetLayout = document.getElementById("btnResetLayout");
  if(btnResetLayout){
    btnResetLayout.addEventListener("click", ()=>{
      if(state.elements.length === 0) return;
      if(!confirm("Remove all burn-in elements?")) return;
      pushUndoState();
      state.elements = [];
      state.selectedIndex = null;
      renderLayoutList();
      render();
      scheduleSave();
    });
  }

  function loadImageFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const fileNameEl = document.getElementById("imgFileName");
    if (fileNameEl) fileNameEl.textContent = file.name;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { bgImage = img; render(); URL.revokeObjectURL(url); };
    img.src = url;
  }

  els.imgPicker.addEventListener("change", (ev) => {
    loadImageFile(ev.target.files && ev.target.files[0]);
  });

  const previewWrap = els.canvas.parentElement;
  previewWrap.addEventListener("dragover", (ev) => { ev.preventDefault(); previewWrap.classList.add("drag-over"); });
  previewWrap.addEventListener("dragleave", () => { previewWrap.classList.remove("drag-over"); });
  previewWrap.addEventListener("drop", (ev) => { ev.preventDefault(); previewWrap.classList.remove("drag-over"); loadImageFile(ev.dataTransfer.files[0]); });

  if(els.imageRatio){
    els.imageRatio.addEventListener("change", ()=>{
      state.image_ratio = parseFloat(els.imageRatio.value) || 1.77;
      updateCanvasRatio();
      render();
      scheduleSave();
    });
  }

  // Add support for imageRatioMode select
  if(document.getElementById("imageRatioMode")){
    document.getElementById("imageRatioMode").addEventListener("change", (e)=>{
      state.image_ratio_mode = e.target.value === "fit" ? "fit" : "crop";
      render();
      scheduleSave();
    });
  }

  // --- Mask style (bars / lines / bars_lines) ---
  const maskStyleSelect = document.getElementById("maskStyle");
  if(maskStyleSelect){
    maskStyleSelect.addEventListener("change", (e)=>{
      state.mask_style = e.target.value;
      render();
      scheduleSave();
    });
  }

  // --- Mask opacity slider ---
  const maskOpacityInput = document.getElementById("maskOpacity");
  if(maskOpacityInput){
    maskOpacityInput.addEventListener("input", (e)=>{
      state.mask_opacity = clamp(Number(e.target.value), 0, 1);
      if(els.maskOpacityVal){
        els.maskOpacityVal.textContent = state.mask_opacity.toFixed(2);
      }
      render();
      scheduleSave();
    });
  }

  // --- Open Gate Crop ---
  const openGateCropPreset = document.getElementById("openGateCropPreset");
  if(openGateCropPreset){
    openGateCropPreset.addEventListener("change", (e)=>{
      state.open_gate_crop_preset = e.target.value;
      updateOpenGateCropUI();
      render();
      scheduleSave();
    });
  }
  const openGateCropW = document.getElementById("openGateCropW");
  if(openGateCropW){
    openGateCropW.addEventListener("input", (e)=>{
      state.open_gate_crop_custom_w = parseInt(e.target.value) || 3;
      render();
      scheduleSave();
    });
  }
  const openGateCropH = document.getElementById("openGateCropH");
  if(openGateCropH){
    openGateCropH.addEventListener("input", (e)=>{
      state.open_gate_crop_custom_h = parseInt(e.target.value) || 2;
      render();
      scheduleSave();
    });
  }
  const openGateSafetyEl = document.getElementById("openGateSafety");
  if(openGateSafetyEl){
    openGateSafetyEl.addEventListener("input", (e)=>{
      state.open_gate_safety = parseFloat(e.target.value) || 100;
      render();
      scheduleSave();
    });
  }
  const ogcFramelineToggle = document.getElementById("ogcFramelineToggle");
  if(ogcFramelineToggle){
    ogcFramelineToggle.addEventListener("change", (e)=>{
      state.ogc_show_frameline = e.target.checked;
      render();
      scheduleSave();
    });
  }

  const framelineOrientationEl = document.getElementById("framelineOrientation");
  if(framelineOrientationEl){
    framelineOrientationEl.addEventListener("change", (e)=>{
      state.frameline_orientation = e.target.value;
      updateOpenGateCropUI();
      render();
      scheduleSave();
    });
  }

  const framelineOffsetXEl = document.getElementById("framelineOffsetX");
  if(framelineOffsetXEl){
    framelineOffsetXEl.addEventListener("input", (e)=>{
      state.frameline_offset_x = parseFloat(e.target.value) || 0;
      render();
      scheduleSave();
    });
  }

  const framelineOffsetYEl = document.getElementById("framelineOffsetY");
  if(framelineOffsetYEl){
    framelineOffsetYEl.addEventListener("input", (e)=>{
      state.frameline_offset_y = parseFloat(e.target.value) || 0;
      render();
      scheduleSave();
    });
  }

  // Double-clic sur les labels → reset à la valeur par défaut
  document.getElementById("lblFramelineSafety")?.addEventListener("dblclick", ()=>{
    state.open_gate_safety = 100;
    const el = document.getElementById("openGateSafety");
    if(el) el.value = 100;
    render();
    scheduleSave();
  });

  document.getElementById("lblOffsetX")?.addEventListener("dblclick", ()=>{
    state.frameline_offset_x = 0;
    const el = document.getElementById("framelineOffsetX");
    if(el) el.value = 0;
    render();
    scheduleSave();
  });

  document.getElementById("lblOffsetY")?.addEventListener("dblclick", ()=>{
    state.frameline_offset_y = 0;
    const el = document.getElementById("framelineOffsetY");
    if(el) el.value = 0;
    render();
    scheduleSave();
  });

  // --- Still Naming ---
  const stillNamingInput = document.getElementById("stillNamingTemplate");
  if(stillNamingInput){
    stillNamingInput.addEventListener("input", (e)=>{
      state.still_naming_template = e.target.value;
      scheduleSave();
    });

    // Build token chips
    const NAMING_TOKENS = [
      "%Scene","%Shot","%Take","%Camera_#",
      "%Clipname","%Timeline","%Reel_Name",
      "%Date","%FPS","%Resolution","%Source_TC",
      "%Frame","%Clip_#",
    ];
    const chipsWrap = document.getElementById("stillNamingTokens");
    if(chipsWrap){
      NAMING_TOKENS.forEach(tok => {
        const chip = document.createElement("span");
        chip.textContent = tok;
        chip.title = "Insert token";
        chip.style.cssText = "padding:2px 7px;border-radius:3px;border:1px solid #363636;background:#1f2126;color:#d6d9df;font-size:11px;cursor:pointer;";
        chip.addEventListener("mouseenter", ()=>{ chip.style.borderColor="#006D78"; chip.style.color="#fff"; });
        chip.addEventListener("mouseleave", ()=>{ chip.style.borderColor="#363636"; chip.style.color="#d6d9df"; });
        chip.addEventListener("click", ()=>{
          const start = stillNamingInput.selectionStart;
          const end   = stillNamingInput.selectionEnd;
          const val   = stillNamingInput.value;
          stillNamingInput.value = val.slice(0, start) + tok + val.slice(end);
          stillNamingInput.setSelectionRange(start + tok.length, start + tok.length);
          stillNamingInput.focus();
          state.still_naming_template = stillNamingInput.value;
          scheduleSave();
        });
        chipsWrap.appendChild(chip);
      });
    }
  }

  // Editing selected element position
  els.metaPosX.addEventListener("input", ()=>{
    if(state.selectedIndex == null) return;
    pushUndoState();
    const item = state.elements[state.selectedIndex];
    item.x = clamp(parseFloat(els.metaPosX.value)/100,0,1);
    if(els.metaPosXVal) els.metaPosXVal.value = (item.x * 100).toFixed(1);
    render();
    scheduleSave();
  });

  els.metaPosY.addEventListener("input", ()=>{
    if(state.selectedIndex == null) return;
    pushUndoState();
    const item = state.elements[state.selectedIndex];
    item.y = clamp(parseFloat(els.metaPosY.value)/100,0,1);
    if(els.metaPosYVal) els.metaPosYVal.value = (item.y * 100).toFixed(1);
    render();
    scheduleSave();
  });

  // Direct numeric input for X/Y (Enter or blur to commit)
  function commitPosInput(axis){
    if(state.selectedIndex == null) return;
    const el = axis === "x" ? els.metaPosXVal : els.metaPosYVal;
    const slider = axis === "x" ? els.metaPosX : els.metaPosY;
    const val = clamp(parseFloat(el.value) || 0, 0, 100);
    el.value = val.toFixed(1);
    pushUndoState();
    const item = state.elements[state.selectedIndex];
    item[axis] = val / 100;
    if(slider) slider.value = val.toFixed(1);
    render();
    scheduleSave();
  }

  ["x","y"].forEach(axis => {
    const el = axis === "x" ? els.metaPosXVal : els.metaPosYVal;
    el.addEventListener("change", () => commitPosInput(axis));
    el.addEventListener("keydown", (ev) => {
      if(ev.key === "Enter"){ ev.preventDefault(); commitPosInput(axis); el.blur(); }
      if(ev.key === "Escape"){ ev.preventDefault(); el.blur(); }
    });
    // Prevent the keydown from bubbling to the global undo/redo listener
    el.addEventListener("keydown", (ev) => { ev.stopPropagation(); }, true);
  });

  els.metaAlign.addEventListener("change", ()=>{
    if(state.selectedIndex == null) return;
    const item = state.elements[state.selectedIndex];
    item.align = els.metaAlign.value;
    render();
    scheduleSave();
  });

  els.metaFontSize.addEventListener("input", ()=>{
    if(state.selectedIndex == null) return;
    pushUndoState();
    const item = state.elements[state.selectedIndex];
    const sizePt = Number(els.metaFontSize.value);
    if(!Number.isNaN(sizePt)){
      item.font_size_pt = sizePt;
      render();
      scheduleSave();
    }
  });

  if(els.metaOpacity){
    els.metaOpacity.addEventListener("input", ()=>{
      if(state.selectedIndex == null) return;
      const item = state.elements[state.selectedIndex];
      item.opacity = clamp(Number(els.metaOpacity.value), 0, 1);
      if(els.metaOpacityVal) els.metaOpacityVal.textContent = item.opacity.toFixed(2);
      render();
      scheduleSave();
    });
  }

  if(els.metaBgOpacity){
    els.metaBgOpacity.addEventListener("input", ()=>{
      if(state.selectedIndex == null) return;
      const item = state.elements[state.selectedIndex];
      item.bg_opacity = clamp(Number(els.metaBgOpacity.value), 0, 1);
      if(els.metaBgOpacityVal) els.metaBgOpacityVal.textContent = item.bg_opacity.toFixed(2);
      render();
      scheduleSave();
    });
  }

  if(els.metaBold){
    els.metaBold.addEventListener("change", ()=>{
      if(state.selectedIndex == null) return;
      pushUndoState();
      const item = state.elements[state.selectedIndex];
      item.font_weight = els.metaBold.checked ? "bold" : "normal";
      render();
      scheduleSave();
    });
  }

  if(els.metaFontFamily){
    els.metaFontFamily.addEventListener("change", ()=>{
      if(state.selectedIndex == null) return;
      const item = state.elements[state.selectedIndex];
      item.font_family = els.metaFontFamily.value;
      render();
      scheduleSave();
    });
  }

  if(els.metaTemplateCustom){
    els.metaTemplateCustom.addEventListener("input", ()=>{
      if(state.selectedIndex == null) return;
      pushUndoState();
      const item = state.elements[state.selectedIndex];
      item.template_custom = els.metaTemplateCustom.value;
      const tplObj = compileTemplateParts(item.template_custom);
      item.template_parts = tplObj;
      item.custom_tokens = tplObj.tokens; // ensure JSON stores individual tokens
      render();
      scheduleSave();
    });
  }


  if(els.metaColor){
    els.metaColor.addEventListener("input", ()=>{
      if(state.selectedIndex == null) return;
      pushUndoState();
      const item = state.elements[state.selectedIndex];
      item.color = els.metaColor.value;
      render();
      scheduleSave();
    });
  }

  if(els.fontFilePicker){
    els.fontFilePicker.addEventListener("change", async (ev)=>{
      const file = ev.target.files && ev.target.files[0];
      if(!file) return;
      const name = file.name.split(".")[0];
      try {
        const arrayBuffer = await file.arrayBuffer();
        const fontFace = new FontFace(name, arrayBuffer);
        await fontFace.load();
        document.fonts.add(fontFace);
        loadedFontFamilies.add(name);
        fillSelect(els.metaFontFamily, Array.from(new Set([...systemFontFamilies, ...loadedFontFamilies])), state.burnin_font_family || "Arial");
        render();
      } catch(e) {
        console.warn("Failed to load font", e);
      }
    });
  }

  // Canvas drag support
  els.canvas.addEventListener("pointerdown", (ev)=>{
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = els.canvas.width / rect.width;
    const scaleY = els.canvas.height / rect.height;
    const px = (ev.clientX - rect.left) * scaleX;
    const py = (ev.clientY - rect.top) * scaleY;
    // Improved hitbox detection with padding
    const padding = 6; // expand clickable area

    for(let i=lastBoxes.length-1; i>=0; i--){
      const box = lastBoxes[i];

      const withinX = px >= (box.x - padding) && px <= (box.x + box.w + padding);
      const withinY = py >= (box.y - padding) && py <= (box.y + box.h + padding);

      if(withinX && withinY){

        // --- Select on click ---
        selectElement(box.index);

        // --- Activate drag ---
        pushUndoState();
        drag.active = true;
        drag.index = box.index;

        // Snap cursor to center of element
        drag.offsetX = 0;
        drag.offsetY = box.h / 2;

        els.canvas.style.cursor = "grabbing";

        els.canvas.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        return;
      }
    }

    // --- Clicked outside any element → defocus ---
    state.selectedIndex = null;

    const tokenControls = document.getElementById("tokenControls");
    if(tokenControls){
        tokenControls.classList.add("hidden");
    }

    const customBlock = document.getElementById("customTemplateBlock");
    if(customBlock){
        customBlock.style.display = "none";
    }

    renderLayoutList();
    render();
  });

  els.canvas.addEventListener("pointermove", (ev)=>{
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = els.canvas.width / rect.width;
    const scaleY = els.canvas.height / rect.height;
    const px = (ev.clientX - rect.left) * scaleX;
    const py = (ev.clientY - rect.top) * scaleY;

    // If actively dragging
    if(drag.active){
      els.canvas.style.cursor = "grabbing";

      const moveX = px - drag.offsetX;
      const moveY = py - drag.offsetY;

      const W = els.canvas.width;
      const H = els.canvas.height;
      const item = state.elements[drag.index];

      // Axes dynamiques : positions Y/X des autres éléments
      const otherX = state.elements.filter((_,i) => i !== drag.index).map(e => e.x);
      const otherY = state.elements.filter((_,i) => i !== drag.index).map(e => e.y);

      // When frameline active, normalize position within the frameline rect
      const _ref = activeFrameline || {x: 0, y: 0, w: W, h: H};
      const rawX = clamp((moveX - _ref.x) / _ref.w, 0, 1);
      const rawY = clamp((moveY - _ref.y) / _ref.h, 0, 1);

      // Shift désactive le magnétisme
      const snapDisabled = ev.shiftKey;

      if (snapDisabled) {
        drag.snapAxisX = null; drag.snapTypeX = null;
        drag.snapAxisY = null; drag.snapTypeY = null;
        item.x = rawX;
        item.y = rawY;
      } else {
        // Token snapping takes priority over grid snapping
        const tokenSnapX = snapToAxis(rawX, [], otherX, SNAP_THRESHOLD);
        const gridSnapX  = snapToAxis(rawX, SNAP_AXES_X, [], SNAP_THRESHOLD);
        const snappedX   = (tokenSnapX !== rawX) ? tokenSnapX : gridSnapX;

        const tokenSnapY = snapToAxis(rawY, [], otherY, SNAP_THRESHOLD);
        const gridSnapY  = snapToAxis(rawY, SNAP_AXES_Y, [], SNAP_THRESHOLD);
        const snappedY   = (tokenSnapY !== rawY) ? tokenSnapY : gridSnapY;

        drag.snapAxisX = (snappedX !== rawX) ? snappedX : null;
        drag.snapTypeX = drag.snapAxisX !== null ? ((tokenSnapX !== rawX) ? 'token' : 'grid') : null;
        drag.snapAxisY = (snappedY !== rawY) ? snappedY : null;
        drag.snapTypeY = drag.snapAxisY !== null ? ((tokenSnapY !== rawY) ? 'token' : 'grid') : null;
        item.x = snappedX;
        item.y = snappedY;
      }

      if(els.metaPosX){
        els.metaPosX.value = (item.x * 100).toFixed(1);
      }
      if(els.metaPosY){
        els.metaPosY.value = (item.y * 100).toFixed(1);
      }
      if(els.metaPosXVal) els.metaPosXVal.value = (item.x * 100).toFixed(1);
      if(els.metaPosYVal) els.metaPosYVal.value = (item.y * 100).toFixed(1);

      render();
      return;
    }

    // Hover detection when NOT dragging
    let hovering = false;

    for(let i = lastBoxes.length - 1; i >= 0; i--){
      const box = lastBoxes[i];
      if(px >= box.x && px <= box.x + box.w &&
         py >= box.y && py <= box.y + box.h){
        hovering = true;
        break;
      }
    }

    els.canvas.style.cursor = hovering ? "grab" : "default";
  });

  function endDrag(ev){
    if(drag.active){
      drag.active = false;
      drag.index = null;
      drag.snapAxisX = null; drag.snapTypeX = null;
      drag.snapAxisY = null; drag.snapTypeY = null;
      els.canvas.style.cursor = "default";
      scheduleSave();
    }
  }
  els.canvas.addEventListener("pointerup", endDrag);
  els.canvas.addEventListener("pointercancel", endDrag);

  // --- Keyboard shortcuts ---
  document.addEventListener("keydown", (ev) => {
    const isMac = navigator.platform.toUpperCase().includes("MAC");

    const isSaveShortcut =
      (isMac && ev.metaKey && ev.key.toLowerCase() === "s") ||
      (!isMac && ev.ctrlKey && ev.key.toLowerCase() === "s");

    const isUndoShortcut =
      (isMac && ev.metaKey && !ev.shiftKey && ev.key.toLowerCase() === "z") ||
      (!isMac && ev.ctrlKey && !ev.shiftKey && ev.key.toLowerCase() === "z");

    const isRedoShortcut =
      (isMac && ev.metaKey && ev.shiftKey && ev.key.toLowerCase() === "z") ||
      (!isMac && ev.ctrlKey && ev.key.toLowerCase() === "y");

    if (isSaveShortcut) {
      ev.preventDefault();
      saveToServer();
    }

    if (isUndoShortcut) {
      ev.preventDefault();
      undoLastAction();
    }

    if (isRedoShortcut) {
      ev.preventDefault();
      redoLastAction();
    }
  });
}

function updateCanvasRatio(){
  // Canvas must always remain 1.77 full frame.
  // Changing ratio should NOT resize the canvas.
  // Ratio only affects masking inside render().

  const baseWidth = els.canvas.parentElement.clientWidth || 1200;
  const baseRatio = 1.77; // fixed preview base
  const newHeight = baseWidth / baseRatio;

  els.canvas.width = Math.round(baseWidth);
  els.canvas.height = Math.round(newHeight);

  els.canvas.style.width = baseWidth + "px";
  els.canvas.style.height = newHeight + "px";

  render();
}

function renderMetadataTokens(filter){
  if(!els.metadataTokenList) return;
  const q = (filter || "").trim().toLowerCase();

  els.metadataTokenList.innerHTML = "";

  // ---- Custom token (always shown) ----
  const customDiv = document.createElement("div");
  customDiv.classList.add("tokenItem");
  customDiv.textContent = "✦ Custom";
  customDiv.style.cssText = "padding:6px;margin-bottom:6px;cursor:pointer;border:1px solid #006D78;border-radius:4px;font-size:12px;color:#006D78;";
  customDiv.addEventListener("click", ()=>{
    pushUndoState();
    const tpl = "%Scene / %Shot - %Take %Camera_#";
    const tplObj = compileTemplateParts(tpl);
    state.elements.push({
      key: "custom",
      x: 0.5, y: 0.5,
      font_size_pt: 24,
      opacity: state.burnin_opacity,
      bg_opacity: 0,
      align: "center",
      font_family: state.burnin_font_family || "Arial",
      font_weight: "normal",
      template_custom: tpl,
      template_parts: tplObj,
      custom_tokens: tplObj.tokens,
      color: "#ffffff",
    });
    state.selectedIndex = state.elements.length - 1;
    renderLayoutList();
    render();
    scheduleSave();
  });
  els.metadataTokenList.appendChild(customDiv);

  function makeTokenDiv(key) {
    const div = document.createElement("div");
    div.classList.add("tokenItem");
    div.textContent = key;
    div.style.cssText = "padding:6px;margin-bottom:4px;cursor:pointer;border:1px solid #2a2f3a;border-radius:4px;font-size:12px;";
    div.addEventListener("click", ()=>{
      pushUndoState();
      state.elements.push({
        key: key,
        x: 0.5, y: 0.5,
        font_size_pt: 24,
        opacity: state.burnin_opacity,
        bg_opacity: 0,
        align: "center",
        font_family: state.burnin_font_family || "Arial",
        font_weight: "normal",
        template_custom: "",
        color: "#ffffff",
      });
      state.selectedIndex = state.elements.length - 1;
      renderLayoutList();
      render();
      scheduleSave();
    });
    return div;
  }

  if(q) {
    // Search mode: show all matching keys flat
    metadataKeys.forEach(key => {
      if(key.toLowerCase().includes(q)){
        els.metadataTokenList.appendChild(makeTokenDiv(key));
      }
    });
    return;
  }

  // Normal mode: favorites first, then "show more" for the rest
  const favSet = new Set(FAVORITES);
  const others = metadataKeys.filter(k => !favSet.has(k));

  const favContainer = document.createElement("div");
  favContainer.className = "tokenFavorites";
  FAVORITES.filter(k => metadataKeys.includes(k)).forEach(key => {
    favContainer.appendChild(makeTokenDiv(key));
  });
  els.metadataTokenList.appendChild(favContainer);

  const moreContainer = document.createElement("div");
  moreContainer.className = "tokenMore";
  moreContainer.style.display = "none";
  others.forEach(key => {
    moreContainer.appendChild(makeTokenDiv(key));
  });

  const showMoreBtn = document.createElement("button");
  showMoreBtn.className = "showMoreBtn";
  showMoreBtn.textContent = `Show more (${others.length})`;
  let expanded = false;
  showMoreBtn.addEventListener("click", () => {
    expanded = !expanded;
    moreContainer.style.display = expanded ? "block" : "none";
    showMoreBtn.textContent = expanded ? "Show less" : `Show more (${others.length})`;
  });

  els.metadataTokenList.appendChild(showMoreBtn);
  els.metadataTokenList.appendChild(moreContainer);
}
function selectElement(index){
  state.selectedIndex = index;

  const item = state.elements[index];
  if(!item) return;

  // Show editor panel
  const tokenControls = document.getElementById("tokenControls");
  if(tokenControls){
    tokenControls.classList.remove("hidden");
  }

  const customBlock = document.getElementById("customTemplateBlock");
  if(customBlock){
    customBlock.style.display = item.key === "custom" ? "block" : "none";
  }

  // Sync UI fields
  if(els.metaPosX){
    els.metaPosX.value = ((item.x ?? 0.5) * 100).toFixed(1);
  }
  if(els.metaPosY){
    els.metaPosY.value = ((item.y ?? 0.5) * 100).toFixed(1);
  }
  if(els.metaPosXVal) els.metaPosXVal.value = ((item.x ?? 0.5) * 100).toFixed(1);
  if(els.metaPosYVal) els.metaPosYVal.value = ((item.y ?? 0.5) * 100).toFixed(1);

  if(els.metaAlign) els.metaAlign.value = item.align || "center";
  if(els.metaFontSize) els.metaFontSize.value = item.font_size_pt || 24;
  if(els.metaColor) els.metaColor.value = item.color || "#ffffff";

  if(els.metaOpacity){
    const op = item.opacity ?? state.burnin_opacity;
    els.metaOpacity.value = op;
    if(els.metaOpacityVal){
      els.metaOpacityVal.textContent = op.toFixed(2);
    }
  }

  if(els.metaBgOpacity){
    const bgOp = item.bg_opacity ?? 0;
    els.metaBgOpacity.value = bgOp;
    if(els.metaBgOpacityVal) els.metaBgOpacityVal.textContent = bgOp.toFixed(2);
  }

  if(els.metaBold){
    els.metaBold.checked = (item.font_weight === "bold");
  }

  if(els.metaFontFamily){
    fillSelect(
      els.metaFontFamily,
      Array.from(new Set([...systemFontFamilies, ...loadedFontFamilies])),
      item.font_family || state.burnin_font_family || "Arial"
    );
  }

  if(els.metaTemplateCustom && item.key === "custom"){
    els.metaTemplateCustom.value = item.template_custom || "";
  }

  renderLayoutList();
  render();
}

function renderLayoutList(){
  els.burninLayoutList.innerHTML = "";

  // --- Hide editing panel if no token is selected ---
  const tokenControls = document.getElementById("tokenControls");
  if(tokenControls){
    if(state.selectedIndex == null){
      tokenControls.classList.add("hidden");
      const customBlock = document.getElementById("customTemplateBlock");
        if(customBlock){
          customBlock.style.display = "none";
        }
    } else {
      tokenControls.classList.remove("hidden");
    }
  }

  state.elements.forEach((item, index) => {
    const div = document.createElement("div");
    div.classList.add("tokenItem");
    div.style.marginBottom = "6px";
    div.style.padding = "6px";
    div.style.cursor = "pointer";
    div.style.border = "1px solid #2a2f3a";
    div.style.borderRadius = "4px";
    div.style.fontSize = "12px";
    div.textContent = item.key === "custom" ? "Custom" : item.key;

    // Highlight if selected
    if(state.selectedIndex === index){
      div.style.background = "#383838";
      div.style.borderColor = "#006D78";
    }

    // Click = select for editing
    div.addEventListener("click", ()=>{
      selectElement(index);
    });

    // Right click delete
    div.addEventListener("contextmenu", (e)=>{
      e.preventDefault();
      pushUndoState();
      state.elements.splice(index,1);
      state.selectedIndex = null;
      renderLayoutList();
      render();
      scheduleSave();
    });

    els.burninLayoutList.appendChild(div);
  });
}

function render(){
  ctx.globalAlpha = 1.0;
  ctx.setLineDash([]);

  const W = els.canvas.width;
  const H = els.canvas.height;

  ctx.clearRect(0,0,W,H);

  lastBoxes = [];

  // --- Intelligent crop / fit simulation ---
  const canvasRatio = W / H;
  const targetRatio = state.image_ratio || 1.77;

  // Pre-compute frameline rect (OGC horizontal or vertical 9:16) with optional X/Y offset
  let fl = null;
  if(state.ogc_show_frameline === true){
    const ox = ((state.frameline_offset_x || 0) / 100) * W;
    const oy = ((state.frameline_offset_y || 0) / 100) * H;

    if(state.frameline_orientation === "vertical_9_16"){
      const _sf = Math.max(0.5, (state.open_gate_safety ?? 100) / 100);
      const _vw = Math.min(H * (9 / 16) * _sf, W);
      const _vh = Math.min(H * _sf, H);
      fl = {
        x: clamp((W - _vw) / 2 + ox, 0, W - _vw),
        y: clamp((H - _vh) / 2 + oy, 0, H - _vh),
        w: _vw, h: _vh, type: "vertical_9_16"
      };
    } else {
      const _nr = getOGCNativeRatio();
      const _sf = Math.max(0.5, (state.open_gate_safety ?? 100) / 100);
      const _cw = H * _nr;
      const _fw = Math.min(_cw * _sf, W);
      const _fh = Math.min((_cw / (16 / 9)) * _sf, H);
      fl = {
        x: clamp((W - _fw) / 2 + ox, 0, W - _fw),
        y: clamp((H - _fh) / 2 + oy, 0, H - _fh),
        w: _fw, h: _fh, type: "ogc"
      };
    }
  }

  activeFrameline = fl; // expose to drag handlers

  if(state.image_ratio_mode === "fit"){

    // --- FIT MODE ---
    // Base canvas is always 1.77 full frame.
    // The image must be fully visible (contain).
    // The selected ratio defines a centered transparent window.
    // Everything outside that window is masked black.

    // 1) Draw image fully visible (contain inside canvas)
    if(bgImage){
      drawContain(bgImage, 0, 0, W, H);
    } else {
      ctx.fillStyle = "#0b0d12";
      ctx.fillRect(0,0,W,H);
    }

    // 2) Compute target ratio window centered inside 1.77 canvas
    let cropX = 0;
    let cropY = 0;
    let cropW = W;
    let cropH = H;

    if(targetRatio > canvasRatio){
      // Ratio wider → reduce height
      cropH = W / targetRatio;
      cropY = (H - cropH) / 2;
    } else {
      // Ratio taller → reduce width
      cropW = H * targetRatio;
      cropX = (W - cropW) / 2;
    }

    // When frameline is active, bars are drawn inside it — skip full-canvas bars
    if(!fl){
      const maskAlpha = clamp(state.mask_opacity ?? 1, 0, 1);
      ctx.save();
      ctx.globalAlpha = maskAlpha;

      if(state.mask_style === "bars" || state.mask_style === "bars_lines"){
        ctx.fillStyle = "#000";
        if(cropY > 0){
          ctx.fillRect(0, 0, W, cropY);
          ctx.fillRect(0, cropY + cropH, W, H - (cropY + cropH));
        }
        if(cropX > 0){
          ctx.fillRect(0, 0, cropX, H);
          ctx.fillRect(cropX + cropW, 0, W - (cropX + cropW), H);
        }
      }

      if(state.mask_style === "lines" || state.mask_style === "bars_lines"){
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.strokeRect(cropX, cropY, cropW, cropH);
      }

      ctx.restore();
    }

  } else {

    // --- CROP MODE (fill canvas, crop visually) ---
    // Keep full canvas ratio but simulate cinematic bars (previous crop behavior)

    let cropX = 0;
    let cropY = 0;
    let cropW = W;
    let cropH = H;

    if(targetRatio > canvasRatio){
      cropH = W / targetRatio;
      cropY = (H - cropH) / 2;
    } else {
      cropW = H * targetRatio;
      cropX = (W - cropW) / 2;
    }

    if(bgImage){
      drawCover(bgImage,0,0,W,H);
    } else {
      ctx.fillStyle = "#0b0d12";
      ctx.fillRect(0,0,W,H);
    }

    // When frameline is active, bars are drawn inside it — skip full-canvas bars
    if(!fl){
      const maskAlpha = clamp(state.mask_opacity ?? 1, 0, 1);
      ctx.save();
      ctx.globalAlpha = maskAlpha;

      if(state.mask_style === "bars" || state.mask_style === "bars_lines"){
        ctx.fillStyle = "#000";
        if(cropY > 0){
          ctx.fillRect(0,0,W,cropY);
          ctx.fillRect(0,cropY+cropH,W,H-(cropY+cropH));
        }
        if(cropX > 0){
          ctx.fillRect(0,0,cropX,H);
          ctx.fillRect(cropX+cropW,0,W-(cropX+cropW),H);
        }
      }

      if(state.mask_style === "lines" || state.mask_style === "bars_lines"){
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.strokeRect(cropX,cropY,cropW,cropH);
      }

      ctx.restore();
    }
  }

  // --- Display active ratio overlay ---
  ctx.save();
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px Arial";
  ctx.textBaseline = "top";
  const ratioLabel = `${state.image_ratio.toFixed(2)}:1`;
  const labelWidth = ctx.measureText(ratioLabel).width;
  const padding = 6;

  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(10, 10, labelWidth + padding*2, 22);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(ratioLabel, 10 + padding, 13);
  ctx.restore();

  // We need one metadata block to preview.
  // For preview, take the first marker if available.
  const previewMetadata = window.previewMetadata || {};

  // Token reference frame: frameline rect when active, full canvas otherwise
  const tkRefX = fl ? fl.x : 0;
  const tkRefY = fl ? fl.y : 0;
  const tkRefW = fl ? fl.w : W;
  const tkRefH = fl ? fl.h : H;

  ctx.globalAlpha = 1.0;

  // --- Draw order when frameline active: bars → frameline border → tokens ---

  // 1) Ratio bars/blanking INSIDE the OGC frameline (horizontal only — not for vertical)
  if(fl && fl.type !== "vertical_9_16"){
    const {x: fx, y: fy, w: fw, h: fh} = fl;
    const flRatio = fw / fh;
    let bX = fx, bY = fy, bW = fw, bH = fh;
    if(targetRatio > flRatio){
      bH = fw / targetRatio;
      bY = fy + (fh - bH) / 2;
    } else if(targetRatio < flRatio){
      bW = fh * targetRatio;
      bX = fx + (fw - bW) / 2;
    }

    if(bX > fx || bY > fy){
      const maskAlpha = clamp(state.mask_opacity ?? 1, 0, 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(fx, fy, fw, fh);
      ctx.clip();
      ctx.globalAlpha = maskAlpha;

      if(state.mask_style === "bars" || state.mask_style === "bars_lines"){
        ctx.fillStyle = "#000";
        if(bY > fy){
          ctx.fillRect(fx, fy, fw, bY - fy);
          ctx.fillRect(fx, bY + bH, fw, (fy + fh) - (bY + bH));
        }
        if(bX > fx){
          ctx.fillRect(fx, fy, bX - fx, fh);
          ctx.fillRect(bX + bW, fy, (fx + fw) - (bX + bW), fh);
        }
      }

      if(state.mask_style === "lines" || state.mask_style === "bars_lines"){
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.strokeRect(bX, bY, bW, bH);
      }

      ctx.restore();
    }
  }

  // 1b) Frameline active — griser la zone extérieure au cadre (les deux orientations)
  if(fl){
    const {x: _ox, y: _oy, w: _ow, h: _oh} = fl;
    ctx.save();
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = "#000";
    // top band
    if(_oy > 0)               ctx.fillRect(0, 0, W, _oy);
    // bottom band
    if(_oy + _oh < H)         ctx.fillRect(0, _oy + _oh, W, H - _oy - _oh);
    // left strip (between top and bottom bands)
    if(_ox > 0)               ctx.fillRect(0, _oy, _ox, _oh);
    // right strip
    if(_ox + _ow < W)         ctx.fillRect(_ox + _ow, _oy, W - _ox - _ow, _oh);
    ctx.restore();
  }

  // 2) Frameline border — above bars, below tokens
  if(fl){
    const {x: fx, y: fy, w: fw, h: fh, type: flType} = fl;
    ctx.save();
    ctx.globalAlpha = 1.0;

    ctx.strokeStyle = "rgba(255, 165, 0, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(fx, fy, fw, fh);

    let flLabel;
    if(flType === "vertical_9_16"){
      flLabel = "9:16 Vertical";
    } else {
      const safetyPct = Math.round(state.open_gate_safety ?? 100);
      const preset    = state.open_gate_crop_preset || "arri_alexa35";
      flLabel = `OGC ${preset.replace(/_/g," ")}${safetyPct !== 100 ? " · " + safetyPct + "%" : ""}`;
    }

    ctx.font         = "bold 11px Arial";
    ctx.textBaseline = "bottom";
    ctx.fillStyle    = "rgba(0,0,0,0.55)";
    const lw         = ctx.measureText(flLabel).width;
    ctx.fillRect(fx + 4, fy + 4, lw + 8, 16);
    ctx.fillStyle    = flType === "vertical_9_16" ? "rgba(0,210,255,0.95)" : "rgba(255,165,0,0.95)";
    ctx.fillText(flLabel, fx + 8, fy + 19);
    ctx.restore();
  }

  // 3) Tokens — on top of everything (clipped to frameline when active)
  if(fl){
    ctx.save();
    ctx.beginPath();
    ctx.rect(fl.x, fl.y, fl.w, fl.h);
    ctx.clip();
  }

  state.elements.forEach((item, index) => {

    // Reduce preview size on canvas (visual only, does not affect saved value)
    const fontSize = (item.font_size_pt || 24) * 0.75;

    const fmt = applyConditionalFormatting(previewMetadata, item);
    ctx.globalAlpha = clamp(item.opacity ?? state.burnin_opacity, 0, 1);

    const family = item.font_family || state.burnin_font_family || "Arial";
    const weight = fmt.font_weight || "normal";
    ctx.font = `${weight} ${fontSize}px ${family}`;

    const x = tkRefX + item.x * tkRefW;
    const y = tkRefY + item.y * tkRefH;

    let text = getItemText(previewMetadata, item);
    if(!text || text.trim() === ""){
      text = `[${item.key}]`;
    }

    let drawX = x;
    const textWidth = ctx.measureText(text).width;

    if(item.align === "center"){
      drawX = x - textWidth/2;
    }
    if(item.align === "right"){
      drawX = x - textWidth;
    }

    // Background box
    const bgOp = clamp(item.bg_opacity ?? 0, 0, 1);
    if(bgOp > 0){
      ctx.save();
      ctx.globalAlpha = bgOp;
      ctx.fillStyle = "#000000";
      ctx.fillRect(drawX - 4, y - 2, textWidth + 8, fontSize * 1.2 + 4);
      ctx.restore();
      ctx.globalAlpha = clamp(item.opacity ?? state.burnin_opacity, 0, 1);
    }

    ctx.fillStyle = item.color || "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText(text, drawX, y);

    // Draw selection indicator using element color
    if(state.selectedIndex === index){
      ctx.strokeStyle = item.color || "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(drawX - 4, y - 4, textWidth + 8, fontSize * 1.2 + 8);
    }

    // Save hitbox for dragging (uses same reference frame as drawing)
    lastBoxes.push({
      index,
      x: drawX,
      y: y,
      w: textWidth,
      h: fontSize * 1.2
    });
  });

  if(fl) ctx.restore();

  // --- Lignes filigrane de snap (magnétisme) ---
  if (drag.active && (drag.snapAxisX !== null || drag.snapAxisY !== null)) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.setLineDash([6, 5]);
    ctx.lineWidth = 1;
    if (drag.snapAxisX !== null) {
      ctx.strokeStyle = drag.snapTypeX === 'token' ? "rgba(0, 180, 255, 0.9)" : "rgba(180, 180, 180, 0.85)";
      const sx = drag.snapAxisX * W;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, H);
      ctx.stroke();
    }
    if (drag.snapAxisY !== null) {
      ctx.strokeStyle = drag.snapTypeY === 'token' ? "rgba(0, 180, 255, 0.9)" : "rgba(180, 180, 180, 0.85)";
      const sy = drag.snapAxisY * H;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(W, sy);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawCover(img, dx, dy, dW, dH){
  const sW = img.width;
  const sH = img.height;
  const scale = Math.max(dW / sW, dH / sH);
  const cW = sW * scale;
  const cH = sH * scale;
  const x = dx + (dW - cW) / 2;
  const y = dy + (dH - cH) / 2;
  ctx.drawImage(img, x, y, cW, cH);
}

function drawContain(img, dx, dy, dW, dH){
  const sW = img.width;
  const sH = img.height;
  const scale = Math.min(dW / sW, dH / sH);
  const cW = sW * scale;
  const cH = sH * scale;
  const x = dx + (dW - cW) / 2;
  const y = dy + (dH - cH) / 2;
  ctx.drawImage(img, x, y, cW, cH);
}

function scheduleSave(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToServer, 300);
}

async function loadFromServer(){
  try{
    const res = await fetch(`${API_BASE}/load`);
    const json = await res.json();
    if(!json.ok) throw new Error();

    const data = json.data || {};

    // --- Merge flat fields first ---
    state = { ...state, ...data };

    // --- If server saved preview block, map it explicitly ---
    if(data.preview && typeof data.preview === "object"){
        const p = data.preview;

        if(typeof p.ratio === "number"){
            state.image_ratio = p.ratio;
        }

        if(typeof p.mode === "string"){
            state.image_ratio_mode = p.mode;
        }

        if(typeof p.mask_style === "string"){
            state.mask_style = p.mask_style;
        }

        if(typeof p.mask_opacity === "number"){
            state.mask_opacity = p.mask_opacity;
        }

    }

    // Ensure defaults
    state.image_ratio_mode = state.image_ratio_mode || "crop";
    state.mask_style = state.mask_style || "bars";
    state.mask_opacity = state.mask_opacity ?? 1;
    if(!Array.isArray(state.elements)) state.elements = [];

    // --- Normalize custom elements: template_custom is the ONLY source of truth ---
    state.elements = state.elements.map(el => {
      if(el && el.key === "custom"){
        const tpl = String(el.template_custom || "");

        // Always rebuild structured parts from template_custom
        const tplObj = compileTemplateParts(tpl);

        return {
          ...el,
          template_custom: tpl,
          template_parts: {
            parts: Array.isArray(tplObj.parts) ? tplObj.parts : []
          },
          custom_tokens: Array.isArray(tplObj.tokens) ? tplObj.tokens : []
        };
      }
      return el;
    });

    if(state.image_ratio && els.imageRatio){
      els.imageRatio.value = String(state.image_ratio);
    }

    // Restore ratio mode select if present
    const ratioModeSelect = document.getElementById("imageRatioMode");
    if(ratioModeSelect){
        ratioModeSelect.value = state.image_ratio_mode || "crop";
    }

    // Open Gate Crop
    if(data.open_gate_crop && typeof data.open_gate_crop === "object"){
      const ogc = data.open_gate_crop;
      if(typeof ogc.preset === "string") state.open_gate_crop_preset = ogc.preset;
      if(typeof ogc.custom_w === "number") state.open_gate_crop_custom_w = ogc.custom_w;
      if(typeof ogc.custom_h === "number") state.open_gate_crop_custom_h = ogc.custom_h;
      if(typeof ogc.safety === "number") state.open_gate_safety = ogc.safety;
    }
    const ogcPresetEl = document.getElementById("openGateCropPreset");
    if(ogcPresetEl) ogcPresetEl.value = state.open_gate_crop_preset || "arri_alexa35";
    const ogcWEl = document.getElementById("openGateCropW");
    if(ogcWEl) ogcWEl.value = state.open_gate_crop_custom_w || 3;
    const ogcHEl = document.getElementById("openGateCropH");
    if(ogcHEl) ogcHEl.value = state.open_gate_crop_custom_h || 2;
    const ogcSafeEl = document.getElementById("openGateSafety");
    if(ogcSafeEl) ogcSafeEl.value = state.open_gate_safety ?? 100;

    // Still Naming
    if(typeof data.still_naming === "string") state.still_naming_template = data.still_naming;
    const stillNamingEl = document.getElementById("stillNamingTemplate");
    if(stillNamingEl) stillNamingEl.value = state.still_naming_template || "";

    // Frameline toggle — lire depuis le JSON, puis synchroniser le DOM
    if(data.open_gate_crop && typeof data.open_gate_crop.show_frameline === "boolean")
      state.ogc_show_frameline = data.open_gate_crop.show_frameline;
    const _framelineEl = document.getElementById("ogcFramelineToggle");
    if(_framelineEl) _framelineEl.checked = state.ogc_show_frameline;

    // Frameline orientation + offsets
    if(typeof data.frameline_orientation === "string") state.frameline_orientation = data.frameline_orientation;
    if(typeof data.frameline_offset_x === "number") state.frameline_offset_x = data.frameline_offset_x;
    if(typeof data.frameline_offset_y === "number") state.frameline_offset_y = data.frameline_offset_y;
    const _flOrientEl = document.getElementById("framelineOrientation");
    if(_flOrientEl) _flOrientEl.value = state.frameline_orientation || "horizontal_16_9";
    updateOpenGateCropUI(); // appelé ici, après que frameline_orientation est chargé
    const _flOxEl = document.getElementById("framelineOffsetX");
    if(_flOxEl) _flOxEl.value = state.frameline_offset_x || 0;
    const _flOyEl = document.getElementById("framelineOffsetY");
    if(_flOyEl) _flOyEl.value = state.frameline_offset_y || 0;

    updateCanvasRatio();

    // Try to fetch metadata JSON for preview
    try{
      const metaRes = await fetch("/Timeline_1_stills_full_metadata.json");
      if(metaRes.ok){
        const metaJson = await metaRes.json();
        const markers = metaJson.markers_metadata;
        if(markers){
          const firstKey = Object.keys(markers)[0];
          window.previewMetadata = markers[firstKey];
        }
      }
    }catch(e){
      console.warn("No preview metadata loaded");
    }

    // Populate font family select
    if(els.metaFontFamily){
      fillSelect(els.metaFontFamily, Array.from(new Set([...systemFontFamilies, ...loadedFontFamilies])), state.burnin_font_family || "Arial");
    }
    // Restore mask UI if controls exist
    const maskStyleSelect = document.getElementById("maskStyle");
    if(maskStyleSelect){
        maskStyleSelect.value = state.mask_style || "bars";
    }

    const maskOpacityInput = document.getElementById("maskOpacity");
    if(maskOpacityInput){
        maskOpacityInput.value = state.mask_opacity ?? 1;
        if(els.maskOpacityVal){
            els.maskOpacityVal.textContent = (state.mask_opacity ?? 1).toFixed(2);
        }
    }

    renderLayoutList();
    // Ensure slider % labels are always updated on load.
    if(state.selectedIndex != null){
      const item = state.elements[state.selectedIndex];
      if(els.metaPosXVal) els.metaPosXVal.value = ((item.x ?? 0.5) * 100).toFixed(1);
      if(els.metaPosYVal) els.metaPosYVal.value = ((item.y ?? 0.5) * 100).toFixed(1);
    }
    render();
    setStatus("Loaded","ok");
  } catch {
    setStatus("Server not available","bad");
  }
}

async function saveToServer(){
  try{

    // --- Normalize elements before saving ---
    const normalizedElements = state.elements.map(el => {
      const base = {
        key: el.key,
        x: Number(el.x ?? 0.5),
        y: Number(el.y ?? 0.5),
        font_size_pt: Number(el.font_size_pt ?? 24),
        opacity: Number(el.opacity ?? state.burnin_opacity ?? 0.5),
        align: el.align || "center",
        font_family: el.font_family || state.burnin_font_family || "Arial",
        font_weight: el.font_weight || "normal",
        color: el.color || "#ffffff",
        bg_opacity: Number(el.bg_opacity ?? 0),
      };

      if (el.key === "custom") {
        const tpl = String(el.template_custom || "");

        // Always rebuild parts from raw template string
        const tplObj = compileTemplateParts(tpl);

        base.template_custom = tpl;

        // Store FULL structured parts (tokens + text)
        base.template_parts = {
          parts: Array.isArray(tplObj.parts)
            ? tplObj.parts.map(p => ({ ...p }))
            : []
        };

        // Store flat token list for Python fallback
        base.custom_tokens = Array.isArray(tplObj.tokens)
          ? [...tplObj.tokens]
          : [];
      }

      return base;
    });

    const cleanedState = {
      burnin_font_path: state.burnin_font_path || "",
      burnin_opacity: Number(state.burnin_opacity ?? 0.5),
      burnin_font_family: state.burnin_font_family || "Arial",
      elements: normalizedElements,

      // Flat fields
      image_ratio: Number(state.image_ratio ?? 1.77),
      image_ratio_mode: state.image_ratio_mode,
      mask_style: state.mask_style,
      mask_opacity: Number(state.mask_opacity ?? 1),

      // Explicit preview block (used by Python side)
      preview: {
        ratio: Number(state.image_ratio ?? 1.77),
        mode: state.image_ratio_mode,
        mask_style: state.mask_style,
        mask_opacity: Number(state.mask_opacity ?? 1),
      },

      open_gate_crop: {
        preset: state.open_gate_crop_preset || "arri_alexa35",
        custom_w: Number(state.open_gate_crop_custom_w) || 3,
        custom_h: Number(state.open_gate_crop_custom_h) || 2,
        safety: Number(state.open_gate_safety) ?? 100,
        show_frameline: state.ogc_show_frameline === true,
      },

      frameline_orientation: state.frameline_orientation || "horizontal_16_9",
      frameline_offset_x: Number(state.frameline_offset_x) || 0,
      frameline_offset_y: Number(state.frameline_offset_y) || 0,

      still_naming: state.still_naming_template || "",
    };

    const res = await fetch(`${API_BASE}/save`,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(cleanedState)
    });

    const json = await res.json();
    if(!json.ok) throw new Error();
    setStatus("Saved","ok");
  } catch {
    setStatus("Saving Error","bad");
  }
}

function updateOpenGateCropUI(){
  const customWrap = document.getElementById("openGateCropCustomWrap");
  if(customWrap) customWrap.style.display = state.open_gate_crop_preset === "custom" ? "flex" : "none";
  const presetEl = document.getElementById("openGateCropPreset");
  if(presetEl) presetEl.disabled = state.frameline_orientation === "vertical_9_16";
}

function clamp(v,a,b){
  if(Number.isNaN(v)) return a;
  return Math.max(a,Math.min(b,v));
}
function clampInt(v,a,b){
  if(Number.isNaN(v)) return a;
  return Math.max(a,Math.min(b,Math.round(v)));
}


// ─── Export to Resolve XML ───────────────────────────────────────────────────
// Keys that map to a Resolve auto-fill type code (not custom text slots)
const _autoFillKeys = new Set([
  "Record_TC", "Source_TC", "KeyKode", "File_Name", "Clipname",
  "Reel_Name", "Scene", "Take", "Shot", "Angle", "Shoot_Day",
  "Date", "Date_Recorded", "Good_Take", "Camera_#", "Roll_Card", "Synced_Audio_File"
]);

async function exportResolveXml() {
  const nameInput = document.getElementById("exportPresetName");
  const name = (nameInput && nameInput.value.trim()) || "Adit Preset";

  // Save current state first so the server reads the latest settings
  await saveToServer();

  const url = `${API_BASE}/export_preset?name=${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setStatus(`Export error: ${json.error || res.status}`, "bad");
      return;
    }
    const blob = await res.blob();
    const dlUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = dlUrl;
    a.download = `${name} Burn In.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(dlUrl);
    setStatus("XML exported", "ok");
  } catch (e) {
    setStatus("Export failed", "bad");
  }
}

async function sendToResolve() {
  const nameInput = document.getElementById("exportPresetName");
  const name = (nameInput && nameInput.value.trim()) || "My Preset";

  await saveToServer();

  try {
    const res = await fetch(`${API_BASE}/send_to_resolve?name=${encodeURIComponent(name)}`, { method: "POST" });
    const json = await res.json();
    if (!json.ok) {
      setStatus(`Send error: ${json.error || res.status}`, "bad");
      return;
    }
    setStatus("Sent to Resolve ✓", "ok");
  } catch(e) {
    setStatus("Send to Resolve failed", "bad");
  }
}

// ─── Resolve Preset Viewer ───────────────────────────────────────────────────

// Maps every Resolve %{Token Name} → our internal %TokenKey
const resolveTokenMap = {
  // ── File / Clip ─────────────────────────────────────────────────────────
  "File Name":             "File_Name",
  "Clip Directory":        "Clip_Directory",
  "Video Codec":           "Video_Codec",
  "Start TC":              "Start_TC",
  "End TC":                "End_TC",
  "Duration TC":           "Duration",
  "Start Frame":           "Start_Frame",
  "End Frame":             "End_Frame",
  "Frames":                "Frames",
  "Shot Frame Rate":       "FPS",
  "Resolution":            "Resolution",
  "Data Level":            "Data_Level",
  "Audio Channels":        "Audio_Channels",
  "Date Modified":         "Date_Modified",
  "KeyKode":               "KeyKode",
  "Clip Name":             "Clipname",
  "Source Name":           "Clipname",
  "EDL Clip Name":         "EDL_Clip_Name",
  "Reel Name":             "Reel_Name",
  "Reel Number":           "Reel_Name",
  "File Path":             "File_Path",
  "Usage":                 "Usage",
  "Subclip":               "Subclip",
  "Clip Type":             "Clip_Type",
  "Clip #":                "Clip_#",
  "In":                    "In",
  "Out":                   "Out",
  "Version":               "Version",
  "Group":                 "Group",
  "Drop Frame":            "Drop_Frame",
  "Has Keyframes":         "Has_Keyframes",

  // ── Scene / Shot / Production ────────────────────────────────────────────
  "Description":           "Comments",
  "Comments":              "Comments",
  "Scene":                 "Scene",
  "Shot":                  "Shot",
  "Angle":                 "Angle",
  "Take":                  "Take",
  "Move":                  "Move",
  "Keywords":              "Keywords",
  "Good Take":             "Good_Take",
  "Shoot Day":             "Shoot_Day",
  "Date Recorded":         "Date_Recorded",
  "Roll Card #":           "Roll_Card",
  "Program Name":          "Program_Name",
  "Episode #":             "Episode_#",
  "Episode Name":          "Episode_Name",
  "Shot During Ep":        "Shot_During_Ep",
  "Location":              "Location",
  "Unit Name":             "Unit_Name",
  "Setup":                 "Setup",
  "Day / Night":           "Day_Night",
  "Environment":           "Environment",
  "Shot Type":             "Shot_Type",
  "Format":                "Format",
  "Safe Area":             "Safe_Area",
  "Time-lapse Interval":   "Timelapse_Interval",
  "People":                "People",
  "Category":              "Category",
  "Subcategory":           "Subcategory",

  // ── Camera ───────────────────────────────────────────────────────────────
  "Cam #":                 "Camera_#",
  "Cam Type":              "Camera_Type",
  "Cam Serial #":          "Camera_Serial",
  "Cam ID":                "Camera_ID",
  "Cam Notes":             "Camera_Notes",
  "Cam Format":            "Camera_Format",
  "Cam FPS":               "FPS",
  "Cam TC Type":           "TC_Type",
  "Cam Firmware":          "Camera_Firmware",
  "Camera Manufacturer":   "Camera_Manufacturer",
  "Camera Position":       "Camera_Position",
  "Camera Pan Angle":      "Camera_Pan_Angle",
  "Camera Tilt Angle":     "Camera_Tilt_Angle",
  "Camera Roll Angle":     "Camera_Roll_Angle",
  "Shutter Speed":         "Shutter_Angle",
  "Shutter Angle":         "Shutter_Angle",
  "Shutter Type":          "Shutter_Type",
  "ISO":                   "ISO",
  "White Point":           "White_Balance",
  "White Balance Tint":    "White_Balance_Tint",
  "Sensor":                "Sensor",
  "Sensor Area Captured":  "Sensor_Area",
  "Media Type":            "Media_Type",
  "Mon Color Space":       "Monitor_Color_Space",
  "Monitor LUT":           "Monitor_LUT",
  "LUT Used":              "LUT_Used",
  "LUT Used On Set":       "LUT_Used_On_Set",
  "RAW":                   "RAW",
  "H-Flip":                "H_Flip",
  "V-Flip":                "V_Flip",

  // ── Lens ─────────────────────────────────────────────────────────────────
  "Lens Type":             "Lens_Type",
  "Lens #":                "Lens_#",
  "Lens Notes":            "Lens_Notes",
  "Cam Aperture":          "Aperture",
  "Camera Aperture Type":  "Aperture_Type",
  "Focal Point (mm)":      "Focal_Length",
  "Distance":              "Distance",
  "Filter":                "Filter",
  "ND Filter":             "ND_Filter",
  "PAR Notes":             "PAR_Notes",
  "Asp Ratio Notes":       "Asp_Ratio_Notes",
  "Gamma Notes":           "Gamma_Notes",
  "Color Space Notes":     "Color_Space_Notes",

  // ── Post / Color ─────────────────────────────────────────────────────────
  "LUT 1":                 "LUT1",
  "LUT 2":                 "LUT2",
  "LUT 3":                 "LUT3",
  "Lab Roll #":            "Lab_Roll",
  "Colorist Notes":        "Colorist_Notes",
  "CDL SOP":               "CDL_SOP",
  "CDL SAT":               "CDL_SAT",
  "IDT":                   "IDT",
  "Input LUT":             "Input_LUT",
  "Input Color Space":     "Input_Color_Space",
  "Input Sizing Preset":   "Input_Sizing_Preset",
  "Input Sizing":          "Input_Sizing",
  "Edit Sizing":           "Edit_Sizing",
  "Slate TC":              "Slate_TC",
  "Graded":                "Graded",
  "HDR Graded":            "HDR_Graded",
  "Modified":              "Modified",
  "Unrendered":            "Unrendered",
  "Tracked":               "Tracked",
  "Noise Reduction":       "Noise_Reduction",
  "Proxy Clip":            "Proxy_Clip",
  "Different Frame Rate":  "Different_Frame_Rate",
  "Matte Nodes":           "Matte_Nodes",
  "Associated Mattes":     "Associated_Mattes",
  "Shared Nodes":          "Shared_Nodes",
  "Fusion Composition":    "Fusion_Composition",
  "Magic Mask":            "Magic_Mask",
  "Collaborative Update":  "Collaborative_Update",
  "Compression Ratio":     "Compression_Ratio",
  "Codec Bitrate":         "Codec_Bitrate",
  "Render Resolution":     "Render_Resolution",

  // ── 3D / Stereo ──────────────────────────────────────────────────────────
  "S3D Shot":              "S3D_Shot",
  "S3D Eye":               "S3D_Eye",
  "S3D Notes":             "S3D_Notes",
  "S3D Sync":              "S3D_Sync",
  "IA":                    "IA",
  "FG":                    "FG",
  "CV":                    "CV",
  "BG":                    "BG",
  "Convergence Adj":       "Convergence_Adj",
  "3D Rig Type":           "3D_Rig_Type",
  "3D Rig ID #":           "3D_Rig_ID",
  "Rig Inverted":          "Rig_Inverted",
  "Eye":                   "Eye",

  // ── VFX ──────────────────────────────────────────────────────────────────
  "VFX Shot #":            "VFX_Shot",
  "VFX Markers":           "VFX_Markers",
  "VFX Notes":             "VFX_Notes",
  "Framing Chart":         "Framing_Chart",
  "Color Chart":           "Color_Chart",
  "Grey Chart":            "Grey_Chart",
  "Lens Chart":            "Lens_Chart",
  "VFX Grey Ball":         "VFX_Grey_Ball",
  "VFX Mirror Ball":       "VFX_Mirror_Ball",

  // ── Audio ────────────────────────────────────────────────────────────────
  "Audio Recorder":        "Audio_Recorder",
  "Deck Serial #":         "Deck_Serial",
  "Deck Firmware":         "Deck_Firmware",
  "Audio Notes":           "Audio_Notes",
  "Embedded Audio":        "Embedded_Audio",
  "Audio File Type":       "Audio_File_Type",
  "Audio Media":           "Audio_Media",
  "Sound Roll #":          "Sound_Roll",
  "Audio TC Type":         "Audio_TC_Type",
  "Audio Start TC":        "Audio_Start_TC",
  "Audio End TC":          "Audio_End_TC",
  "Audio Dur TC":          "Audio_Dur_TC",
  "Sample Rate (KHz)":     "Sample_Rate",
  "Audio Sample Rate":     "Audio_Sample_Rate",
  "Audio FPS":             "Audio_FPS",
  "Audio Bit Depth":       "Audio_Bit_Depth",
  "Audio Offset":          "Audio_Offset",
  "Bit Rate":              "Bit_Rate",
  "Tone":                  "Tone",
  "FSD":                   "FSD",
  "Track 1":   "Track_1",  "Track 2":   "Track_2",  "Track 3":   "Track_3",
  "Track 4":   "Track_4",  "Track 5":   "Track_5",  "Track 6":   "Track_6",
  "Track 7":   "Track_7",  "Track 8":   "Track_8",  "Track 9":   "Track_9",
  "Track 10":  "Track_10", "Track 11":  "Track_11", "Track 12":  "Track_12",
  "Track 13":  "Track_13", "Track 14":  "Track_14", "Track 15":  "Track_15",
  "Track 16":  "Track_16", "Track 17":  "Track_17", "Track 18":  "Track_18",
  "Track 19":  "Track_19", "Track 20":  "Track_20", "Track 21":  "Track_21",
  "Track 22":  "Track_22", "Track 23":  "Track_23", "Track 24":  "Track_24",
  "Aux 1":                 "Aux_1",
  "Aux 2":                 "Aux_2",
  "Start Dialog TC":       "Start_Dialog_TC",
  "End Dialog TC":         "End_Dialog_TC",
  "Dialog Duration":       "Dialog_Duration",
  "Dialog Starts As":      "Dialog_Starts_As",
  "Dialog Notes":          "Dialog_Notes",

  // ── Crew / Production ────────────────────────────────────────────────────
  "Production Name":       "Production_Name",
  "Series #":              "Series_#",
  "Genre":                 "Genre",
  "Production Co":         "Production_Co",
  "Producer":              "Producer",
  "Asst Producer":         "Asst_Producer",
  "Line Producer":         "Line_Producer",
  "Unit Manager":          "Unit_Manager",
  "Post Producer":         "Post_Producer",
  "Production Asst":       "Production_Asst",
  "Editor":                "Editor",
  "Editing Asst":          "Editing_Asst",
  "Data Wrangler":         "Data_Wrangler",
  "Colorist":              "Colorist",
  "Colorist Asst":         "Colorist_Asst",
  "Dailies Colorist":      "Dailies_Colorist",
  "Director":              "Director",
  "Asst Director":         "Asst_Director",
  "Script Suprvisr":       "Script_Supervisor",
  "Continuity":            "Continuity",
  "DOP":                   "DOP",
  "Cam Operator":          "Cam_Operator",
  "Cam Asst":              "Cam_Asst",
  "Focus Puller":          "Focus_Puller",
  "Key Grip":              "Key_Grip",
  "Sound Mixer":           "Sound_Mixer",
  "Digital Tech":          "Digital_Tech",
  "Crew Comments":         "Crew_Comments",
  "2nd Dir":               "2nd_Dir",
  "2nd Dir Asst":          "2nd_Dir_Asst",
  "2nd Continuity":        "2nd_Continuity",
  "2nd DOP":               "2nd_DOP",
  "2nd Asst":              "2nd_Asst",
  "2nd DIT":               "2nd_DIT",
  "DOP Reviewed":          "DOP_Reviewed",
  "Director Reviewed":     "Director_Reviewed",
  "Focus Reviewed":        "Focus_Reviewed",
  "VFX Svsr Reviewed":     "VFX_Svsr_Reviewed",
  "Colorist Reviewed":     "Colorist_Reviewed",
  "2nd DOP Reviewed":      "2nd_DOP_Reviewed",
  "2nd Dir Reviewed":      "2nd_Dir_Reviewed",
  "Sound Reviewed":        "Sound_Reviewed",
  "Continuity Reviewed":   "Continuity_Reviewed",
  "Wardrobe Reviewed":     "Wardrobe_Reviewed",
  "Send to Studio":        "Send_to_Studio",
  "Send to":               "Send_to",
  "Reviewers Notes":       "Reviewers_Notes",

  // ── Timeline / Project ───────────────────────────────────────────────────
  "Timeline":              "Timeline",
  "Timeline Name":         "Timeline",
  "Timeline Index":        "Timeline_Index",
  "Color Thumbnail Index": "Color_Thumbnail_Index",
  "Project Name":          "Project_Name",
  "Track Number":          "Track_Number",
  "Track Name":            "Track_Name",
  "Record TC":             "Record_TC",
  "Source TC":             "Source_TC",
  "Synced Audio File Name":"Synced_Audio_File",
  "Synced Audio TC":       "Synced_Audio_TC",
  "EDL Tape Number":       "EDL_Tape_Number",
  "EDL Event Number":      "EDL_Event_Number",

  // ── Date / Time ──────────────────────────────────────────────────────────
  "Date":                  "Date",
  "Date ISO":              "Date_ISO",
  "Date US":               "Date_US",
  "Date Year":             "Date_Year",
  "Date Month":            "Date_Month",
  "Date Day":              "Date_Day",
  "Time 24hr":             "Time_24hr",
  "Time 12hr":             "Time_12hr",
  "Time ISO":              "Time_ISO",
  "Time Hour 12hr":        "Time_Hour_12hr",
  "Time Hour 24hr":        "Time_Hour_24hr",
  "Time Minutes":          "Time_Minutes",
  "Time Seconds":          "Time_Seconds",

  // ── Markers ──────────────────────────────────────────────────────────────
  "Marker Name":           "Marker_Name",
  "Marker Notes":          "Marker_Notes",
  "Marker Keywords":       "Marker_Keywords",
};

// Convert "%{Token Name} text %{Other}" → "%Token_Name text %Other"
function convertResolveTemplate(text) {
  return text.replace(/%\{([^}]+)\}/g, (match, tokenName) => {
    const mapped = resolveTokenMap[tokenName];
    if (mapped) return `%${mapped}`;
    // Fallback: remove braces, replace spaces and special chars
    const fallback = tokenName.replace(/\s+/g, "_").replace(/[()]/g, "");
    return `%${fallback}`;
  });
}

// Convert Resolve's HorzAlign int (0=left,1=center,2=right) to CSS string
function resolveAlignLabel(horz) {
  return horz === 0 ? "left" : horz === 2 ? "right" : "center";
}

// Convert [r, g, b] floats (0..1) to #rrggbb hex
function rgbToHex(fg) {
  const ch = fg.map(v => {
    const n = Math.round(clamp(v, 0, 1) * 255);
    return n.toString(16).padStart(2, "0");
  });
  return `#${ch.join("")}`;
}

async function fetchAndShowPresets() {
  const overlay = document.getElementById("presetsOverlay");
  const statusEl = document.getElementById("presetsStatus");
  const listEl = document.getElementById("presetsList");

  overlay.classList.remove("hidden");
  statusEl.textContent = "Loading…";
  listEl.innerHTML = "";

  try {
    const res = await fetch(`${API_BASE}/presets`);
    const json = await res.json();
    if (!json.ok) throw new Error(json.error || "Server error");

    const presets = json.presets || [];
    statusEl.textContent = `${presets.length} preset(s) found`;

    if (presets.length === 0) {
      listEl.innerHTML = "<p style='color:#666'>No presets found.</p>";
      return;
    }

    presets.forEach(preset => {
      const block = document.createElement("div");
      block.className = "presetBlock";

      const header = document.createElement("div");
      header.className = "presetHeader";

      const nameSpan = document.createElement("span");
      nameSpan.className = "presetName";
      nameSpan.textContent = preset.name;

      const right = document.createElement("div");
      right.className = "presetHeaderRight";

      const countSpan = document.createElement("span");
      countSpan.className = "presetCount";
      countSpan.textContent = `${preset.elements.length} element(s)`;

      const toggleSpan = document.createElement("span");
      toggleSpan.className = "presetToggle";
      toggleSpan.textContent = "▶";

      right.appendChild(countSpan);
      right.appendChild(toggleSpan);
      header.appendChild(nameSpan);
      header.appendChild(right);

      const body = document.createElement("div");
      body.className = "presetBody";

      preset.elements.forEach(elem => {
        const row = document.createElement("div");
        row.className = "presetElem";

        const typeEl = document.createElement("div");
        typeEl.className = "presetElemType";
        typeEl.textContent = elem.type_label || `Type ${elem.type}`;

        const textEl = document.createElement("div");
        textEl.className = "presetElemText" + (elem.text ? "" : " auto");
        if (elem.text) {
          textEl.textContent = convertResolveTemplate(elem.text);
        } else {
          textEl.textContent = "(auto-filled by Resolve)";
        }

        const fontEl = document.createElement("div");
        fontEl.className = "presetElemFont";
        fontEl.textContent = `${elem.font_family} ${elem.font_size}pt${elem.font_weight === "bold" ? " bold" : ""}`;

        const posEl = document.createElement("div");
        posEl.className = "presetElemPos";
        posEl.textContent = `x:${(elem.x * 100).toFixed(0)}% y:${(elem.y * 100).toFixed(0)}%\nop:${elem.opacity.toFixed(2)}\n${resolveAlignLabel(elem.horz_align)}`;
        posEl.style.whiteSpace = "pre";

        row.appendChild(typeEl);
        row.appendChild(textEl);
        row.appendChild(fontEl);
        row.appendChild(posEl);
        body.appendChild(row);
      });

      // Import button — always shown (supports both custom text and auto-fill types)
      if (preset.elements.length > 0) {
        const importBtn = document.createElement("button");
        importBtn.className = "btnImportPreset";
        importBtn.textContent = "Import into layout";
        importBtn.addEventListener("click", () => {
          importResolvePreset(preset);
          overlay.classList.add("hidden");
        });
        body.appendChild(importBtn);
      }

      header.addEventListener("click", () => {
        const isOpen = body.classList.toggle("open");
        toggleSpan.textContent = isOpen ? "▼" : "▶";
      });

      block.appendChild(header);
      block.appendChild(body);
      listEl.appendChild(block);
    });

  } catch (e) {
    statusEl.textContent = `Error: ${e.message}`;
  }
}

// Resolve Type code → our internal key (reverse of _OUR_KEY_TO_RESOLVE_TYPE)
const resolveTypeToKey = {
  1:        "Record_TC",
  4:        "Source_TC",
  16:       "KeyKode",
  32:       "File_Name",
  256:      "Clipname",
  1024:     "Reel_Name",
  2048:     "Scene",
  4096:     "Take",
  8192:     "Shot",
  16384:    "Angle",
  32768:    "Shoot_Day",
  65536:    "Date",
  131072:   "Good_Take",
  524288:   "Camera_#",
  1048576:  "Roll_Card",
  33554432: "Synced_Audio_File",
};

function importResolvePreset(preset) {
  pushUndoState();

  preset.elements.forEach(elem => {
    const type  = elem.type;
    const color = rgbToHex(elem.fg_color || [1, 1, 1]);
    const align = resolveAlignLabel(elem.horz_align);
    const base  = {
      x:           clamp(elem.x, 0, 1),
      y:           clamp(elem.y, 0, 1),
      font_size_pt: clamp(elem.font_size || 24, 4, 400),
      opacity:     clamp(elem.opacity, 0, 1),
      align:       align,
      font_family: elem.font_family || state.burnin_font_family || "Arial",
      font_weight: elem.font_weight || "normal",
      color:       color,
    };

    if (type === 128 || type === 129 || type === 130) {
      // Custom text slot — needs a text template
      if (!elem.text) return;
      const converted = convertResolveTemplate(elem.text);
      const tplObj    = compileTemplateParts(converted);
      state.elements.push({
        ...base,
        key:            "custom",
        template_custom: converted,
        template_parts:  { parts: tplObj.parts },
        custom_tokens:   tplObj.tokens,
      });
    } else {
      // Auto-fill type — reverse-map to our internal key
      const key = resolveTypeToKey[type];
      if (!key) return; // unknown/unsupported type, skip silently
      state.elements.push({
        ...base,
        key:            key,
        template_custom: "",
        template_parts:  { parts: [] },
        custom_tokens:   [],
      });
    }
  });

  renderLayoutList();
  render();
  scheduleSave();
  setStatus("Preset imported", "ok");
}

async function init(){
  bindInputs();
  renderMetadataTokens();
  fillSelect(els.metaFontFamily, Array.from(new Set([...systemFontFamilies, ...loadedFontFamilies])), state.burnin_font_family || "Arial");
  await loadFromServer();
  updateCanvasRatio();
  // --- Load default preview image if none selected ---
  if (!bgImage) {
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      render();
    };
    img.src = "default_image.jpg";
  }
  render();
}

init();