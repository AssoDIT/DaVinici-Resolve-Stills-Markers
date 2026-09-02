# CLAUDE.md — DaVinci Resolve Stills Markers

## Ce que fait ce plugin

Script Python pour DaVinci Resolve (Workflow Integration Plugin) qui :
- Grab des stills depuis les markers d'une timeline ou des clips
- Exporte les stills sur disque avec renommage, resize, burnins, crop, tag couleur sRGB
- Génère des JSON de métadonnées pour chaque marker/still
- Exporte les markers en EDL
- Déplace/renomme les markers

## Architecture des fichiers

```
Stills_Markers_python.py          ← script principal (3593 lignes)
Stills_Marker_python_settings/
  settings.json                   ← settings persistés entre les runs
  burnin_web_settings.json        ← config burnin générée par le serveur web
  server_save_burnin_json.py      ← serveur HTTP pour l'UI burnin web
  icc/
    ITU-RBT709ReferenceDisplay.icc            ← profil source (Rec.709 Reference Display)
    sRGB_v4_ICC_preference_displayclass.icc   ← profil destination (sRGB v4 preference, display class)
  burnin_ui/
    index.html / app.js / styles.css  ← UI web pour configurer les burnins
```

## Structure du script principal

| Plage approx. | Contenu |
|---|---|
| 1–170 | Classe SMPTE (timecode converter) |
| 177–230 | `load_settings_from_json` / `save_settings_to_json` |
| 230–275 | Helpers : delete_metadata_json, load_burnin_web_settings |
| 275–335 | `change_page` / `restore_page` / timecode helpers |
| 335–465 | `create_new_filename`, `resize_image`, `fit_image_into_black_canvas` |
| 468–520 | **`apply_srgb_icc_tag`** — conversion ICC Rec.709 → sRGB v4 (voir section dédiée) |
| 570–720 | Fonctions de crop : vertical 9:16, open gate, native ratio |
| 720–870 | Helpers timeline : markers, resolution, médiapool |
| 870–903 | **`dict_settings`** — toutes les clés de settings avec leurs valeurs par défaut |
| 904–1213 | `export_markers_to_edl` + fonctions burnin |
| 1213–1942 | `burnin_from_web_json` — burnin générique piloté par JSON |
| 1942–2940 | **`create_window`** — UI complète (dispatcher Fusion) |
| 2940–3120 | Init Resolve : project, gallery, timeline, markers |
| 3120–3284 | **Boucle principale** : grab, metadata, export, crop, burnin, resize, tag sRGB, rename |
| 3284–3593 | Post-boucle : rename markers, move markers, EDL, JSON, DRX cleanup, Finder, ImageOptim |

## UI — layout actuel (638 × 510 px)

```
[MarkerSource combo] [Color label] [Color combo] [Restrict to In/Out]
[InfoLabel]
────────────────────────────────────────────────────────────
[Rename with metadata] [Style] [EU/US combo]
  └─ [parse Shot from Scene] [Scene separator] [input]
────────────────────────────────────────────────────────────
[Export EDL markers] [Rename markers] [Move to clips] [Move to timeline]
────────────────────────────────────────────────────────────
[Export grabbed stills] [Use active album] [Skip still grab] [Format] [combo]
  └─ ExportSettings (enabled si export=True) :
       [path LineEdit] [Browse]
       [Create Folder with timeline name] [Create sub folder:] [input]
       [Replace stills] [Resize stills in %] [input] [%] [Remove DRX files] [Tag sRGB (Rec.709 match)]
       [Fit to FHD canvas] [Burnins] [compress combo]
[Open destination folder]
────────────────────────────────────────────────────────────
[Framelines Crop]
────────────────────────────────────────────────────────────
                              [Cancel] [Start]
```

## Clés de dict_settings (toutes persistées dans settings.json)

