#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
import re
import struct
import threading
import uuid
import webbrowser
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_DIR = BASE_DIR  # Stills_Marker_python_settings
JSON_PATH = os.path.join(SETTINGS_DIR, "burnin_web_settings.json")

def _find_xml_path():
    candidates = [
        os.path.expanduser(
            "~/Library/Application Support/Blackmagic Design/DaVinci Resolve/"
            "Resolve Project Library/Resolve Projects/Settings/SlatePresetList.xml"
        ),
        os.path.expanduser(
            "~/Library/Application Support/Blackmagic Design/DaVinci Resolve/"
            "Resolve Disk Database/Resolve Projects/Settings/SlatePresetList.xml"
        ),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return candidates[0]  # fallback to first path if neither exists

XML_PATH = _find_xml_path()

# Resolve internal type codes → human-readable label
_RESOLVE_TYPE_LABELS = {
    1:        "Record Timecode",
    2:        "Record Frame Number",
    3:        "Record TC & Frame Num",
    4:        "Source Timecode",
    5:        "Source & Record TC",
    8:        "Source Frame Number",
    12:       "Source TC & Frame Num",
    16:       "Keycode",
    32:       "Source File Name",
    64:       "Record File Name",
    128:      "Custom Text1",
    129:      "Custom Text2",
    130:      "Custom Text3",
    256:      "Source Clip Name",
    512:      "Logo1",
    513:      "Logo2",
    514:      "Logo3",
    1024:     "Reel Name",
    2048:     "Scene",
    4096:     "Take",
    8192:     "Shot",
    16384:    "Angle",
    32768:    "Day",
    65536:    "Date",
    131072:   "Good Take",
    262144:   "Audio Timecode",
    524288:   "Camera",
    1048576:  "Roll/Card",
    2097152:  "Feet & Frames 35mm",
    4194304:  "Feet & Frames 16mm",
    8388608:  "Clip Flags",
    16777216: "Clip Color",
    33554432: "Synced Audio File Name",
}

# Our internal key → Resolve auto-fill type code
# When a key is listed here, the exported element uses that type with empty text,
# and Resolve fills the value automatically. Otherwise, Custom Text1 (128) is used.
_OUR_KEY_TO_RESOLVE_TYPE = {
    "Record_TC":         1,
    "Source_TC":         4,
    "KeyKode":           16,
    "File_Name":         32,
    "Clipname":          256,
    "Reel_Name":         1024,
    "Scene":             2048,
    "Take":              4096,
    "Shot":              8192,
    "Angle":             16384,
    "Shoot_Day":         32768,
    "Date":              65536,
    "Date_Recorded":     65536,
    "Good_Take":         131072,
    "Camera_#":          524288,
    "Roll_Card":         1048576,
    "Synced_Audio_File": 33554432,
}

# Our internal token keys → Resolve token names (for %{...} format export)
_OUR_TO_RESOLVE_TOKENS = {
    # ── File / Clip ──────────────────────────────────────────────────────────
    "Clipname":              "Clip Name",
    "File_Name":             "File Name",
    "Clip_Directory":        "Clip Directory",
    "Video_Codec":           "Video Codec",
    "Start_TC":              "Start TC",
    "Source_TC":             "Source TC",
    "End_TC":                "End TC",
    "Duration":              "Duration TC",
    "Start_Frame":           "Start Frame",
    "End_Frame":             "End Frame",
    "Frames":                "Frames",
    "Resolution":            "Resolution",
    "Source_Resolution":     "Resolution",
    "Data_Level":            "Data Level",
    "Audio_Channels":        "Audio Channels",
    "Date_Modified":         "Date Modified",
    "KeyKode":               "KeyKode",
    "Reel_Name":             "Reel Name",
    "File_Path":             "File Path",
    "Usage":                 "Usage",
    "Subclip":               "Subclip",
    "Clip_Type":             "Clip Type",
    "Clip_#":                "Clip #",
    "Version":               "Version",
    "Group":                 "Group",
    "Drop_Frame":            "Drop Frame",
    "EDL_Clip_Name":         "EDL Clip Name",

    # ── Scene / Shot / Production ────────────────────────────────────────────
    "Scene":                 "Scene",
    "Shot":                  "Shot",
    "Angle":                 "Angle",
    "Take":                  "Take",
    "Move":                  "Move",
    "Keywords":              "Keywords",
    "Good_Take":             "Good Take",
    "Shoot_Day":             "Shoot Day",
    "Date_Recorded":         "Date Recorded",
    "Roll_Card":             "Roll Card #",
    "Program_Name":          "Program Name",
    "Episode_#":             "Episode #",
    "Episode_Name":          "Episode Name",
    "Shot_During_Ep":        "Shot During Ep",
    "Location":              "Location",
    "Unit_Name":             "Unit Name",
    "Setup":                 "Setup",
    "Comments":              "Description",
    "Day_Night":             "Day / Night",
    "Environment":           "Environment",
    "Shot_Type":             "Shot Type",
    "Format":                "Format",
    "Safe_Area":             "Safe Area",
    "Timelapse_Interval":    "Time-lapse Interval",
    "People":                "People",
    "Category":              "Category",
    "Subcategory":           "Subcategory",

    # ── Camera ───────────────────────────────────────────────────────────────
    "Camera_#":              "Cam #",
    "Camera_Type":           "Cam Type",
    "Camera_Serial":         "Cam Serial #",
    "Camera_ID":             "Cam ID",
    "Camera_Notes":          "Cam Notes",
    "Camera_Format":         "Cam Format",
    "FPS":                   "Cam FPS",
    "TC_Type":               "Cam TC Type",
    "Camera_Firmware":       "Cam Firmware",
    "Camera_Manufacturer":   "Camera Manufacturer",
    "Camera_Position":       "Camera Position",
    "Camera_Pan_Angle":      "Camera Pan Angle",
    "Camera_Tilt_Angle":     "Camera Tilt Angle",
    "Camera_Roll_Angle":     "Camera Roll Angle",
    "Shutter_Angle":         "Shutter Angle",
    "Shutter_Speed":         "Shutter Speed",
    "Shutter_Type":          "Shutter Type",
    "ISO":                   "ISO",
    "White_Balance":         "White Point",
    "White_Balance_Tint":    "White Balance Tint",
    "Sensor":                "Sensor",
    "Sensor_Area":           "Sensor Area Captured",
    "Media_Type":            "Media Type",
    "Monitor_Color_Space":   "Mon Color Space",
    "Monitor_LUT":           "Monitor LUT",
    "LUT_Used":              "LUT Used",
    "LUT_Used_On_Set":       "LUT Used On Set",
    "RAW":                   "RAW",
    "H_Flip":                "H-Flip",
    "V_Flip":                "V-Flip",

    # ── Lens ─────────────────────────────────────────────────────────────────
    "Lens_Type":             "Lens Type",
    "Lens_#":                "Lens #",
    "Lens_Notes":            "Lens Notes",
    "Aperture":              "Cam Aperture",
    "Aperture_Type":         "Camera Aperture Type",
    "Focal_Length":          "Focal Point (mm)",
    "Distance":              "Distance",
    "Filter":                "Filter",
    "ND_Filter":             "ND Filter",
    "PAR_Notes":             "PAR Notes",
    "Asp_Ratio_Notes":       "Asp Ratio Notes",
    "Gamma_Notes":           "Gamma Notes",
    "Color_Space_Notes":     "Color Space Notes",

    # ── Post / Color ─────────────────────────────────────────────────────────
    "LUT1":                  "LUT 1",
    "LUT2":                  "LUT 2",
    "LUT3":                  "LUT 3",
    "Lab_Roll":              "Lab Roll #",
    "Colorist_Notes":        "Colorist Notes",
    "CDL_SOP":               "CDL SOP",
    "CDL_SAT":               "CDL SAT",
    "IDT":                   "IDT",
    "Input_LUT":             "Input LUT",
    "Input_Color_Space":     "Input Color Space",
    "Input_Sizing_Preset":   "Input Sizing Preset",
    "Input_Sizing":          "Input Sizing",
    "Edit_Sizing":           "Edit Sizing",
    "Slate_TC":              "Slate TC",
    "Render_Resolution":     "Render Resolution",
    "Compression_Ratio":     "Compression Ratio",
    "Codec_Bitrate":         "Codec Bitrate",

    # ── 3D / Stereo ──────────────────────────────────────────────────────────
    "S3D_Shot":              "S3D Shot",
    "S3D_Eye":               "S3D Eye",
    "S3D_Notes":             "S3D Notes",
    "S3D_Sync":              "S3D Sync",
    "IA":                    "IA",
    "FG":                    "FG",
    "CV":                    "CV",
    "BG":                    "BG",
    "Convergence_Adj":       "Convergence Adj",
    "3D_Rig_Type":           "3D Rig Type",
    "3D_Rig_ID":             "3D Rig ID #",
    "Rig_Inverted":          "Rig Inverted",
    "Eye":                   "Eye",

    # ── VFX ──────────────────────────────────────────────────────────────────
    "VFX_Shot":              "VFX Shot #",
    "VFX_Markers":           "VFX Markers",
    "VFX_Notes":             "VFX Notes",
    "Framing_Chart":         "Framing Chart",
    "Color_Chart":           "Color Chart",
    "Grey_Chart":            "Grey Chart",
    "Lens_Chart":            "Lens Chart",
    "VFX_Grey_Ball":         "VFX Grey Ball",
    "VFX_Mirror_Ball":       "VFX Mirror Ball",

    # ── Audio ────────────────────────────────────────────────────────────────
    "Audio_Recorder":        "Audio Recorder",
    "Deck_Serial":           "Deck Serial #",
    "Deck_Firmware":         "Deck Firmware",
    "Audio_Notes":           "Audio Notes",
    "Embedded_Audio":        "Embedded Audio",
    "Audio_File_Type":       "Audio File Type",
    "Audio_Media":           "Audio Media",
    "Sound_Roll":            "Sound Roll #",
    "Audio_TC_Type":         "Audio TC Type",
    "Audio_Start_TC":        "Audio Start TC",
    "Audio_End_TC":          "Audio End TC",
    "Audio_Dur_TC":          "Audio Dur TC",
    "Sample_Rate":           "Sample Rate (KHz)",
    "Audio_Sample_Rate":     "Audio Sample Rate",
    "Audio_FPS":             "Audio FPS",
    "Audio_Bit_Depth":       "Audio Bit Depth",
    "Audio_Offset":          "Audio Offset",
    "Bit_Rate":              "Bit Rate",
    "Tone":                  "Tone",
    "FSD":                   "FSD",
    **{f"Track_{i}": f"Track {i}" for i in range(1, 25)},
    "Aux_1":                 "Aux 1",
    "Aux_2":                 "Aux 2",
    "Start_Dialog_TC":       "Start Dialog TC",
    "End_Dialog_TC":         "End Dialog TC",
    "Dialog_Duration":       "Dialog Duration",
    "Dialog_Starts_As":      "Dialog Starts As",
    "Dialog_Notes":          "Dialog Notes",

    # ── Crew / Production ────────────────────────────────────────────────────
    "Production_Name":       "Production Name",
    "Series_#":              "Series #",
    "Genre":                 "Genre",
    "Production_Co":         "Production Co",
    "Producer":              "Producer",
    "Asst_Producer":         "Asst Producer",
    "Line_Producer":         "Line Producer",
    "Unit_Manager":          "Unit Manager",
    "Post_Producer":         "Post Producer",
    "Production_Asst":       "Production Asst",
    "Editor":                "Editor",
    "Editing_Asst":          "Editing Asst",
    "Data_Wrangler":         "Data Wrangler",
    "Colorist":              "Colorist",
    "Colorist_Asst":         "Colorist Asst",
    "Dailies_Colorist":      "Dailies Colorist",
    "Director":              "Director",
    "Asst_Director":         "Asst Director",
    "Script_Supervisor":     "Script Suprvisr",
    "Continuity":            "Continuity",
    "DOP":                   "DOP",
    "Cam_Operator":          "Cam Operator",
    "Cam_Asst":              "Cam Asst",
    "Focus_Puller":          "Focus Puller",
    "Key_Grip":              "Key Grip",
    "Sound_Mixer":           "Sound Mixer",
    "Digital_Tech":          "Digital Tech",
    "Crew_Comments":         "Crew Comments",
    "2nd_Dir":               "2nd Dir",
    "2nd_Dir_Asst":          "2nd Dir Asst",
    "2nd_Continuity":        "2nd Continuity",
    "2nd_DOP":               "2nd DOP",
    "2nd_Asst":              "2nd Asst",
    "2nd_DIT":               "2nd DIT",
    "DOP_Reviewed":          "DOP Reviewed",
    "Director_Reviewed":     "Director Reviewed",
    "Focus_Reviewed":        "Focus Reviewed",
    "VFX_Svsr_Reviewed":     "VFX Svsr Reviewed",
    "Colorist_Reviewed":     "Colorist Reviewed",
    "2nd_DOP_Reviewed":      "2nd DOP Reviewed",
    "2nd_Dir_Reviewed":      "2nd Dir Reviewed",
    "Sound_Reviewed":        "Sound Reviewed",
    "Continuity_Reviewed":   "Continuity Reviewed",
    "Wardrobe_Reviewed":     "Wardrobe Reviewed",
    "Send_to_Studio":        "Send to Studio",
    "Send_to":               "Send to",
    "Reviewers_Notes":       "Reviewers Notes",

    # ── Timeline / Project ───────────────────────────────────────────────────
    "Timeline":              "Timeline Name",
    "Timeline_Index":        "Timeline Index",
    "Project_Name":          "Project Name",
    "Track_Number":          "Track Number",
    "Track_Name":            "Track Name",
    "Record_TC":             "Record TC",
    "Synced_Audio_File":     "Synced Audio File Name",
    "Synced_Audio_TC":       "Synced Audio TC",
    "EDL_Tape_Number":       "EDL Tape Number",
    "EDL_Event_Number":      "EDL Event Number",

    # ── Date / Time ──────────────────────────────────────────────────────────
    "Date":                  "Date",
    "Date_ISO":              "Date ISO",
    "Date_US":               "Date US",
    "Date_Year":             "Date Year",
    "Date_Month":            "Date Month",
    "Date_Day":              "Date Day",
    "Time_24hr":             "Time 24hr",
    "Time_12hr":             "Time 12hr",
    "Time_ISO":              "Time ISO",
    "Time_Hour_12hr":        "Time Hour 12hr",
    "Time_Hour_24hr":        "Time Hour 24hr",
    "Time_Minutes":          "Time Minutes",
    "Time_Seconds":          "Time Seconds",

    # ── Markers ──────────────────────────────────────────────────────────────
    "Marker_Name":           "Marker Name",
    "Marker_Notes":          "Marker Notes",
    "Marker_Keywords":       "Marker Keywords",

    # ── Status flags ─────────────────────────────────────────────────────────
    "Graded":                "Graded",
    "Modified":              "Modified",
    "Unrendered":            "Unrendered",
    "HDR_Graded":            "HDR Graded",
    "Proxy_Clip":            "Proxy Clip",
}

# ── FieldsBlob codec ─────────────────────────────────────────────────────────
#
# Binary format (all big-endian):
#   uint32  version     (always 1)
#   uint32  field_count
#   Per field:
#     uint32  name_byte_len
#     bytes   name (UTF-16 BE)
#     5 bytes separator  (00 00 00 87 00)
#     float64 value
#
# Known field names: "TextOpacity", "FontSize" (= pt / 1080)

_BLOB_SEP = b"\x00\x00\x00\x87\x00"


def decode_fields_blob(blob_hex: str) -> dict:
    """Decode a FieldsBlob hex string → dict of field name → float."""
    if not blob_hex or not blob_hex.strip():
        return {}
    try:
        data = bytes.fromhex(blob_hex.strip())
    except ValueError:
        return {}
    if len(data) < 8:
        return {}

    field_count = struct.unpack_from(">I", data, 4)[0]
    offset = 8
    result = {}

    for _ in range(field_count):
        if offset + 4 > len(data):
            break
        name_len = struct.unpack_from(">I", data, offset)[0]
        offset += 4

        if offset + name_len > len(data):
            break
        try:
            name = data[offset: offset + name_len].decode("utf-16-be")
        except Exception:
            name = ""
        offset += name_len

        # Skip 5-byte separator
        offset += 5

        if offset + 8 > len(data):
            break
        value = struct.unpack_from(">d", data, offset)[0]
        offset += 8

        if name:
            result[name] = value

    return result


def encode_fields_blob(fields: dict) -> str:
    """Encode a dict of field name → float → FieldsBlob hex string."""
    data = bytearray()
    data += struct.pack(">I", 1)              # version
    data += struct.pack(">I", len(fields))    # field count
    for name, value in fields.items():
        name_bytes = name.encode("utf-16-be")
        data += struct.pack(">I", len(name_bytes))
        data += name_bytes
        data += _BLOB_SEP
        data += struct.pack(">d", float(value))
    return data.hex()


# ── Preset helpers ────────────────────────────────────────────────────────────

def parse_slate_presets():
    """Parse SlatePresetList.xml → list of preset dicts."""
    if not os.path.exists(XML_PATH):
        return []

    tree = ET.parse(XML_PATH)
    root = tree.getroot()
    presets = []

    for elem in root.findall("PresetList/Element"):
        name = (elem.findtext("DbKey") or "").strip()
        if not name:
            continue

        items = []
        for fri in elem.findall(".//FontRenderItem"):
            text       = (fri.findtext("Text")     or "").strip()
            font_desc  = fri.findtext("FontDesc")   or ""
            type_val   = int(fri.findtext("Type")   or "0")
            x          = float(fri.findtext("X")    or "0.5")
            y          = float(fri.findtext("Y")    or "0.5")
            horz_align = int(fri.findtext("HorzAlign") or "1")

            fg_els  = fri.findall("ForegroundColor/Element")
            fg_color = [float(c.text or "1") for c in fg_els] if fg_els else [1.0, 1.0, 1.0]

            # Decode FieldsBlob to get real text opacity.
            # <Opacity> = background-box opacity (independent from text opacity).
            # When TextOpacity is absent from the blob, default to 1.0 (fully visible).
            blob_hex    = (fri.findtext("FieldsBlob") or "").strip()
            blob_fields = decode_fields_blob(blob_hex)
            if "TextOpacity" in blob_fields:
                text_opacity = max(0.0, min(1.0, blob_fields["TextOpacity"]))
            else:
                text_opacity = 1.0

            # FontDesc: "Open Sans,-1,48,5,50,0,0,0,0,0"
            fd = font_desc.split(",")
            font_family = fd[0].strip() if fd else "Arial"
            try:
                font_size = int(fd[2]) if len(fd) > 2 else 24
            except (ValueError, IndexError):
                font_size = 24
            try:
                font_weight = "bold" if len(fd) > 4 and int(fd[4]) >= 75 else "normal"
            except (ValueError, IndexError):
                font_weight = "normal"

            items.append({
                "text":       text,
                "type":       type_val,
                "type_label": _RESOLVE_TYPE_LABELS.get(type_val, f"Type {type_val}"),
                "font_family": font_family,
                "font_size":   font_size,
                "font_weight": font_weight,
                "x":           x,
                "y":           y,
                "opacity":     text_opacity,
                "horz_align":  horz_align,
                "fg_color":    fg_color,
            })

        presets.append({"name": name, "elements": items})

    return presets


# ── Export preset → Resolve XML ───────────────────────────────────────────────

def _our_template_to_resolve(template: str) -> str:
    """Convert '%Scene / %Shot' → '%{Scene} / %{Shot}'."""
    def replace(m):
        key = m.group(1)
        resolve_name = _OUR_TO_RESOLVE_TOKENS.get(key, key.replace("_", " "))
        return f"%{{{resolve_name}}}"
    return re.sub(r"%([A-Za-z0-9#](?:[A-Za-z0-9_#]*[A-Za-z0-9#])?)", replace, template)


def _hex_color_to_rgb_list(hex_color: str) -> list:
    h = hex_color.lstrip("#")
    if len(h) != 6:
        return [1.0, 1.0, 1.0]
    return [int(h[i:i+2], 16) / 255.0 for i in (0, 2, 4)]


def _align_to_horz(align: str) -> int:
    return {"left": 0, "center": 1, "right": 2}.get(align, 1)


def _fmt_float(v: float) -> str:
    """Format a float without trailing .0 for whole numbers (matches Resolve XML style)."""
    if v == int(v):
        return str(int(v))
    return repr(v)


def export_preset_to_xml(preset_name: str) -> str:
    """
    Generate a Resolve-compatible FontRenderItemVec XML from burnin_web_settings.json.
    Returns the XML string.
    """
    if not os.path.exists(JSON_PATH):
        raise FileNotFoundError("burnin_web_settings.json not found")

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        settings = json.load(f)

    elements = settings.get("elements", [])

    vec_id = str(uuid.uuid4())

    # Build XML manually (ET doesn't preserve <?xml ... ?> cleanly)
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<!--DbAppVer="20.3.0.0010" DbPrjVer="15"-->',
        f'<FontRenderItemVec DbId="{vec_id}">',
        ' <FieldsBlob/>',
        ' <InheritedCollection>',
    ]

    custom_text_count = 0   # tracks 128 / 129 / 130 slot usage
    for el in elements:
        key       = el.get("key", "custom")
        opacity    = float(el.get("opacity", 1.0))
        bg_opacity = float(el.get("bg_opacity", 0.0))
        font_size  = int(el.get("font_size_pt", 24))
        font_fam  = el.get("font_family", "Arial")
        font_wt   = 75 if el.get("font_weight") == "bold" else 50
        x         = float(el.get("x", 0.5))
        y         = float(el.get("y", 0.5))
        align     = _align_to_horz(el.get("align", "center"))
        color     = el.get("color", "#ffffff")
        rgb       = _hex_color_to_rgb_list(color)
        font_desc = f"{font_fam},-1,{font_size},5,{font_wt},0,0,0,0,0"
        item_id   = str(uuid.uuid4())

        # Determine Resolve type code and text content
        resolve_type = _OUR_KEY_TO_RESOLVE_TYPE.get(key)

        # All elements encode both TextOpacity and FontSize in the blob,
        # matching Resolve's own XML output format for all element types.
        # Resolve computes FontSize as a float32 division then stores as float64,
        # so we replicate that to get bit-identical blobs.
        font_size_norm = struct.unpack(">f", struct.pack(">f", font_size / 1080.0))[0]
        blob_hex = encode_fields_blob({
            "TextOpacity": opacity,
            "FontSize":    font_size_norm,
        })

        if key == "custom" or resolve_type is None:
            # Custom text: cycle Type 128 → 129 → 130 (Resolve limit: 3 slots)
            if custom_text_count >= 3:
                continue   # silently skip; caller should have warned the user
            resolve_type = 128 + custom_text_count
            custom_text_count += 1
            if key == "custom":
                raw_tpl = el.get("template_custom", "")
            else:
                resolve_name = _OUR_TO_RESOLVE_TOKENS.get(key, key.replace("_", " "))
                raw_tpl = f"%{{{resolve_name}}}"
            text = _our_template_to_resolve(raw_tpl)
        else:
            # Auto-fill type: empty text, Resolve fills the value automatically
            text = ""

        lines += [
            '  <Element>',
            f'   <FontRenderItem DbId="{item_id}">',
            f'    <FieldsBlob>{blob_hex}</FieldsBlob>',
            f'    <Text>{text}</Text>',
            f'    <FontDesc>{font_desc}</FontDesc>',
            f'    <Type>{resolve_type}</Type>',
            f'    <X>{_fmt_float(x)}</X>',
            f'    <Y>{_fmt_float(y)}</Y>',
            '    <ForegroundColor>',
        ]
        for ch in rgb:
            lines.append(f'     <Element>{_fmt_float(ch)}</Element>')
        lines += [
            '    </ForegroundColor>',
            '    <BackgroundColor>',
            '     <Element>0</Element>',
            '     <Element>0</Element>',
            '     <Element>0</Element>',
            '    </BackgroundColor>',
            f'    <Opacity>{_fmt_float(bg_opacity)}</Opacity>',
            f'    <HorzAlign>{align}</HorzAlign>',
            '    <IsFadeUp>false</IsFadeUp>',
            '    <FadeUp>0</FadeUp>',
            '    <IsFadeDown>false</IsFadeDown>',
            '    <FadeDown>0</FadeDown>',
            '    <Logo/>',
            '    <IsRenderTextPrefixed>true</IsRenderTextPrefixed>',
            '   </FontRenderItem>',
            '  </Element>',
        ]

    lines += [
        ' </InheritedCollection>',
        '</FontRenderItemVec>',
    ]

    return "\n".join(lines) + "\n"


