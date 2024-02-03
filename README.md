# Resolve Stills Markers Exporter
## Description
A script that allows you to grab stills from timeline markers and optionally export them to a folder.
Converted to python from lua script created by Roger Magnusson.

## Requirements
- Pillow image processing library in Python for image resizing.
**note**: script will now attempt to install Pillow if not found.
- Python 3.6 or higher.
- DaVinci Resolve 18 or higher.

### Pillow Installation Guide

#### Installation on macOS

1. **Open Terminal**: You can find it in Applications > Utilities.

2. **Ensure pip is installed**:
   ```bash
   python3 -m ensurepip --upgrade
    ```
   
3. **Install Pillow**:
   ```bash
   python3 -m pip install --upgrade pip
   python3 -m pip install --upgrade Pillow
   ```
#### Installation on Windows

1. **Open Command Prompt**: You can find it in Start > Windows System > Command Prompt. 
    **Note**: If you are using Windows 10, you can also use the Windows PowerShell, which is a more powerful tool.

3. **Ensure pip is installed**:
    ```bash
    py -m ensurepip --upgrade
    ```
   
3. **Install Pillow**:
    ```bash
     py -m pip install --upgrade pip
     py -m pip install --upgrade Pillow
     ```

## Install on Davinci Resolve

To use the script, copy it to the "Workflow Integration Plugins" folder (or create it) and restart Resolve.
  Mac OS X:
    "/Library/Application Support/Blackmagic Design/DaVinci Resolve/Workflow Integration Plugins/"
  Windows:
    "%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\"

You can launch it from menu Workspace > WorkFlow Integration.

## Note from the author

This script also highlights an issue with scripting in Resolve. There's no way to lock the user
interface while the script is running and if the user opens a modal window, like Project Settings,
most of the scriptable operations will fail. What's even worse, if the automatic backup kicks in when
a script is running, the script will also fail.

Many functions in the Resolve API can return a status so you can check if it succeeded or not, but I
think what we really need is a way to lock the GUI and for backups to be postponed while running. Just
like what happens when you're rendering a file.

## Added features

- Rename stills with metadata from clip scene/shot/take/camera or if not available clip name, but
only if  "Use labels on still export" is checked in Resolve's gallery still album.

- Resize exported stills to a percentage of the original size and resize timeline if resize is more than 100 percent.

- Grab stills only between in and out points.

- Remove drx files generated by Resolve.

- Export stills to a folder with the same name as the timeline.

- Compress exported images with ImageOptim if installed.


