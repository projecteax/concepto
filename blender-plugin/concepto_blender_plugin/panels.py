import bpy
import os
import sys
from bpy.types import Panel
from . import properties

class CONCEPTO_PT_APIConfig(Panel):
    """API Configuration Panel"""
    bl_label = "API Configuration"
    bl_idname = "CONCEPTO_PT_api_config"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Concepto"
    bl_order = 1
    
    def draw(self, context):
        layout = self.layout
        # Use addon preferences for persistence
        addon_name = "concepto_blender_plugin"
        prefs = None
        if addon_name in context.preferences.addons:
            prefs = context.preferences.addons[addon_name].preferences
        
        api = context.scene.concepto_api
        
        # Check if we need to sync from preferences (read-only check, no writing)
        needs_sync = False
        if prefs:
            if prefs.api_endpoint and prefs.api_endpoint != api.api_endpoint:
                needs_sync = True
            elif prefs.api_key and prefs.api_key != api.api_key:
                needs_sync = True
            elif prefs.show_id and prefs.show_id != api.show_id:
                needs_sync = True
            elif prefs.episode_id and prefs.episode_id != api.episode_id:
                needs_sync = True
        
        # Show status at top
        if api.is_configured:
            box = layout.box()
            box.label(text="✓ API Configured", icon='CHECKMARK')
            state = context.scene.concepto_state
            if state.episode_data:
                box.label(text="✓ Episode Loaded", icon='CHECKMARK')
            else:
                box.operator("concepto.load_episode", text="Load Episode", icon='IMPORT')
            layout.separator()
        
        # Show sync button if preferences exist and differ from scene
        if prefs and needs_sync:
            box = layout.box()
            box.label(text="Saved settings detected", icon='INFO')
            box.operator("concepto.sync_preferences", text="Load Saved Settings", icon='IMPORT')
            layout.separator()
        
        # Always use scene properties in UI (update callbacks will save to preferences)
        layout.label(text="API Endpoint:")
        layout.prop(api, "api_endpoint", text="")
        
        layout.label(text="API Key:")
        layout.prop(api, "api_key", text="")
        
        layout.separator()
        layout.label(text="Required IDs:")
        layout.prop(api, "show_id", text="Show ID")
        layout.prop(api, "episode_id", text="Episode ID")
        
        # Note about persistence
        if prefs:
            layout.separator()
            layout.label(text="Settings auto-save to preferences", icon='CHECKMARK')
        
        # Buttons section - always visible
        layout.separator()
        layout.separator()
        layout.label(text="Actions:", icon='TOOL_SETTINGS')
        
        # Paste JSON button
        row = layout.row()
        row.scale_y = 1.3
        layout.operator("concepto.paste_api_config", text="Paste JSON Config", icon='COPYDOWN')
        
        # Configure button - ALWAYS show it prominently
        layout.separator()
        box = layout.box()
        box.label(text="Configuration:", icon='SETTINGS')
        
        if not api.is_configured:
            row = box.row()
            row.scale_y = 2.5
            op = row.operator("concepto.configure_api", text="CONFIGURE & LOAD EPISODE", icon='SETTINGS')
            layout.label(text="Fill in all fields above, then click CONFIGURE", icon='INFO')
        else:
            row = box.row()
            row.scale_y = 1.5
            op = row.operator("concepto.load_episode", text="Reload Episode", icon='FILE_REFRESH')

class CONCEPTO_PT_SegmentSelector(Panel):
    """Segment Selector Panel"""
    bl_label = "Select Segment"
    bl_idname = "CONCEPTO_PT_segment_selector"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Concepto"
    bl_order = 2
    
    @classmethod
    def poll(cls, context):
        return context.scene.concepto_api.is_configured
    
    def draw(self, context):
        layout = self.layout
        state = context.scene.concepto_state
        
        # Show loading state
        if state.is_loading_episode:
            layout.label(text="Loading episode...", icon='TIME')
            return
        
        if not state.episode_data:
            layout.label(text="Configure API and load episode first", icon='INFO')
            return
        
        # Get unique segments
        import json
        try:
            episode_data = json.loads(state.episode_data)
            av_script = episode_data.get('avScript', {})
            segments = av_script.get('segments', [])
            
            # Group segments
            unique_segments = {}
            for segment in segments:
                seg_id = segment.get('id', '')
                if seg_id not in unique_segments:
                    unique_segments[seg_id] = {
                        'id': seg_id,
                        'number': segment.get('segmentNumber', 0),
                        'title': segment.get('title', ''),
                    }
            
            # Display segments in a dropdown
            layout.separator()
            layout.label(text="Select Season:", icon='SCENE')
            
            # Show dropdown - always accessible
            row = layout.row()
            row.prop(state, "selected_segment_enum", text="")
        except:
            layout.label(text="Error parsing episode data", icon='ERROR')