```python
markers                         # "Any" ou nom de couleur
export                          # bool — exporter les stills sur disque
export_to                       # str — chemin de base
format                          # "jpg"|"png"|"tif"|"dpx"|...
resize_stills / resize_percentage
rename_with_meta
restrict_to_in_out
remove_drx
create_export_folder_timeline_name   # crée un dossier nommé par la timeline SUR DISQUE
create_sub_folder / sub_folder_name
open_gate_crop                  # "Framelines Crop" checkbox
compress / compress_mode        # "none"|"background"|"app" (ImageOptim)
marker_source                   # "timeline"|"clip"|"both"
export_edl_markers
rename_timeline_markers
move_markers_to_clips / move_markers_to_timeline
rename_format_style / rename_fallback_shot_from_scene / rename_scene_shot_separator
burnin / fit_to_1920_canvas
tag_srgb                        # "Tag sRGB (Rec.709 match)" checkbox — voir section dédiée
open_destination_folder
replace_stills
skip_grab                       # ne grab pas, exécute seulement JSON/EDL/rename
use_active_gallery_album        # utilise l'album gallery actif au lieu de créer/trouver un album au nom de la timeline
```

## Points importants et comportements non-évidents

### Gallery album
- Par défaut, le script cherche ou crée un album Resolve nommé d'après la timeline.
- `use_active_gallery_album=True` → utilise l'album courant, aucun album créé.
- La création de l'album est **différée** au clic Start pour éviter les albums orphelins.
- `GrabStill()` nécessite que le panneau Gallery soit visible dans la page Color (pas LUT, pas Media Pool). Si ça échoue, une alerte guide l'utilisateur.
- L'API Resolve n'expose pas de méthode pour switcher les panneaux internes de la page Color → on tente `gallery.SetCurrentStillAlbum()` avant la boucle et on affiche une alerte explicite si `GrabStill()` retourne `False`.

### skip_grab + relink JSON
- Quand `skip_grab=True`, aucun still n'est grabé, mais les métadonnées sont collectées pour chaque frame de marker.
- Le relink cherche les stills existants dans `output_path` par nom : d'abord via le template `still_naming` (burnin web settings), puis via le label `rename_with_meta`.
- `exported_filename` dans le JSON est peuplé si un fichier correspondant est trouvé.

### still_naming template
- Défini dans `burnin_web_settings.json` (clé `"still_naming"`).
- Tokens : `%Scene %Shot %Take %Camera_# %Clipname %Timeline %Reel_Name %Date %FPS %Resolution %Source_TC %Frame %Clip_#`
- Utilisé pour : label gallery, renommage fichier sur disque, relink skip_grab, marqueurs renommés, EDL.

### Framelines Crop (open_gate_crop)
- 3 orientations selon `burnin_web_settings.json["frameline_orientation"]` :
  - `"horizontal_16_9"` → `apply_open_gate_crop()` — extract 16:9 d'une image open gate
  - `"vertical_9_16"` → `apply_vertical_9_16_crop()` — crop portrait centré
  - `"native_ratio"` → `apply_native_ratio_crop()` — crop au ratio natif caméra
- Preset caméra dans `burnin_web_settings.json["open_gate_crop"]["preset"]` : `"arri_alexa35"|"arri_alexalf"|"sony_venice1"|"sony_venice2"|"custom"`
- Safety `< 100%` = zoom in, `> 100%` = zoom out (valeurs autorisées > 100%).

