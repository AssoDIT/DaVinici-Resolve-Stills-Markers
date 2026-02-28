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
    """
    Conserve uniquement la structure attendue pour le moteur burnin.
    Structure finale :
    {
      "burnin_font_path": str,
      "burnin_opacity": float,
      "burnin_font_family": str,
      "elements": [
         {
           "key": str,
           "x": float,
           "y": float,
           "font_size_pt": int,
           "opacity": float,
           "align": "left"|"center"|"right",
           "font_family": str,
           "font_weight": "normal"|"bold",
           "color": str,
           # if key == "custom"
           "template_custom": str,
           "template_parts": dict,
           "custom_tokens": list[str]
         }
      ]
    }
    """
    out = {}

    out["burnin_font_path"] = str(data.get("burnin_font_path", "")).strip()
    out["burnin_opacity"] = max(0.0, min(1.0, _safe_float(data.get("burnin_opacity", 1.0), 1.0)))
    out["burnin_font_family"] = str(data.get("burnin_font_family", "Arial")).strip()

    elements_in = data.get("elements", [])
    elements_out = []

    if isinstance(elements_in, list):
        for el in elements_in:
            if not isinstance(el, dict):
                continue

            key = str(el.get("key", "")).strip()
            if not key:
                continue

            element = {
                "key": key,
                "x": max(0.0, min(1.0, _safe_float(el.get("x", 0.5), 0.5))),
                "y": max(0.0, min(1.0, _safe_float(el.get("y", 0.5), 0.5))),
                "font_size_pt": max(4, min(400, _safe_int(el.get("font_size_pt", 24), 24))),
                "opacity": max(0.0, min(1.0, _safe_float(el.get("opacity", 1.0), 1.0))),
                "align": str(el.get("align", "center")).lower(),
                "font_family": str(el.get("font_family", out["burnin_font_family"])).strip(),
                "font_weight": str(el.get("font_weight", "normal")).lower()
            }

            # Support both "color" and legacy "font_color"
            raw_color = el.get("color", el.get("font_color", "#ffffff"))
            element_color = str(raw_color).strip()
            if not element_color:
                element_color = "#ffffff"
            element["color"] = element_color

            if element["align"] not in ["left", "center", "right"]:
                element["align"] = "center"

            if element["font_weight"] not in ["normal", "bold"]:
                element["font_weight"] = "normal"

            # --- Custom support (preserve structured custom element) ---
            if key == "custom":
                element["template_custom"] = str(el.get("template_custom", "")).strip()

                template_parts = el.get("template_parts")
                if isinstance(template_parts, dict) and isinstance(template_parts.get("parts"), list):
                    element["template_parts"] = {
                        "parts": template_parts.get("parts")
                    }
                else:
                    element["template_parts"] = {"parts": []}

                custom_tokens = el.get("custom_tokens")
                if isinstance(custom_tokens, list):
                    element["custom_tokens"] = [str(t).strip() for t in custom_tokens if str(t).strip()]
                else:
                    element["custom_tokens"] = []

                elements_out.append(element)
                continue

            # Normal element
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