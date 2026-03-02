const API_BASE = "http://127.0.0.1:8765";

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
  btnSave: document.getElementById("btnSave"),

  canvas: document.getElementById("previewCanvas"),

  safeGuides: document.getElementById("safeGuides"),
  safeGuideOuter: document.getElementById("safeGuideOuter"),
  safeGuideInner: document.getElementById("safeGuideInner"),
  imageRatio: document.getElementById("imageRatio"),
  maskOpacityVal: document.getElementById("maskOpacityVal"),
};

const ctx = els.canvas.getContext("2d");

let state = {
  selectedIndex: null,
  burnin_font_path: "",
  burnin_opacity: 0.5,
  burnin_font_family: "Arial",
  safe_guides: true,
  safe_guide_outer: 0.05,
  safe_guide_inner: 0.10,
  elements: [],
  image_ratio: 1.77,
  image_ratio_mode: "crop", // "crop" | "fit"
  mask_style: "bars",       // "bars" | "lines" | "bars_lines"
  mask_opacity: 1.0
};

// --- Simple Undo Stack ---
let undoStack = [];
const MAX_UNDO = 50;

function pushUndoState(){
  // Deep clone only elements (lightweight history)
  const snapshot = JSON.stringify(state.elements);
  undoStack.push(snapshot);
  if(undoStack.length > MAX_UNDO){
    undoStack.shift();
  }
}