### Ordre des opérations sur chaque still (export loop)
1. OGC/Framelines crop
2. Burnins (sur l'image croppée)
3. Fit to FHD canvas (1920×1080, black bars)
4. Resize proportionnel (ignoré si fit_to_FHD actif)
5. Tag sRGB — dernière opération pixel, pour que le profil embarqué corresponde à l'image finale
6. Renommage fichier (still_naming template)

### Tag sRGB (Rec.709 → sRGB, `tag_srgb`)
- **Pourquoi** : `ExportStills()` ne tague jamais les JPEG (pas d'ICC embarqué). Sans tag, les apps color-managées de l'écosystème Apple (Preview, Photos, Safari, iPad) assument sRGB pour lire les pixels, alors que le rendu Resolve réel suit la courbe Rec.709 — léger décalage de contraste dans les tons moyens par rapport au moniteur de référence (SmallHD, Rec.709).
- **Ce que fait `apply_srgb_icc_tag()`** : convertit les pixels du profil source `ITU-R BT.709 Reference Display` vers `sRGB v4 ICC preference display class` (intent perceptuel, `ImageCms.profileToProfile`), puis embarque ce dernier dans le JPEG (`icc_profile=...` au `save()`). Le fichier reste un JPEG classique, lisible partout ; les apps color-managées récupèrent le tag et corrigent l'affichage, les autres affichent des pixels déjà proches de ce qu'elles assument (sRGB).
- **Profils** : livrés dans `Stills_Marker_python_settings/icc/` (chemin résolu via `_icc_profile_paths()`, relatif au script comme `load_burnin_web_settings`). Si l'un des deux fichiers manque, l'étape est silencieusement sautée (log `[icc] Profile(s) missing...`).
- **JPEG only** — no-op sur les autres formats (extension vérifiée en tête de fonction).
- **Compatibilité Pillow** : `ImageCms.INTENT_PERCEPTUAL` a été retiré des versions récentes de Pillow au profit de l'enum `ImageCms.Intent.PERCEPTUAL` ; le script essaie l'enum puis retombe sur l'ancienne constante (`_ICC_INTENT_PERCEPTUAL`, résolu une fois à l'import).
- **Attention à ImageOptim** : la compression post-export (`compress_mode`) peut, selon les réglages de l'app ImageOptim elle-même, stripper les métadonnées y compris l'ICC. Si le tag disparaît après compression, vérifier les préférences ImageOptim ("Strip color profile" / "ICC profile").

### Markers
- `marker_source` : "timeline" (markers sur la réglette), "clip" (markers sur les clips en MediaPool), "both".
- Les markers clip sont collectés via `collect_clip_markers()` — combine TI markers et MPI markers.
- `move_markers_to_clips` / `move_markers_to_timeline` : déplace les markers, requiert page Edit, exécuté post-boucle.
- `rename_timeline_markers` : stratégie delete-by-color + re-add pour contourner l'absence de `DeleteMarkerAtFrameNum` dans certaines versions de Resolve.

### JSON output
- `.{timeline_name}_stills_metadata.json` — métadonnées par frame : clip, scene/shot/take, TC source, `exported_filename`
- `.{timeline_name}_clips.json` — liste des clips de la première piste vidéo
- Fichiers préfixés `.` (masqués sur macOS).

### Burnin web UI
- `server_save_burnin_json.py` lance un serveur HTTP local.
- Sauvegarde dans `burnin_web_settings.json`.
- La clé `"elements"` est une liste d'objets `{key, x, y, font_ratio, opacity, align, color, font_family, bold}`.
- `_CUSTOM_TO_RESOLVE` dans le script principal mappe les tokens custom → noms de champs Resolve.

## Contraintes connues de l'API Resolve

- Pas de méthode pour switcher les panneaux internes de la page Color (Gallery vs LUT vs MediaPool).
- `ExportStills()` peut retourner `None` même en succès → on détecte les nouveaux fichiers par diff de répertoire.
- `CreateGalleryStillAlbum()` peut retourner `None` sur certaines versions → fallback sur `GetCurrentStillAlbum()`.
- `DeleteMarkerAtFrameNum` absent sur certaines versions → stratégie delete-by-color + re-add.

## Installation

Le script va dans :
- **macOS** : `/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/`
- **Windows** : `%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\`

Le dossier `Stills_Marker_python_settings/` doit être copié au même niveau.
