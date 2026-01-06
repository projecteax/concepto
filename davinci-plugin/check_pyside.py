#!/usr/bin/env python3
"""
Check if PySide2/PySide6 is available in Resolve's Python environment
"""

import sys
import os
import traceback

LOG_PATH = os.path.join(os.environ.get("TEMP", "."), "concepto_pyside_check.log")

def log(msg):
    print(msg)
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(msg.rstrip() + "\n")
    except Exception:
        pass

log("=== PySide check start ===")
log(f"Python executable: {sys.executable}")
log(f"Python version: {sys.version}")
log(f"Current working directory: {os.getcwd()}")
log(f"sys.path entries ({len(sys.path)} total):")
for i, p in enumerate(sys.path[:10]):
    log(f"  [{i}] {p}")

# Check for PySide2
log("\n--- Checking PySide2 ---")
try:
    import PySide2
    log(f"✓ PySide2 found: {PySide2.__file__}")
    log(f"  PySide2 version: {PySide2.__version__}")
    from PySide2 import QtCore, QtGui, QtWidgets
    log("✓ PySide2.QtCore, QtGui, QtWidgets imported successfully")
except ImportError as e:
    log(f"✗ PySide2 not found: {e}")

# Check for PySide6
log("\n--- Checking PySide6 ---")
try:
    import PySide6
    log(f"✓ PySide6 found: {PySide6.__file__}")
    log(f"  PySide6 version: {PySide6.__version__}")
    from PySide6 import QtCore, QtGui, QtWidgets
    log("✓ PySide6.QtCore, QtGui, QtWidgets imported successfully")
except ImportError as e:
    log(f"✗ PySide6 not found: {e}")

# Check common PySide locations
log("\n--- Checking common PySide locations ---")
possible_paths = [
    os.path.dirname(sys.executable),
    os.path.join(os.path.dirname(sys.executable), "Lib", "site-packages"),
    r"C:\Program Files\Blackmagic Design\DaVinci Resolve",
    r"C:\Program Files (x86)\Blackmagic Design\DaVinci Resolve",
    os.path.expandvars(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve"),
    os.path.expandvars(r"%APPDATA%\Blackmagic Design\DaVinci Resolve"),
]

for base_path in possible_paths:
    if not os.path.isdir(base_path):
        continue
    log(f"\nSearching in: {base_path}")
    # Look for PySide2 directories
    for root, dirs, files in os.walk(base_path):
        # Limit depth
        depth = root[len(base_path):].count(os.sep)
        if depth > 3:
            dirs[:] = []
            continue
        if "PySide2" in dirs:
            pyside_path = os.path.join(root, "PySide2")
            log(f"  ✓ Found PySide2 directory: {pyside_path}")
            # Check if it has QtCore
            if os.path.isfile(os.path.join(pyside_path, "QtCore.pyd")) or \
               os.path.isfile(os.path.join(pyside_path, "QtCore.so")):
                log(f"    → Contains QtCore module")
        if "PySide6" in dirs:
            pyside_path = os.path.join(root, "PySide6")
            log(f"  ✓ Found PySide6 directory: {pyside_path}")

log("\n=== PySide check complete ===")
log(f"Log file: {LOG_PATH}")

