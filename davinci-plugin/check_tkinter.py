#!/usr/bin/env python3
"""
Check if tkinter is available in Resolve's Python environment
"""

import sys

print("=== Tkinter check ===")
print(f"Python: {sys.executable}")

try:
    import tkinter as tk
    print("✓ tkinter is available")
    print(f"  tkinter version: {tk.TkVersion}")
    
    # Try to create a test window
    root = tk.Tk()
    root.withdraw()  # Hide the window
    print("✓ tkinter.Tk() works")
    root.destroy()
    print("✓ All tkinter tests passed")
except ImportError as e:
    print(f"✗ tkinter not available: {e}")
except Exception as e:
    print(f"✗ tkinter error: {e}")