class CONCEPTO_PT_ShotsList(Panel):
    """Shots List Panel - Optimized for many shots"""
    bl_label = "Shots"
    bl_idname = "CONCEPTO_PT_shots_list"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Concepto"
    bl_order = 3
    
    @classmethod
    def poll(cls, context):
        return context.scene.concepto_api.is_configured and context.scene.concepto_state.episode_data
    
    def draw(self, context):
        layout = self.layout
        state = context.scene.concepto_state
        shots = context.scene.concepto_shots
        
        # Filter shots by selected segment
        if not state.selected_segment_id:
            layout.label(text="Select a segment above to view shots", icon='INFO')
            return
        
        filtered_shots = [s for s in shots if s.segment_id == state.selected_segment_id]
        
        if not filtered_shots:
            layout.label(text="No shots found in this segment", icon='INFO')
            return
        
        layout.label(text=f"Select Shot ({len(filtered_shots)} available):", icon='CAMERA_DATA')
        
        # Show dropdown - always accessible
        row = layout.row()
        row.prop(state, "selected_shot_enum", text="")
        
        # Show selected shot info
        if state.selected_shot_id:
            selected_shot = None
            for shot in filtered_shots:
                if shot.shot_id == state.selected_shot_id:
                    selected_shot = shot
                    break
            
            if selected_shot:
                layout.separator()
                box = layout.box()
                box.label(text=f"Selected: {selected_shot.shot_number}", icon='CHECKMARK')
                
                # Visual description - full text display as simple text
                layout.separator()
                layout.label(text="Visual Description:", icon='TEXT')
                if selected_shot.visual:
                    # Use a box with word wrapping for long text
                    desc_box = layout.box()
                    # Split long text into multiple lines - max 24 chars per line, never break words
                    visual_text = selected_shot.visual
                    words = visual_text.split()
                    lines = []
                    current_line = ""
                    max_line_length = 24  # Maximum 24 characters per line
                    
                    for word in words:
                        # Calculate what the line would look like with this word
                        if current_line:
                            test_line = current_line + " " + word
                        else:
                            test_line = word
                        
                        # If adding this word would exceed the limit, start a new line
                        if len(test_line) > max_line_length:
                            # Save current line if it has content
                            if current_line:
                                lines.append(current_line)
                            # Start new line with this word (even if word is longer than max)
                            current_line = word
                        else:
                            # Add word to current line
                            current_line = test_line
                    
                    # Add the last line if it has content
                    if current_line:
                        lines.append(current_line)
                    
                    # Display each line on its own row to prevent truncation
                    for line in lines:
                        row = desc_box.row()
                        row.label(text=line)
                else:
                    desc_box = layout.box()
                    desc_box.label(text="(none)", icon='INFO')