def send_preset_to_resolve(preset_name: str) -> None:
    """Write current burnin settings as a new/replaced preset into SlatePresetList.xml."""
    if not os.path.exists(XML_PATH):
        raise FileNotFoundError(f"SlatePresetList.xml not found: {XML_PATH}")
    if not os.path.exists(JSON_PATH):
        raise FileNotFoundError("burnin_web_settings.json not found")

    with open(JSON_PATH, "r", encoding="utf-8") as f:
        settings = json.load(f)
    elements = settings.get("elements", [])

    vec_id = str(uuid.uuid4())
    vec_el = ET.Element("FontRenderItemVec")
    vec_el.set("DbId", vec_id)
    ET.SubElement(vec_el, "FieldsBlob")
    inherited_el = ET.SubElement(vec_el, "InheritedCollection")

    custom_text_count = 0
    for el in elements:
        key        = el.get("key", "custom")
        opacity    = float(el.get("opacity", 1.0))
        bg_opacity = float(el.get("bg_opacity", 0.0))
        font_size  = int(el.get("font_size_pt", 24))
        font_fam   = el.get("font_family", "Arial")
        font_wt    = 75 if el.get("font_weight") == "bold" else 50
        x          = float(el.get("x", 0.5))
        y          = float(el.get("y", 0.5))
        align      = _align_to_horz(el.get("align", "center"))
        color      = el.get("color", "#ffffff")
        rgb        = _hex_color_to_rgb_list(color)
        font_desc  = f"{font_fam},-1,{font_size},5,{font_wt},0,0,0,0,0"
        item_id    = str(uuid.uuid4())

        font_size_norm = struct.unpack(">f", struct.pack(">f", font_size / 1080.0))[0]
        blob_hex = encode_fields_blob({
            "TextOpacity": opacity,
            "FontSize":    font_size_norm,
        })

        resolve_type = _OUR_KEY_TO_RESOLVE_TYPE.get(key)
        if key == "custom" or resolve_type is None:
            if custom_text_count >= 3:
                continue
            resolve_type = 128 + custom_text_count
            custom_text_count += 1
            if key == "custom":
                raw_tpl = el.get("template_custom", "")
            else:
                resolve_name = _OUR_TO_RESOLVE_TOKENS.get(key, key.replace("_", " "))
                raw_tpl = f"%{{{resolve_name}}}"
            text = _our_template_to_resolve(raw_tpl)
        else:
            text = ""

        wrapper = ET.SubElement(inherited_el, "Element")
        fri = ET.SubElement(wrapper, "FontRenderItem")
        fri.set("DbId", item_id)
        ET.SubElement(fri, "FieldsBlob").text = blob_hex
        ET.SubElement(fri, "Text").text = text
        ET.SubElement(fri, "FontDesc").text = font_desc
        ET.SubElement(fri, "Type").text = str(resolve_type)
        ET.SubElement(fri, "X").text = _fmt_float(x)
        ET.SubElement(fri, "Y").text = _fmt_float(y)
        fg = ET.SubElement(fri, "ForegroundColor")
        for ch in rgb:
            ET.SubElement(fg, "Element").text = _fmt_float(ch)
        bg = ET.SubElement(fri, "BackgroundColor")
        for _ in range(3):
            ET.SubElement(bg, "Element").text = "0"
        ET.SubElement(fri, "Opacity").text = _fmt_float(bg_opacity)
        ET.SubElement(fri, "HorzAlign").text = str(align)
        ET.SubElement(fri, "IsFadeUp").text = "false"
        ET.SubElement(fri, "FadeUp").text = "0"
        ET.SubElement(fri, "IsFadeDown").text = "false"
        ET.SubElement(fri, "FadeDown").text = "0"
        ET.SubElement(fri, "Logo")
        ET.SubElement(fri, "IsRenderTextPrefixed").text = "true"

    tree = ET.parse(XML_PATH)
    root = tree.getroot()

    preset_list = root.find("PresetList")
    if preset_list is None:
        preset_list = ET.SubElement(root, "PresetList")

    for existing in list(preset_list.findall("Element")):
        if (existing.findtext("DbKey") or "").strip() == preset_name:
            preset_list.remove(existing)

    new_el = ET.SubElement(preset_list, "Element")
    ET.SubElement(new_el, "DbKey").text = preset_name
    db_val = ET.SubElement(new_el, "DbVal")
    db_val.append(vec_el)

    tmp_path = XML_PATH + ".tmp"
    tree.write(tmp_path, xml_declaration=True, encoding="UTF-8")
    os.replace(tmp_path, XML_PATH)


