#!/usr/bin/env python3
"""
Concepto Resolve Smoke Test

Purpose: Verify that DaVinci Resolve is actually executing scripts from the Utility menu.
It will:
- write a log to %TEMP% (always)
- attempt to show a popup (PySide2/6) if available
- print basic Resolve connection info to the console
"""

import os
import sys
import traceback

LOG_PATH = os.path.join(os.environ.get("TEMP", r"C:\Windows\Temp"), "concepto_resolve_smoke_test.log")


def log(msg: str) -> None:
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(msg.rstrip() + "\n")
    except Exception:
        pass


log("=== smoke test start ===")
log(f"python={sys.executable}")
log(f"cwd={os.getcwd()}")
log(f"sys.path={sys.path[:5]}...")  # first 5 entries

try:
    import DaVinciResolveScript as dvr_script
    log("import DaVinciResolveScript: OK (direct)")
except ImportError:
    log("import DaVinciResolveScript: FAIL (direct), searching...")
    # Try to locate modules (typical Resolve installs)
    possible_paths = [
        os.path.expandvars(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        os.path.expandvars(r"%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        r"C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
        r"C:\Program Files\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
        r"C:\Program Files (x86)\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
    ]
    found = False
    for p in possible_paths:
        log(f"checking: {p}")
        if os.path.isdir(p):
            log(f"  -> exists")
            if p not in sys.path:
                sys.path.insert(0, p)
                log(f"  -> added to sys.path")
            try:
                import DaVinciResolveScript as dvr_script
                log(f"  -> import SUCCESS from {p}")
                found = True
                break
            except ImportError as e2:
                log(f"  -> import FAIL: {e2}")
                continue
        else:
            log(f"  -> not found")
    if not found:
        log("FATAL: Could not find DaVinciResolveScript in any standard location")
        raise ImportError("DaVinciResolveScript module not found. Check Resolve installation.")
except Exception as e:
    log("import DaVinciResolveScript: UNEXPECTED FAIL " + str(e))
    log(traceback.format_exc())
    raise


def show_popup(title: str, text: str) -> None:
    try:
        from PySide2 import QtWidgets  # type: ignore
    except Exception:
        try:
            from PySide6 import QtWidgets  # type: ignore
        except Exception:
            log("PySide not available; cannot show popup.")
            return

    app = QtWidgets.QApplication.instance() or QtWidgets.QApplication(sys.argv)
    QtWidgets.QMessageBox.information(None, title, text)


try:
    resolve = dvr_script.scriptapp("Resolve")
    log("resolve=" + ("OK" if resolve else "None"))
    if resolve:
        pm = resolve.GetProjectManager()
        proj = pm.GetCurrentProject() if pm else None
        log("project=" + (proj.GetName() if proj else "None"))

    show_popup("Concepto Smoke Test", f"Script executed.\nLog: {LOG_PATH}")
except Exception as e:
    log("runtime FAIL " + str(e))
    log(traceback.format_exc())
    try:
        show_popup("Concepto Smoke Test - ERROR", f"{e}\n\nLog: {LOG_PATH}")
    except Exception:
        pass