class CONCEPTO_PT_ShotImages(Panel):
    """Shot Images Panel - Shows main/start/end frames"""
    bl_label = "Shot Images"
    bl_idname = "CONCEPTO_PT_shot_images"
    bl_space_type = 'VIEW_3D'
    bl_region_type = 'UI'
    bl_category = "Concepto"
    bl_order = 4
    
    @classmethod
    def poll(cls, context):
        state = context.scene.concepto_state
        return state.selected_shot_id != '' and context.scene.concepto_api.is_configured
    
    def draw(self, context):
        layout = self.layout
        state = context.scene.concepto_state
        
        # Find selected shot
        shot = None
        for s in context.scene.concepto_shots:
            if s.shot_id == state.selected_shot_id:
                shot = s
                break
        
        if not shot:
            layout.label(text="Shot not found", icon='ERROR')
            return
        
        layout.label(text=f"Shot: {shot.shot_number}", icon='IMAGE_DATA')
        layout.separator()
        
        # Visual description - full text display (read-only for reference)
        layout.label(text="Visual Description:", icon='TEXT')
        if shot.visual:
            # Use a box with word wrapping for long text
            desc_box = layout.box()
            # Split long text into multiple lines - max 24 chars per line, never break words
            visual_text = shot.visual
            words = visual_text.split()
            lines = []
            current_line = ""
            max_line_length = 24  # Maximum 24 characters per line
            
            for word in words:
                # Calculate what the line would look like with this word
                if current_line:
                    test_line = current_line + " " + word
                else:
                    test_line = word
                
                # If adding this word would exceed the limit, start a new line
                if len(test_line) > max_line_length:
                    # Save current line if it has content
                    if current_line:
                        lines.append(current_line)
                    # Start new line with this word (even if word is longer than max)
                    current_line = word
                else:
                    # Add word to current line
                    current_line = test_line
            
            # Add the last line if it has content
            if current_line:
                lines.append(current_line)
            
            # Display each line on its own row to prevent truncation
            for line in lines:
                row = desc_box.row()
                row.label(text=line)
        else:
            layout.label(text="(none)", icon='INFO')
        
        layout.separator()
        
        # Images section
        layout.label(text="Images:", icon='IMAGE_DATA')
        box = layout.box()
        
        # Main Image
        row = box.row()
        col1 = row.column()
        col1.label(text="Main Image:", icon='RESTRICT_VIEW_OFF')
        if shot.main_image_url:
            col1.label(text="✓ Set", icon='CHECKMARK')
        else:
            col1.label(text="Not set")
        col2 = row.column()
        if shot.main_image_url:
            col2.operator("concepto.enlarge_image", text="View", emboss=True).image_url = shot.main_image_url
        
        # Start Frame
        row = box.row()
        col1 = row.column()
        col1.label(text="Start Frame:", icon='FRAME_PREV')
        if shot.start_frame_url:
            col1.label(text="✓ Set", icon='CHECKMARK')
        else:
            col1.label(text="Not set")
        col2 = row.column()
        if shot.start_frame_url:
            col2.operator("concepto.enlarge_image", text="View", emboss=True).image_url = shot.start_frame_url
        
        # End Frame
        row = box.row()
        col1 = row.column()
        col1.label(text="End Frame:", icon='FRAME_NEXT')
        if shot.end_frame_url:
            col1.label(text="✓ Set", icon='CHECKMARK')
        else:
            col1.label(text="Not set")
        col2 = row.column()
        if shot.end_frame_url:
            col2.operator("concepto.enlarge_image", text="View", emboss=True).image_url = shot.end_frame_url
        
        layout.separator()
        
        # Render and upload section
        layout.label(text="Render & Upload:", icon='RENDER_STILL')
        box = layout.box()
        
        # Image type selection BEFORE render
        box.label(text="Select image type to render:", icon='RESTRICT_SELECT_OFF')
        row = box.row()
        row.scale_y = 1.2
        
        # Main Image button
        if state.selected_image_type == 'MAIN':
            op = row.operator("concepto.select_image_type", text="Main Image ✓", emboss=True, depress=True)
        else:
            op = row.operator("concepto.select_image_type", text="Main Image", emboss=True)
        op.image_type = 'MAIN'
        
        # Start Frame button
        if state.selected_image_type == 'START':
            op = row.operator("concepto.select_image_type", text="Start Frame ✓", emboss=True, depress=True)
        else:
            op = row.operator("concepto.select_image_type", text="Start Frame", emboss=True)
        op.image_type = 'START'
        
        # End Frame button
        if state.selected_image_type == 'END':
            op = row.operator("concepto.select_image_type", text="End Frame ✓", emboss=True, depress=True)
        else:
            op = row.operator("concepto.select_image_type", text="End Frame", emboss=True)
        op.image_type = 'END'
        
        # Render button - only enabled if image type is selected
        layout.separator()
        if state.selected_image_type and state.selected_image_type != 'NONE':
            row = layout.row()
            row.scale_y = 1.5
            image_type_label = {
                'MAIN': 'Main Image',
                'START': 'Start Frame',
                'END': 'End Frame'
            }.get(state.selected_image_type, 'Image')
            op = row.operator("concepto.render_current_view", 
                            text=f"Render as {image_type_label}", 
                            icon='RENDER_STILL')
        else:
            row = layout.row()
            row.scale_y = 1.5
            op = row.operator("concepto.render_current_view", 
                            text="Select image type above first", 
                            icon='RENDER_STILL')
        
        # Preview and upload section
        if state.show_render_preview:
            layout.separator()
            layout.label(text="Rendered Image Preview:", icon='IMAGE_DATA')
            if state.rendered_image_path and os.path.exists(state.rendered_image_path):
                # Load and display image preview
                try:
                    # Check if image is already loaded in Blender
                    img_name = os.path.basename(state.rendered_image_path)
                    img = None
                    
                    # Try to find existing image by name or filepath
                    for existing_img in bpy.data.images:
                        if (existing_img.filepath == state.rendered_image_path or 
                            existing_img.name == img_name or 
                            f"Concepto_Render" in existing_img.name):
                            img = existing_img
                            break
                    
                    # Load image if not found
                    if not img:
                        img = bpy.data.images.load(state.rendered_image_path)
                        img.name = f"Concepto_Render_{os.path.basename(state.rendered_image_path)}"
                    
                    # Ensure image is updated and has pixels loaded
                    if img.size[0] > 0 and img.size[1] > 0:
                        # Pack the image to ensure it's available in Blender
                        try:
                            img.pack()
                        except:
                            pass  # Image might already be packed or external
                        
                        # Force image update and ensure it's ready
                        img.reload()
                        img.update()
                        
                        # Show image info first
                        info_row = layout.row()
                        info_row.label(text=f"Rendered: {img.size[0]}x{img.size[1]}", icon='INFO')
                        
                        # Try to display preview - template_preview might not work in all contexts
                        # So we'll provide a button to view it and try the preview
                        preview_box = layout.box()
                        preview_box.label(text="Preview:", icon='IMAGE_DATA')
                        
                        # Try template_preview - this may or may not work depending on Blender version
                        try:
                            preview_row = preview_box.row()
                            preview_row.scale_y = 15.0  # Make it very tall to see the preview
                            preview_row.template_preview(img, show_buttons=False)
                        except:
                            # If template_preview fails, show a button to open in image editor
                            preview_box.label(text="Preview not available in panel", icon='INFO')
                            preview_box.label(text="Click 'View in Image Editor' to see render")
                        
                        # Always provide a button to view in image editor as fallback
                        view_row = preview_box.row()
                        view_row.scale_y = 1.5
                        op = view_row.operator("concepto.enlarge_image", text="View in Image Editor", icon='IMAGE_DATA')
                        op.image_url = state.rendered_image_path
                    else:
                        layout.label(text="Image not loaded properly", icon='ERROR')
                    
                except Exception as e:
                    layout.label(text=f"Could not load preview: {str(e)}", icon='ERROR')
                    # Fallback: show file path
                    layout.label(text=f"File: {state.rendered_image_path}", icon='FILE_IMAGE')
                    import traceback
                    traceback.print_exc()
                
                layout.separator()
                row = layout.row()
                row.scale_y = 1.5
                image_type_name = {
                    'MAIN': 'Main Image',
                    'START': 'Start Frame',
                    'END': 'End Frame'
                }.get(state.selected_image_type, 'Image')
                row.operator("concepto.upload_rendered_image", 
                           text=f"Accept & Upload as {image_type_name}", 
                           icon='EXPORT')
                row.operator("concepto.cancel_render_preview", text="Cancel", emboss=False)
            else:
                layout.label(text="Rendering...", icon='TIME')

# List of panel classes to register
_classes = (
    CONCEPTO_PT_APIConfig,
    CONCEPTO_PT_SegmentSelector,
    CONCEPTO_PT_ShotsList,
    CONCEPTO_PT_ShotImages,
)

def register():
    """Register all panel classes."""
    # Unregister first if already registered (for reloading during development)
    for cls in _classes:
        try:
            bpy.utils.unregister_class(cls)
        except (RuntimeError, ValueError, KeyError):
            pass  # Not registered, continue
    
    # Register classes
    for cls in _classes:
        bpy.utils.register_class(cls)

def unregister():
    """Unregister all panel classes."""
    # Unregister in reverse order
    for cls in reversed(_classes):
        try:
            bpy.utils.unregister_class(cls)
        except (RuntimeError, ValueError, KeyError):
            pass  # Not registered, continue