function undoLastAction(){
  if(undoStack.length === 0) return;
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
  ]
};
let metadataKeys = Object.keys(metadataKeyMap);

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
  const re = /%[A-Za-z0-9_#]+/g;
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

let drag = { active:false, index:null, offsetX:0, offsetY:0 };
let lastBoxes = []; // [{index, x,y,w,h}]
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

  // Close with Escape key
  document.addEventListener("keydown", (ev)=>{
    if(ev.key === "Escape" && helpOverlay && !helpOverlay.classList.contains("hidden")){
      helpOverlay.classList.add("hidden");
    }
  });

  els.btnSave.addEventListener("click", saveToServer);

  els.imgPicker.addEventListener("change", (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if(!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      bgImage = img;
      render();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });

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

  // Editing selected element position
  els.metaPosX.addEventListener("input", ()=>{
    if(state.selectedIndex == null) return;
    pushUndoState();
    const item = state.elements[state.selectedIndex];
    item.x = clamp(parseFloat(els.metaPosX.value)/100,0,1);
    if(els.metaPosXVal) els.metaPosXVal.textContent = pctLabel(item.x);
    render();
    scheduleSave();
  });

  els.metaPosY.addEventListener("input", ()=>{
    if(state.selectedIndex == null) return;
    pushUndoState();
    const item = state.elements[state.selectedIndex];
    item.y = clamp(parseFloat(els.metaPosY.value)/100,0,1);
    if(els.metaPosYVal) els.metaPosYVal.textContent = pctLabel(item.y);
    render();
    scheduleSave();
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

      item.x = clamp(moveX / W, 0, 1);
      item.y = clamp(moveY / H, 0, 1);

      if(els.metaPosX){
        els.metaPosX.value = (item.x * 100).toFixed(1);
      }
      if(els.metaPosY){
        els.metaPosY.value = (item.y * 100).toFixed(1);
      }
      if(els.metaPosXVal) els.metaPosXVal.textContent = pctLabel(item.x);
      if(els.metaPosYVal) els.metaPosYVal.textContent = pctLabel(item.y);

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
      els.canvas.style.cursor = "default";
      scheduleSave();
    }
  }
  els.canvas.addEventListener("pointerup", endDrag);
  els.canvas.addEventListener("pointercancel", endDrag);

  if(els.safeGuides){
    els.safeGuides.addEventListener("change", ()=>{
      state.safe_guides = els.safeGuides.checked;
      render();
      scheduleSave();
    });
  }
  if(els.safeGuideOuter){
    els.safeGuideOuter.addEventListener("input", ()=>{
      state.safe_guide_outer = clamp(Number(els.safeGuideOuter.value), 0, 0.2);
      render();
      scheduleSave();
    });
  }
  if(els.safeGuideInner){
    els.safeGuideInner.addEventListener("input", ()=>{
      state.safe_guide_inner = clamp(Number(els.safeGuideInner.value), 0, 0.2);
      render();
      scheduleSave();
    });
  }
  // --- Keyboard shortcuts ---
  document.addEventListener("keydown", (ev) => {
    const isMac = navigator.platform.toUpperCase().includes("MAC");

    const isSaveShortcut =
      (isMac && ev.metaKey && ev.key.toLowerCase() === "s") ||
      (!isMac && ev.ctrlKey && ev.key.toLowerCase() === "s");

    const isUndoShortcut =
      (isMac && ev.metaKey && ev.key.toLowerCase() === "z") ||
      (!isMac && ev.ctrlKey && ev.key.toLowerCase() === "z");

    if (isSaveShortcut) {
      ev.preventDefault();
      saveToServer();
    }

    if (isUndoShortcut) {
      ev.preventDefault();
      undoLastAction();
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

function renderMetadataTokens(){
  if(!els.metadataTokenList) return;

  els.metadataTokenList.innerHTML = "";

  // ---- Custom token ----
  const customDiv = document.createElement("div");
  customDiv.classList.add("tokenItem");
  customDiv.textContent = "Custom";
  customDiv.style.padding = "6px";
  customDiv.style.marginBottom = "6px";
  customDiv.style.cursor = "pointer";
  customDiv.style.border = "1px solid #2a2f3a";
  customDiv.style.borderRadius = "4px";
  customDiv.style.fontSize = "12px";

  customDiv.addEventListener("click", ()=>{
    pushUndoState();
    const tpl = "%Scene / %Shot - %Take %Camera#";
    const tplObj = compileTemplateParts(tpl);
    state.elements.push({
      key: "custom",
      x: 0.5,
      y: 0.5,
      font_size_pt: 24,
      opacity: state.burnin_opacity,
      align: "center",
      font_family: state.burnin_font_family || "Arial",
      font_weight: "normal",
      template_custom: tpl,
      template_parts: tplObj,
      custom_tokens: tplObj.tokens,
      color: "#ffffff",
    });

    // Auto-select newly created element
    state.selectedIndex = state.elements.length - 1;

    renderLayoutList();
    render();
    scheduleSave();
  });

  els.metadataTokenList.appendChild(customDiv);

  metadataKeys.forEach(key => {
    const div = document.createElement("div");
    div.classList.add("tokenItem");
    div.textContent = key;
    div.style.padding = "6px";
    div.style.marginBottom = "6px";
    div.style.cursor = "pointer";
    div.style.border = "1px solid #2a2f3a";
    div.style.borderRadius = "4px";
    div.style.fontSize = "12px";

    div.addEventListener("click", ()=>{
      pushUndoState();
      state.elements.push({
        key: key,
        x: 0.5,
        y: 0.5,
        font_size_pt: 24,
        opacity: state.burnin_opacity,
        align: "center",
        font_family: state.burnin_font_family || "Arial",
        font_weight: "normal",
        template_custom: "",
        color: "#ffffff",
      });

      // Auto-select newly created element
      state.selectedIndex = state.elements.length - 1;

      renderLayoutList();
      render();
      scheduleSave();
    });

    els.metadataTokenList.appendChild(div);
  });
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
    els.metaPosX.value = ((item.x || 0.5) * 100).toFixed(1);
  }
  if(els.metaPosY){
    els.metaPosY.value = ((item.y || 0.5) * 100).toFixed(1);
  }
  if(els.metaPosXVal) els.metaPosXVal.textContent = pctLabel(item.x || 0.5);
  if(els.metaPosYVal) els.metaPosYVal.textContent = pctLabel(item.y || 0.5);

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
  const W = els.canvas.width;
  const H = els.canvas.height;

  ctx.clearRect(0,0,W,H);

  lastBoxes = [];

  // --- Intelligent crop / fit simulation ---
  const canvasRatio = W / H;
  const targetRatio = state.image_ratio || 1.77;

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

    const maskAlpha = clamp(state.mask_opacity ?? 1, 0, 1);

    ctx.save();
    ctx.globalAlpha = maskAlpha;

    // --- Draw black bars only if style includes bars ---
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

    // --- Draw white frame only if style includes lines ---
    if(state.mask_style === "lines" || state.mask_style === "bars_lines"){
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(cropX, cropY, cropW, cropH);
    }

    ctx.restore();

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

  // Draw safe area guides
  if(state.safe_guides){
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;

    const outerInsetX = W * state.safe_guide_outer;
    const outerInsetY = H * state.safe_guide_outer;
    ctx.strokeRect(outerInsetX, outerInsetY, W - 2*outerInsetX, H - 2*outerInsetY);

    const innerInsetX = W * state.safe_guide_inner;
    const innerInsetY = H * state.safe_guide_inner;
    ctx.strokeRect(innerInsetX, innerInsetY, W - 2*innerInsetX, H - 2*innerInsetY);
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

  state.elements.forEach((item, index) => {

    // Reduce preview size on canvas (visual only, does not affect saved value)
    const fontSize = (item.font_size_pt || 24) * 0.75;

    const fmt = applyConditionalFormatting(previewMetadata, item);
    ctx.globalAlpha = clamp(item.opacity ?? state.burnin_opacity, 0, 1);

    const family = item.font_family || state.burnin_font_family || "Arial";
    const weight = fmt.font_weight || "normal";
    ctx.font = `${weight} ${fontSize}px ${family}`;

    const x = item.x * W;
    const y = item.y * H;

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

    ctx.fillStyle = item.color || "#ffffff";
    ctx.textBaseline = "top";
    ctx.fillText(text, drawX, y);

    // Draw selection indicator using element color
    if(state.selectedIndex === index){
      ctx.strokeStyle = item.color || "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(drawX - 4, y - 4, textWidth + 8, fontSize * 1.2 + 8);
    }

    // Save hitbox for dragging: approximate height as fontSize * 1.2
    lastBoxes.push({
      index,
      x: drawX,
      y: y,
      w: textWidth,
      h: fontSize * 1.2
    });
  });

  ctx.globalAlpha = 1.0;
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

        if(p.safe_guides && typeof p.safe_guides === "object"){
            state.safe_guides = !!p.safe_guides.enabled;
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
    // Initialize safe guides controls
    if(els.safeGuides) els.safeGuides.checked = !!state.safe_guides;
    if(els.safeGuideOuter) els.safeGuideOuter.value = state.safe_guide_outer ?? 0.05;
    if(els.safeGuideInner) els.safeGuideInner.value = state.safe_guide_inner ?? 0.10;

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
      if(els.metaPosXVal) els.metaPosXVal.textContent = pctLabel(item.x || 0.5);
      if(els.metaPosYVal) els.metaPosYVal.textContent = pctLabel(item.y || 0.5);
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
        color: el.color || "#ffffff"
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
      safe_guides: !!state.safe_guides,
      safe_guide_outer: Number(state.safe_guide_outer ?? 0.05),
      safe_guide_inner: Number(state.safe_guide_inner ?? 0.10),
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
        safe_guides: {
          enabled: !!state.safe_guides
        }
      }
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

function clamp(v,a,b){
  if(Number.isNaN(v)) return a;
  return Math.max(a,Math.min(b,v));
}
function clampInt(v,a,b){
  if(Number.isNaN(v)) return a;
  return Math.max(a,Math.min(b,Math.round(v)));
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