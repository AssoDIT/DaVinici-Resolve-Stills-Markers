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
  elements: []
};

// Map UI metadata keys to real JSON paths inside Timeline_*_stills_full_metadata.json
// Order of lookup matters.
const metadataKeyMap = {
  "timeline_frame": ["timeline_frame"],
  "timeline_TC": ["timeline_TC", "timeline_tc"],

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
      parts.push({ type: "token", key: tokenKey });
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
    .map(p => p.key);

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
      const rawValue = resolveMetadataValue(previewMetadata, p.key);

      // Special case: Good_Take = 1/true/yes → display as [*]
      if(p.key === "Good_Take"){
        const v = String(rawValue || "").trim().toLowerCase();
        out += "[*]";
        continue;
      }

      if(rawValue && String(rawValue).trim() !== ""){
        out += `[${rawValue}]`;
      } else {
        // If metadata missing, show token name
        out += `[${p.key}]`;
      }
    }
  }

  return out.trim();
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

  // Editing selected element position
  els.metaPosX.addEventListener("input", ()=>{
    if(state.selectedIndex == null) return;
    const item = state.elements[state.selectedIndex];
    item.x = clamp(parseFloat(els.metaPosX.value)/100,0,1);
    if(els.metaPosXVal) els.metaPosXVal.textContent = pctLabel(item.x);
    render();
    scheduleSave();
  });

  els.metaPosY.addEventListener("input", ()=>{
    if(state.selectedIndex == null) return;
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
        state.selectedIndex = box.index;

        renderLayoutList();
        render();

        // --- Activate drag ---
        drag.active = true;
        drag.index = box.index;

        // Correct offset: distance between click point and text top-left
        drag.offsetX = px - box.x;
        drag.offsetY = py - box.y;

        els.canvas.style.cursor = "grabbing";

        els.canvas.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        return;
      }
    }
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
}

