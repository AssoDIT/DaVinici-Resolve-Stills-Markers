#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SETTINGS_DIR = BASE_DIR  # Stills_Marker_python_settings
JSON_PATH = os.path.join(SETTINGS_DIR, "burnin_web_settings.json")

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
    out["burnin_font_path"] = str(data.get("burnin_font_path", "")).strip()
    out["burnin_opacity"] = max(0.0, min(1.0, _safe_float(data.get("burnin_opacity", 1.0), 1.0)))
    out["burnin_font_family"] = str(data.get("burnin_font_family", "Arial")).strip() or "Arial"

    # ---- preview state (ratio / mask / guides) ----
    preview_in = data.get("preview") if isinstance(data.get("preview"), dict) else {}

    ratio = _safe_float(preview_in.get("ratio", data.get("ratio", 1.77)), 1.77)
    # Allow only the listed ratios. If unknown, fallback to 1.77.
    allowed_ratios = {1.33, 1.66, 1.77, 1.85, 2.00, 2.35, 2.39, 2.40}
    ratio = ratio if ratio in allowed_ratios else 1.77

    mode = str(preview_in.get("mode", data.get("ratio_mode", "crop"))).strip().lower()
    if mode not in {"crop", "fit"}:
        mode = "crop"

    mask_style = str(preview_in.get("mask_style", data.get("mask_style", "bars"))).strip().lower()
    if mask_style not in {"bars", "lines", "bars_lines"}:
        mask_style = "bars"

    mask_opacity = max(0.0, min(1.0, _safe_float(preview_in.get("mask_opacity", data.get("mask_opacity", 1.0)), 1.0)))

    safe_in = preview_in.get("safe_guides") if isinstance(preview_in.get("safe_guides"), dict) else {}
    safe_enabled = bool(safe_in.get("enabled", data.get("safe_guides", False)))
    safe_style = str(safe_in.get("style", data.get("safe_guides_style", "lines"))).strip().lower()
    if safe_style not in {"bars", "lines", "bars_lines"}:
        safe_style = "lines"
    safe_opacity = max(0.0, min(1.0, _safe_float(safe_in.get("opacity", data.get("safe_guides_opacity", 1.0)), 1.0)))

    out["preview"] = {
        "ratio": ratio,
        "mode": mode,
        "mask_style": mask_style,
        "mask_opacity": mask_opacity,
        "safe_guides": {
            "enabled": safe_enabled,
            "style": safe_style,
            "opacity": safe_opacity,
        },
    }

    # ---- elements ----
    elements_in = data.get("elements", [])
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
                "id": element_id,
                "key": key,
                "x": max(0.0, min(1.0, _safe_float(el.get("x", 0.5), 0.5))),
                "y": max(0.0, min(1.0, _safe_float(el.get("y", 0.5), 0.5))),
                "font_size_pt": max(4, min(400, _safe_int(el.get("font_size_pt", 24), 24))),
                "opacity": max(0.0, min(1.0, _safe_float(el.get("opacity", 1.0), 1.0))),
                "align": str(el.get("align", "center")).lower(),
                "font_family": str(el.get("font_family", out["burnin_font_family"])).strip() or out["burnin_font_family"],
                "font_weight": str(el.get("font_weight", "normal")).lower(),
            }

            if element["align"] not in ["left", "center", "right"]:
                element["align"] = "center"
            if element["font_weight"] not in ["normal", "bold"]:
                element["font_weight"] = "normal"

            # Support multiple UI field names for text color
            raw_color = el.get("color", el.get("text_color", el.get("font_color", "#ffffff")))
            element_color = str(raw_color).strip() or "#ffffff"
            element["color"] = element_color

            # --- Custom support: preserve structured custom element ---
            if key == "custom":
                # Preserve raw template string
                element["template_custom"] = str(el.get("template_custom", "")).strip()

                # Preserve template_parts exactly as provided if structurally valid
                template_parts = el.get("template_parts")
                if isinstance(template_parts, dict) and isinstance(template_parts.get("parts"), list):
                    element["template_parts"] = {
                        "parts": [
                            {
                                "type": str(p.get("type", "")).strip(),
                                # Preserve value exactly (no strip to keep spaces)
                                "value": str(p.get("value", "")),
                            }
                            for p in template_parts.get("parts", [])
                            if isinstance(p, dict)
                        ]
                    }
                else:
                    element["template_parts"] = {"parts": []}

                # Preserve custom_tokens exactly (no filtering logic)
                custom_tokens = el.get("custom_tokens")
                if isinstance(custom_tokens, list):
                    element["custom_tokens"] = [str(t) for t in custom_tokens]
                else:
                    element["custom_tokens"] = []

            elements_out.append(element)

    out["elements"] = elements_out
    return out

class Handler(BaseHTTPRequestHandler):
    def _send(self, code: int, body: dict):
        raw = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
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
        if self.path != "/load":
            self._send(404, {"ok": False, "error": "Not found"})
            return

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

    def do_POST(self):
        if self.path != "/save":
            self._send(404, {"ok": False, "error": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length).decode("utf-8")
            payload = json.loads(raw) if raw else {}
            data = sanitize_payload(payload)

            tmp_path = JSON_PATH + ".tmp"
            with open(tmp_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            os.replace(tmp_path, JSON_PATH)

            self._send(200, {"ok": True, "path": JSON_PATH})
        except Exception as e:
            self._send(500, {"ok": False, "error": str(e)})

def main():
    host = "127.0.0.1"
    port = 8765
    httpd = HTTPServer((host, port), Handler)
    print(f"Burnin JSON server on http://{host}:{port}")
    print(f"Writing: {JSON_PATH}")
    httpd.serve_forever()

if __name__ == "__main__":
    main()