# ── Server utilities ──────────────────────────────────────────────────────────

def _safe_float(v, default):
    try:
        return float(v)
    except Exception:
        return default

def _safe_int(v, default):
    try:
        return int(float(v))
    except Exception:
        return default


def sanitize_payload(data: dict) -> dict:
    """\
    Keep only the structure expected by the burnin engine, while supporting
    the new web UI fields.

    Final structure:
    {
      "burnin_font_path": str,
      "burnin_opacity": float,
      "burnin_font_family": str,

      # Preview / ratio & mask (saved so the web UI keeps state)
      "preview": {
        "ratio": float,                 # e.g. 1.77
        "mode": "crop"|"fit",          # crop ratio vs fit inside ratio
        "mask_style": "bars"|"lines"|"bars_lines",
        "mask_opacity": float,
        "safe_guides": {
          "enabled": bool,
          "style": "bars"|"lines"|"bars_lines",
          "opacity": float
        }
      },

      "elements": [
        {
          "id": str,                    # stable id from UI (optional)
          "key": str,
          "x": float,                   # 0..1
          "y": float,                   # 0..1
          "font_size_pt": int,
          "opacity": float,             # 0..1
          "align": "left"|"center"|"right",
          "font_family": str,
          "font_weight": "normal"|"bold",
          "color": str,                 # hex like #ffffff

          # if key == "custom"
          "template_custom": str,
          "template_parts": {"parts": [...]},
          "custom_tokens": ["Scene", "Shot", ...]
        }
      ]
    }
    """

    out: dict = {}

    # ---- global settings ----
    out["burnin_font_path"]   = str(data.get("burnin_font_path", "")).strip()
    out["burnin_opacity"]     = max(0.0, min(1.0, _safe_float(data.get("burnin_opacity", 1.0), 1.0)))
    out["burnin_font_family"] = str(data.get("burnin_font_family", "Arial")).strip() or "Arial"

    # ---- preview state (ratio / mask / guides) ----
    preview_in = data.get("preview") if isinstance(data.get("preview"), dict) else {}

    ratio = _safe_float(preview_in.get("ratio", data.get("ratio", 1.77)), 1.77)
    allowed_ratios = {1.33, 1.66, 1.77, 1.85, 2.00, 2.35, 2.39, 2.40}
    ratio = ratio if ratio in allowed_ratios else 1.77

    mode = str(preview_in.get("mode", data.get("ratio_mode", "crop"))).strip().lower()
    if mode not in {"crop", "fit"}:
        mode = "crop"

    mask_style = str(preview_in.get("mask_style", data.get("mask_style", "bars"))).strip().lower()
    if mask_style not in {"bars", "lines", "bars_lines"}:
        mask_style = "bars"

    mask_opacity = max(0.0, min(1.0, _safe_float(preview_in.get("mask_opacity", data.get("mask_opacity", 1.0)), 1.0)))

    safe_in      = preview_in.get("safe_guides") if isinstance(preview_in.get("safe_guides"), dict) else {}
    safe_enabled = bool(safe_in.get("enabled", data.get("safe_guides", False)))
    safe_style   = str(safe_in.get("style", data.get("safe_guides_style", "lines"))).strip().lower()
    if safe_style not in {"bars", "lines", "bars_lines"}:
        safe_style = "lines"
    safe_opacity = max(0.0, min(1.0, _safe_float(safe_in.get("opacity", data.get("safe_guides_opacity", 1.0)), 1.0)))

    out["preview"] = {
        "ratio":       ratio,
        "mode":        mode,
        "mask_style":  mask_style,
        "mask_opacity": mask_opacity,
        "safe_guides": {
            "enabled": safe_enabled,
            "style":   safe_style,
            "opacity": safe_opacity,
        },
    }

    # ---- open gate crop ----
    _ogc_presets = {"arri_alexa35", "arri_alexalf", "sony_venice1", "sony_venice2", "custom"}
    ogc_in      = data.get("open_gate_crop") if isinstance(data.get("open_gate_crop"), dict) else {}
    ogc_preset  = str(ogc_in.get("preset", "arri_alexa35")).strip().lower()
    if ogc_preset not in _ogc_presets:
        ogc_preset = "arri_alexa35"
    out["open_gate_crop"] = {
        "preset":   ogc_preset,
        "custom_w": max(1, min(20000, _safe_int(ogc_in.get("custom_w", 3), 3))),
        "custom_h": max(1, min(20000, _safe_int(ogc_in.get("custom_h", 2), 2))),
        "safety":   max(50.0, min(100.0, _safe_float(ogc_in.get("safety", 100.0), 100.0))),
    }

    # ---- still naming ----
    raw_naming = data.get("still_naming", "")
    out["still_naming"] = str(raw_naming).strip() if isinstance(raw_naming, str) else ""

    # ---- elements ----
    elements_in  = data.get("elements", [])
    elements_out = []

    if isinstance(elements_in, list):
        for el in elements_in:
            if not isinstance(el, dict):
                continue

            key = str(el.get("key", "")).strip()
            if not key:
                continue

            element_id = str(el.get("id", "")).strip()

            element = {
                "id":           element_id,
                "key":          key,
                "x":            max(0.0, min(1.0, _safe_float(el.get("x", 0.5), 0.5))),
                "y":            max(0.0, min(1.0, _safe_float(el.get("y", 0.5), 0.5))),
                "font_size_pt": max(4, min(400, _safe_int(el.get("font_size_pt", 24), 24))),
                "opacity":      max(0.0, min(1.0, _safe_float(el.get("opacity", 1.0), 1.0))),
                "align":        str(el.get("align", "center")).lower(),
                "font_family":  str(el.get("font_family", out["burnin_font_family"])).strip() or out["burnin_font_family"],
                "font_weight":  str(el.get("font_weight", "normal")).lower(),
            }

            if element["align"] not in ["left", "center", "right"]:
                element["align"] = "center"
            if element["font_weight"] not in ["normal", "bold"]:
                element["font_weight"] = "normal"

            raw_color      = el.get("color", el.get("text_color", el.get("font_color", "#ffffff")))
            element["color"] = str(raw_color).strip() or "#ffffff"
            element["bg_opacity"] = max(0.0, min(1.0, _safe_float(el.get("bg_opacity", 0.0), 0.0)))

            if key == "custom":
                element["template_custom"] = str(el.get("template_custom", "")).strip()

                template_parts = el.get("template_parts")
                if isinstance(template_parts, dict) and isinstance(template_parts.get("parts"), list):
                    element["template_parts"] = {
                        "parts": [
                            {
                                "type":  str(p.get("type", "")).strip(),
                                "value": str(p.get("value", "")),
                            }
                            for p in template_parts.get("parts", [])
                            if isinstance(p, dict)
                        ]
                    }
                else:
                    element["template_parts"] = {"parts": []}

                custom_tokens = el.get("custom_tokens")
                if isinstance(custom_tokens, list):
                    element["custom_tokens"] = [str(t) for t in custom_tokens]
                else:
                    element["custom_tokens"] = []

            elements_out.append(element)

    out["elements"] = elements_out
    return out