function renderMetadataTokens(){
  if(!els.metadataTokenList) return;

  els.metadataTokenList.innerHTML = "";

  // ---- Custom token ----
  const customDiv = document.createElement("div");
  customDiv.textContent = "Custom";
  customDiv.style.padding = "6px";
  customDiv.style.marginBottom = "6px";
  customDiv.style.cursor = "pointer";
  customDiv.style.border = "1px solid #2a2f3a";
  customDiv.style.borderRadius = "4px";
  customDiv.style.fontSize = "12px";

  customDiv.addEventListener("click", ()=>{
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
    div.textContent = key;
    div.style.padding = "6px";
    div.style.marginBottom = "6px";
    div.style.cursor = "pointer";
    div.style.border = "1px solid #2a2f3a";
    div.style.borderRadius = "4px";
    div.style.fontSize = "12px";

    div.addEventListener("click", ()=>{
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

function renderLayoutList(){
  els.burninLayoutList.innerHTML = "";

  state.elements.forEach((item, index) => {

    const div = document.createElement("div");
    div.style.marginBottom = "6px";
    div.style.padding = "6px";
    div.style.cursor = "pointer";
    div.style.border = "1px solid #2a2f3a";
    div.style.borderRadius = "4px";
    div.style.fontSize = "12px";
    div.textContent = item.key === "custom" ? "Custom" : item.key;

    // Highlight if selected
    if(state.selectedIndex === index){
      div.style.background = "#1f2937";
      div.style.borderColor = "#3b82f6";
    }

    // Click = select for editing
    div.addEventListener("click", ()=>{
      state.selectedIndex = index;

      // Custom field block (move above position/size)
      if(els.metaTemplateCustom){
        if(item.key === "custom"){
          els.metaTemplateCustom.style.display = "block";
          els.metaTemplateCustom.value = item.template_custom || "";
          // Ensure parts exist so Python can render from structured tokens
          if(!item.template_parts || !item.template_parts.parts){
            const tplObj = compileTemplateParts(item.template_custom || "");
            item.template_parts = tplObj;
            item.custom_tokens = tplObj.tokens;
          }
          // Auto-focus when selecting Custom
          setTimeout(()=>{
            els.metaTemplateCustom.focus();
            els.metaTemplateCustom.select();
          }, 0);
        } else {
          els.metaTemplateCustom.style.display = "none";
        }
      }

      // Load values into UI for editing
      els.metaPosX.value = ((item.x || 0.5) * 100).toFixed(1);
      els.metaPosY.value = ((item.y || 0.5) * 100).toFixed(1);
      if(els.metaPosXVal) els.metaPosXVal.textContent = pctLabel(item.x||0.5);
      if(els.metaPosYVal) els.metaPosYVal.textContent = pctLabel(item.y||0.5);

      els.metaAlign.value = item.align;
      els.metaFontSize.value = item.font_size_pt || 24;

      if(els.metaColor) els.metaColor.value = item.color || "#ffffff";

      if(els.metaOpacity){
        els.metaOpacity.value = item.opacity ?? state.burnin_opacity;
        if(els.metaOpacityVal) els.metaOpacityVal.textContent = (item.opacity ?? state.burnin_opacity).toFixed(2);
      }
      if(els.metaBold) els.metaBold.checked = (item.font_weight === "bold");
      if(els.metaFontFamily){
        fillSelect(els.metaFontFamily, Array.from(new Set([...systemFontFamilies, ...loadedFontFamilies])), item.font_family || state.burnin_font_family || "Arial");
      }

      renderLayoutList();
      render();
    });

    // Right click delete
    div.addEventListener("contextmenu", (e)=>{
      e.preventDefault();
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

  if(bgImage){
    drawCover(bgImage,0,0,W,H);
  } else {
    ctx.fillStyle = "#0b0d12";
    ctx.fillRect(0,0,W,H);
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

  // We need one metadata block to preview.
  // For preview, take the first marker if available.
  const previewMetadata = window.previewMetadata || {};

  state.elements.forEach((item, index) => {

    const fontSize = item.font_size_pt || 24;

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

function scheduleSave(){
  if(saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveToServer, 300);
}

async function loadFromServer(){
  try{
    const res = await fetch(`${API_BASE}/load`);
    const json = await res.json();
    if(!json.ok) throw new Error();
    state = { ...state, ...(json.data || {}) };
    if(!Array.isArray(state.elements)) state.elements = [];

    // --- Normalize custom elements so JSON ALWAYS contains explicit tokens ---
    state.elements = state.elements.map(el => {
      if(el && el.key === "custom"){
        // Ensure template_custom exists
        if(!el.template_custom) el.template_custom = "%Scene";

        const tplObj = compileTemplateParts(el.template_custom);

        return {
          ...el,
          template_parts: tplObj,
          custom_tokens: tplObj.tokens
        };
      }
      return el;
    });

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

    renderLayoutList();
    // Ensure slider % labels are always updated on load.
    if(state.selectedIndex != null){
      const item = state.elements[state.selectedIndex];
      if(els.metaPosXVal) els.metaPosXVal.textContent = pctLabel(item.x || 0.5);
      if(els.metaPosYVal) els.metaPosYVal.textContent = pctLabel(item.y || 0.5);
    }
    render();
    setStatus("Chargé","ok");
  } catch {
    setStatus("Serveur non disponible","bad");
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

        // NEVER hardcode a default token like %Scene.
        // Custom must reflect exactly what the user typed.
        const tpl = String(el.template_custom || "");

        // Parse ANY %Token dynamically.
        const tplObj = compileTemplateParts(tpl);

        base.template_custom = tpl;

        base.template_parts = {
          parts: Array.isArray(tplObj.parts) ? tplObj.parts : []
        };

        // Extract token names without restriction.
        base.custom_tokens = Array.isArray(tplObj.tokens)
          ? tplObj.tokens
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
      elements: normalizedElements
    };

    const res = await fetch(`${API_BASE}/save`,{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify(cleanedState)
    });

    const json = await res.json();
    if(!json.ok) throw new Error();
    setStatus("Sauvegardé","ok");
  } catch {
    setStatus("Erreur sauvegarde","bad");
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
  render();
}

init();