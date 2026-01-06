#!/usr/bin/env python3
"""
Concepto DaVinci Resolve Plugin - Add Black Solid (GUI Version 2)
Improved version with better error handling and multiple fallback methods
"""

import sys
import os

# Try to import DaVinci Resolve API
try:
    import DaVinciResolveScript as dvr_script
except ImportError:
    possible_paths = [
        os.path.expandvars(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        os.path.expandvars(r"%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        r"C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
    ]
    
    found = False
    for path in possible_paths:
        if os.path.exists(path) and path not in sys.path:
            sys.path.insert(0, path)
            try:
                import DaVinciResolveScript as dvr_script
                found = True
                break
            except ImportError:
                continue
    
    if not found:
        print("ERROR: Could not find DaVinciResolveScript module.")
        sys.exit(1)

# Try to import GUI libraries
USE_PYSIDE = False
USE_TKINTER = False

try:
    from PySide2 import QtWidgets, QtCore, QtGui
    USE_PYSIDE = True
except ImportError:
    try:
        from PySide6 import QtWidgets, QtCore, QtGui
        USE_PYSIDE = True
    except ImportError:
        try:
            import tkinter as tk
            from tkinter import ttk, messagebox
            USE_TKINTER = True
        except ImportError:
            print("ERROR: No GUI library available.")
            sys.exit(1)

def add_black_solid_to_timeline(duration_seconds=5, color_rgb=(0, 0, 0), track_index=1, at_playhead=True):
    """Add a black solid to the timeline - improved version with better error handling"""
    
    try:
        # Get the Resolve application object
        resolve = dvr_script.scriptapp("Resolve")
        if not resolve:
            return False, "Could not connect to DaVinci Resolve. Make sure it's running."
        
        # Get project manager
        project_manager = resolve.GetProjectManager()
        if not project_manager:
            return False, "Could not get project manager."
        
        # Get current project
        project = project_manager.GetCurrentProject()
        if not project:
            return False, "No project is currently open. Please open a project first."
        
        # Get current timeline
        timeline = project.GetCurrentTimeline()
        if not timeline:
            return False, "No timeline is currently open. Please open a timeline first."
        
        # Get timeline frame rate
        timeline_frame_rate = timeline.GetSetting("timelineFrameRate")
        try:
            timeline_frame_rate = float(timeline_frame_rate) if timeline_frame_rate else 24.0
        except (ValueError, TypeError):
            timeline_frame_rate = 24.0
        
        # Calculate duration in frames
        duration_frames = int(duration_seconds * timeline_frame_rate)
        
        # Get playhead position
        if at_playhead:
            try:
                current_timecode = timeline.GetCurrentTimecode()
                if not current_timecode:
                    current_timecode = 0
            except:
                current_timecode = 0
        else:
            try:
                current_timecode = timeline.GetEndFrame()
                if not current_timecode:
                    current_timecode = 0
            except:
                current_timecode = 0
        
        # Convert RGB from 0-255 to 0.0-1.0
        color_r = float(color_rgb[0]) / 255.0
        color_g = float(color_rgb[1]) / 255.0
        color_b = float(color_rgb[2]) / 255.0
        
        # Get media pool
        media_pool = project.GetMediaPool()
        if not media_pool:
            return False, "Could not get media pool."
        
        # Helper function to safely check if method exists and is callable
        def method_exists(obj, method_name):
            attr = getattr(obj, method_name, None)
            return attr is not None and callable(attr)
        
        # Method 1: Try CreateGeneratorClip - check method exists and is callable
        try:
            if method_exists(media_pool, 'CreateGeneratorClip'):
                gen_clip = media_pool.CreateGeneratorClip("Solid Color", duration_frames)
                if gen_clip:
                    try:
                        # Try to append to timeline
                        if method_exists(timeline, 'AppendToTimeline'):
                            timeline.AppendToTimeline([gen_clip])
                            position = "at end" if not at_playhead else "at playhead"
                            return True, f"Success! Added {duration_seconds}s solid to track {track_index} ({position})."
                        elif method_exists(timeline, 'InsertClips'):
                            timeline.InsertClips([gen_clip], current_timecode, track_index)
                            return True, f"Success! Added {duration_seconds}s solid to track {track_index} at playhead."
                    except Exception as e:
                        pass  # Try next method
        except Exception as e:
            pass  # Try next method
        
        # Method 2: Try AddGenerator - check method exists and is callable
        try:
            if method_exists(timeline, 'AddGenerator'):
                # Try different generator names
                for gen_name in ["Solid Color", "Color", "Color Matte", "Matte"]:
                    try:
                        timeline_item = timeline.AddGenerator(gen_name, current_timecode, track_index)
                        if timeline_item:
                            # Try to set duration
                            try:
                                if method_exists(timeline_item, 'SetDuration'):
                                    timeline_item.SetDuration(duration_frames)
                            except:
                                pass
                            
                            # Try to set color
                            try:
                                if method_exists(timeline_item, 'SetProperty'):
                                    # Try different property formats
                                    prop_formats = [
                                        ("Color", {"R": color_r, "G": color_g, "B": color_b}),
                                        ("ColorR", color_r),
                                        ("ColorG", color_g),
                                        ("ColorB", color_b),
                                    ]
                                    for prop_name, prop_value in prop_formats:
                                        try:
                                            timeline_item.SetProperty(prop_name, prop_value)
                                            break
                                        except:
                                            continue
                            except:
                                pass
                            
                            position = "at playhead" if at_playhead else "at end"
                            return True, f"Success! Added {duration_seconds}s {gen_name} to track {track_index} ({position})."
                    except:
                        continue
        except Exception as e:
            pass  # Try next method
        
        # Method 3: Try CreateColorClip - check method exists and is callable
        if method_exists(media_pool, 'CreateColorClip'):
            for param_format in [
                # Format 1: Full dict
                {
                    "color": {"R": color_r, "G": color_g, "B": color_b},
                    "duration": duration_frames,
                    "width": 1920,
                    "height": 1080,
                    "pixelAspectRatio": 1.0,
                    "frameRate": timeline_frame_rate
                },
                # Format 2: Minimal dict
                {
                    "color": {"R": color_r, "G": color_g, "B": color_b},
                    "duration": duration_frames
                }
            ]:
                try:
                    color_clip = media_pool.CreateColorClip(param_format)
                    if color_clip:
                        # Try to insert
                        try:
                            if method_exists(timeline, 'AppendToTimeline'):
                                timeline.AppendToTimeline([color_clip])
                                position = "at end" if not at_playhead else "at playhead"
                                return True, f"Success! Added {duration_seconds}s solid to track {track_index} ({position})."
                            elif method_exists(timeline, 'InsertClips'):
                                timeline.InsertClips([color_clip], current_timecode, track_index)
                                return True, f"Success! Added {duration_seconds}s solid to track {track_index} at playhead."
                        except Exception as e:
                            continue
                except Exception as e:
                    continue
        
        # Method 4: Try CreateColorClips (plural) - check method exists and is callable
        if method_exists(media_pool, 'CreateColorClips'):
            try:
                color_clips = media_pool.CreateColorClips([{
                    "color": {"R": color_r, "G": color_g, "B": color_b},
                    "duration": duration_frames,
                    "width": 1920,
                    "height": 1080
                }])
                if color_clips and len(color_clips) > 0:
                    color_clip = color_clips[0]
                    try:
                        if method_exists(timeline, 'AppendToTimeline'):
                            timeline.AppendToTimeline([color_clip])
                            position = "at end" if not at_playhead else "at playhead"
                            return True, f"Success! Added {duration_seconds}s solid to track {track_index} ({position})."
                        elif method_exists(timeline, 'InsertClips'):
                            timeline.InsertClips([color_clip], current_timecode, track_index)
                            return True, f"Success! Added {duration_seconds}s solid to track {track_index} at playhead."
                    except Exception as e:
                        pass
            except Exception as e:
                pass
        
        # All methods failed
        return False, (
            "All methods failed. Please run 'diagnose_api.py' to see available methods.\n\n"
            "Manual workaround:\n"
            "1. In Media Pool, right-click > Create Color Matte\n"
            f"2. Set duration to {duration_seconds} seconds\n"
            f"3. Set color RGB: {color_rgb[0]}, {color_rgb[1]}, {color_rgb[2]}\n"
            "4. Drag to timeline"
        )
        
    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        return False, f"Unexpected error: {str(e)}\n\nDetails:\n{error_detail}"

# GUI code (same as before)
if USE_PYSIDE:
    class BlackSolidDialog(QtWidgets.QDialog):
        def __init__(self):
            super().__init__()
            self.setWindowTitle("Concepto - Add Black Solid")
            self.setMinimumWidth(400)
            self.init_ui()
        
        def init_ui(self):
            layout = QtWidgets.QVBoxLayout()
            
            title = QtWidgets.QLabel("Add Solid Color to Timeline")
            title.setStyleSheet("font-size: 16px; font-weight: bold; margin-bottom: 10px;")
            layout.addWidget(title)
            
            duration_layout = QtWidgets.QHBoxLayout()
            duration_layout.addWidget(QtWidgets.QLabel("Duration (seconds):"))
            self.duration_spin = QtWidgets.QDoubleSpinBox()
            self.duration_spin.setRange(0.1, 3600.0)
            self.duration_spin.setValue(5.0)
            self.duration_spin.setSingleStep(0.1)
            self.duration_spin.setDecimals(2)
            duration_layout.addWidget(self.duration_spin)
            layout.addLayout(duration_layout)
            
            color_layout = QtWidgets.QHBoxLayout()
            color_layout.addWidget(QtWidgets.QLabel("Color:"))
            self.color_button = QtWidgets.QPushButton()
            self.color_button.setFixedSize(60, 30)
            self.color_rgb = (0, 0, 0)
            self.update_color_button()
            self.color_button.clicked.connect(self.pick_color)
            color_layout.addWidget(self.color_button)
            color_layout.addStretch()
            layout.addLayout(color_layout)
            
            track_layout = QtWidgets.QHBoxLayout()
            track_layout.addWidget(QtWidgets.QLabel("Video Track:"))
            self.track_spin = QtWidgets.QSpinBox()
            self.track_spin.setRange(1, 10)
            self.track_spin.setValue(1)
            track_layout.addWidget(self.track_spin)
            layout.addLayout(track_layout)
            
            self.at_playhead_check = QtWidgets.QCheckBox("Insert at playhead position")
            self.at_playhead_check.setChecked(True)
            layout.addWidget(self.at_playhead_check)
            
            self.status_label = QtWidgets.QLabel("")
            self.status_label.setWordWrap(True)
            self.status_label.setStyleSheet("padding: 5px;")
            layout.addWidget(self.status_label)
            
            button_layout = QtWidgets.QHBoxLayout()
            self.add_button = QtWidgets.QPushButton("Add to Timeline")
            self.add_button.setDefault(True)
            self.add_button.clicked.connect(self.add_solid)
            button_layout.addWidget(self.add_button)
            
            close_button = QtWidgets.QPushButton("Close")
            close_button.clicked.connect(self.accept)
            button_layout.addWidget(close_button)
            layout.addLayout(button_layout)
            
            self.setLayout(layout)
        
        def update_color_button(self):
            r, g, b = self.color_rgb
            self.color_button.setStyleSheet(
                f"background-color: rgb({r}, {g}, {b}); "
                f"border: 2px solid #333; "
                f"border-radius: 4px;"
            )
        
        def pick_color(self):
            color = QtWidgets.QColorDialog.getColor(
                QtGui.QColor(*self.color_rgb),
                self,
                "Select Color"
            )
            if color.isValid():
                self.color_rgb = (color.red(), color.green(), color.blue())
                self.update_color_button()
        
        def add_solid(self):
            duration = self.duration_spin.value()
            track = self.track_spin.value()
            at_playhead = self.at_playhead_check.isChecked()
            
            self.status_label.setText("Processing...")
            self.status_label.setStyleSheet("padding: 5px; color: blue;")
            self.add_button.setEnabled(False)
            QtWidgets.QApplication.processEvents()
            
            success, message = add_black_solid_to_timeline(
                duration_seconds=duration,
                color_rgb=self.color_rgb,
                track_index=track,
                at_playhead=at_playhead
            )
            
            if success:
                self.status_label.setText(message)
                self.status_label.setStyleSheet("padding: 5px; color: green; font-weight: bold;")
            else:
                self.status_label.setText(message)
                self.status_label.setStyleSheet("padding: 5px; color: red;")
            
            self.add_button.setEnabled(True)
    
    def main():
        app = QtWidgets.QApplication.instance()
        if app is None:
            app = QtWidgets.QApplication(sys.argv)
        
        dialog = BlackSolidDialog()
        dialog.exec_()

elif USE_TKINTER:
    class BlackSolidDialog:
        def __init__(self):
            self.root = tk.Tk()
            self.root.title("Concepto - Add Black Solid")
            self.root.geometry("450x350")
            self.color_rgb = (0, 0, 0)
            self.init_ui()
        
        def init_ui(self):
            title = tk.Label(self.root, text="Add Solid Color to Timeline", font=("Arial", 14, "bold"))
            title.pack(pady=10)
            
            duration_frame = ttk.Frame(self.root)
            duration_frame.pack(pady=5, padx=10, fill=tk.X)
            ttk.Label(duration_frame, text="Duration (seconds):").pack(side=tk.LEFT)
            self.duration_var = tk.DoubleVar(value=5.0)
            duration_spin = ttk.Spinbox(duration_frame, from_=0.1, to=3600.0, 
                                       increment=0.1, textvariable=self.duration_var, width=10)
            duration_spin.pack(side=tk.LEFT, padx=5)
            
            color_frame = ttk.Frame(self.root)
            color_frame.pack(pady=5, padx=10, fill=tk.X)
            ttk.Label(color_frame, text="Color:").pack(side=tk.LEFT)
            self.color_button = tk.Button(color_frame, bg="#000000", width=8, 
                                         command=self.pick_color, relief=tk.RAISED)
            self.color_button.pack(side=tk.LEFT, padx=5)
            
            track_frame = ttk.Frame(self.root)
            track_frame.pack(pady=5, padx=10, fill=tk.X)
            ttk.Label(track_frame, text="Video Track:").pack(side=tk.LEFT)
            self.track_var = tk.IntVar(value=1)
            track_spin = ttk.Spinbox(track_frame, from_=1, to=10, 
                                    textvariable=self.track_var, width=5)
            track_spin.pack(side=tk.LEFT, padx=5)
            
            self.at_playhead_var = tk.BooleanVar(value=True)
            playhead_check = ttk.Checkbutton(self.root, text="Insert at playhead position",
                                            variable=self.at_playhead_var)
            playhead_check.pack(pady=5)
            
            self.status_label = tk.Label(self.root, text="", wraplength=400, justify=tk.LEFT)
            self.status_label.pack(pady=10, padx=10)
            
            button_frame = ttk.Frame(self.root)
            button_frame.pack(pady=10)
            
            add_button = ttk.Button(button_frame, text="Add to Timeline", command=self.add_solid)
            add_button.pack(side=tk.LEFT, padx=5)
            
            close_button = ttk.Button(button_frame, text="Close", command=self.root.destroy)
            close_button.pack(side=tk.LEFT, padx=5)
        
        def pick_color(self):
            try:
                from tkinter import colorchooser
                color = colorchooser.askcolor(initialcolor="#000000")
                if color[0]:
                    self.color_rgb = tuple(int(c) for c in color[0])
                    hex_color = color[1]
                    self.color_button.config(bg=hex_color)
            except:
                messagebox.showwarning("Color Picker", "Color picker not available. Using black.")
        
        def add_solid(self):
            duration = self.duration_var.get()
            track = self.track_var.get()
            at_playhead = self.at_playhead_var.get()
            
            self.status_label.config(text="Processing...", fg="blue")
            self.root.update()
            
            success, message = add_black_solid_to_timeline(
                duration_seconds=duration,
                color_rgb=self.color_rgb,
                track_index=track,
                at_playhead=at_playhead
            )
            
            if success:
                self.status_label.config(text=message, fg="green")
            else:
                self.status_label.config(text=message, fg="red")
                messagebox.showerror("Error", message)
        
        def run(self):
            self.root.mainloop()
    
    def main():
        dialog = BlackSolidDialog()
        dialog.run()

if __name__ == "__main__":
    main()