# ── HTTP Handler ──────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        raw = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def _send_xml_download(self, filename: str, xml_content: str):
        raw = xml_content.encode("utf-8")
        safe_name = filename.replace('"', '_')
        self.send_response(200)
        self.send_header("Content-Type", "application/xml; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Content-Disposition", f'attachment; filename="{safe_name}"')
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path

        if path == "/load":
            if os.path.exists(JSON_PATH):
                try:
                    with open(JSON_PATH, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    self._send(200, {"ok": True, "data": data})
                    return
                except Exception as e:
                    self._send(500, {"ok": False, "error": str(e)})
                    return
            self._send(200, {"ok": True, "data": {}})

        elif path == "/presets":
            try:
                presets = parse_slate_presets()
                self._send(200, {"ok": True, "presets": presets, "xml_path": XML_PATH})
            except Exception as e:
                self._send(500, {"ok": False, "error": str(e)})

        elif path == "/export_preset":
            try:
                qs   = parse_qs(parsed.query)
                name = qs.get("name", ["My Preset"])[0].strip() or "My Preset"
                xml  = export_preset_to_xml(name)
                # Filename: "<name> Burn In.xml" — matches Resolve's own naming convention
                filename = f"{name} Burn In.xml"
                self._send_xml_download(filename, xml)
            except FileNotFoundError as e:
                self._send(404, {"ok": False, "error": str(e)})
            except Exception as e:
                self._send(500, {"ok": False, "error": str(e)})

        else:
            self._send(404, {"ok": False, "error": "Not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        path   = parsed.path

        if path == "/save":
            try:
                length  = int(self.headers.get("Content-Length", "0"))
                raw     = self.rfile.read(length).decode("utf-8")
                payload = json.loads(raw) if raw else {}
                data    = sanitize_payload(payload)

                tmp_path = JSON_PATH + ".tmp"
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                os.replace(tmp_path, JSON_PATH)

                self._send(200, {"ok": True, "path": JSON_PATH})
            except Exception as e:
                self._send(500, {"ok": False, "error": str(e)})

        elif path == "/send_to_resolve":
            try:
                qs   = parse_qs(parsed.query)
                name = qs.get("name", ["My Preset"])[0].strip() or "My Preset"
                send_preset_to_resolve(name)
                self._send(200, {"ok": True, "message": f"Preset '{name}' written to Resolve"})
            except FileNotFoundError as e:
                self._send(404, {"ok": False, "error": str(e)})
            except Exception as e:
                self._send(500, {"ok": False, "error": str(e)})

        else:
            self._send(404, {"ok": False, "error": "Not found"})

    def log_message(self, format, *args):  # noqa: A002
        # Suppress default per-request console noise; keep errors
        pass


def main():
    host = "127.0.0.1"
    port = 8765
    httpd = HTTPServer((host, port), Handler)
    print(f"Burnin JSON server on http://{host}:{port}")
    print(f"Writing: {JSON_PATH}")

    ui_path = os.path.join(BASE_DIR, "burnin_ui", "index.html")
    url = f"file://{ui_path}"
    threading.Timer(0.5, webbrowser.open, args=[url]).start()

    httpd.serve_forever()


if __name__ == "__main__":
    main()