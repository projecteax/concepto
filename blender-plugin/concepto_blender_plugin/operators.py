import bpy
import json
import os
import sys
import tempfile
import requests
from bpy.props import StringProperty
from bpy.types import Operator
from . import api_client
from . import properties

def get_addon_prefs(context):
    """Helper function to get addon preferences"""
    # Use the addon module name directly
    addon_name = "concepto_blender_plugin"
    if addon_name in context.preferences.addons:
        return context.preferences.addons[addon_name].preferences
    return None

class CONCEPTO_OT_PasteAPIConfig(Operator):
    """Paste API configuration from Concepto"""
    bl_idname = "concepto.paste_api_config"
    bl_label = "Paste API Configuration"
    bl_description = "Paste JSON configuration from Concepto 'Get API' dialog"
    bl_options = {'REGISTER', 'UNDO'}
    
    config_json: StringProperty(
        name="Configuration JSON",
        description="Paste the JSON configuration from Concepto",
        default="",
    )
    
    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self, width=600)
    
    def draw(self, context):
        layout = self.layout
        layout.label(text="Paste JSON configuration from Concepto:", icon='INFO')
        layout.separator()
        layout.prop(self, "config_json", text="", multiline=True)
        layout.separator()
        layout.label(text="Format: {\"apiKey\": \"...\", \"apiEndpoint\": \"...\", etc.}", icon='QUESTION')
    
    def execute(self, context):
        if not self.config_json:
            self.report({'ERROR'}, "Please paste configuration JSON")
            return {'CANCELLED'}
        
        try:
            config = json.loads(self.config_json)
            # Use addon preferences for persistence
            prefs = get_addon_prefs(context)
            if not prefs:
                self.report({'ERROR'}, "Could not access addon preferences")
                return {'CANCELLED'}
            
            # Set values from JSON (only required fields)
            if 'apiKey' in config:
                prefs.api_key = config['apiKey']
            if 'apiEndpoint' in config:
                prefs.api_endpoint = config['apiEndpoint']
            if 'showId' in config:
                prefs.show_id = config['showId']
            if 'episodeId' in config:
                prefs.episode_id = config['episodeId']
            # Ignore segmentId and shotId - they'll be populated automatically
            
            # Also update scene properties for compatibility (this triggers update callbacks)
            api = context.scene.concepto_api
            # Temporarily disable update callbacks to avoid recursion
            api.api_key = prefs.api_key
            api.api_endpoint = prefs.api_endpoint
            api.show_id = prefs.show_id
            api.episode_id = prefs.episode_id
            
            self.report({'INFO'}, "Configuration pasted and saved successfully")
            # Auto-configure and load episode
            bpy.ops.concepto.configure_api()
            return {'FINISHED'}
        except json.JSONDecodeError:
            self.report({'ERROR'}, "Invalid JSON format")
            return {'CANCELLED'}
        except Exception as e:
            self.report({'ERROR'}, f"Error: {str(e)}")
            return {'CANCELLED'}

class CONCEPTO_OT_ConfigureAPI(Operator):
    """Configure API settings"""
    bl_idname = "concepto.configure_api"
    bl_label = "Configure API"
    bl_description = "Configure Concepto API connection"
    bl_options = {'REGISTER', 'UNDO'}
    
    def execute(self, context):
        # Get preferences (persistent) and scene properties (for compatibility)
        prefs = get_addon_prefs(context)
        api = context.scene.concepto_api
        
        # Use preferences if available, otherwise fall back to scene properties
        api_endpoint = (prefs.api_endpoint if prefs else None) or api.api_endpoint
        api_key = (prefs.api_key if prefs else None) or api.api_key
        episode_id = (prefs.episode_id if prefs else None) or api.episode_id
        show_id = (prefs.show_id if prefs else None) or api.show_id
        
        # Validate configuration
        if not api_endpoint or not api_key:
            self.report({'ERROR'}, "Please enter API endpoint and API key")
            return {'CANCELLED'}
        
        if not episode_id:
            self.report({'ERROR'}, "Please enter Episode ID")
            return {'CANCELLED'}
        
        if not show_id:
            self.report({'ERROR'}, "Please enter Show ID")
            return {'CANCELLED'}
        
        # Save to preferences for persistence
        if prefs:
            prefs.api_endpoint = api_endpoint
            prefs.api_key = api_key
            prefs.episode_id = episode_id
            prefs.show_id = show_id
        
        # Also update scene properties for compatibility
        api.api_endpoint = api_endpoint
        api.api_key = api_key
        api.episode_id = episode_id
        api.show_id = show_id
        
        # Test connection and load episode
        client = api_client.ConceptoAPIClient(api_endpoint, api_key)
        success, result = client.get_episode(episode_id)
        
        if success:
            api.is_configured = True
            self.report({'INFO'}, "API configured and saved successfully")
            # Automatically load episode data
            bpy.ops.concepto.load_episode()
            return {'FINISHED'}
        else:
            error_msg = result.get('error', 'Unknown error')
            error_details = result.get('details', '')
            if error_details:
                self.report({'ERROR'}, f"API connection failed: {error_msg}\n{error_details}")
            else:
                self.report({'ERROR'}, f"API connection failed: {error_msg}")
            return {'CANCELLED'}

class CONCEPTO_OT_LoadEpisode(Operator):
    """Load episode data from API"""
    bl_idname = "concepto.load_episode"
    bl_label = "Load Episode"
    bl_description = "Load episode data from Concepto"
    bl_options = {'REGISTER', 'UNDO'}
    
    def execute(self, context):
        # Get preferences (persistent) and scene properties
        prefs = get_addon_prefs(context)
        api = context.scene.concepto_api
        state = context.scene.concepto_state
        
        # Use preferences if available, otherwise fall back to scene properties
        api_endpoint = (prefs.api_endpoint if prefs else None) or api.api_endpoint
        api_key = (prefs.api_key if prefs else None) or api.api_key
        episode_id = (prefs.episode_id if prefs else None) or api.episode_id
        
        if not api.is_configured and not (api_endpoint and api_key):
            self.report({'ERROR'}, "Please configure API first")
            return {'CANCELLED'}
        
        if not episode_id:
            self.report({'ERROR'}, "Episode ID not set")
            return {'CANCELLED'}
        
        state.is_loading_episode = True
        
        try:
            client = api_client.ConceptoAPIClient(api_endpoint, api_key)
            success, result = client.get_episode(episode_id)
            
            if success:
                episode_data = result.get('data', {})
                state.episode_data = json.dumps(episode_data)
                
                # Clear existing shots
                context.scene.concepto_shots.clear()
                
                # Populate shots from segments
                av_script = episode_data.get('avScript', {})
                segments = av_script.get('segments', [])
                
                for segment in segments:
                    segment_id = segment.get('id', '')
                    segment_number = segment.get('segmentNumber', 0)
                    segment_title = segment.get('title', '')
                    shots = segment.get('shots', [])
                    
                    for shot in shots:
                        shot_item = context.scene.concepto_shots.add()
                        shot_item.shot_id = shot.get('id', '')
                        shot_item.shot_number = f"SC{segment_number:02d} - Shot {shot.get('shotNumber', 0)}"
                        shot_item.audio = shot.get('audio', '')
                        shot_item.visual = shot.get('visual', '')
                        shot_item.main_image_url = shot.get('imageUrl', '')
                        shot_item.segment_id = segment_id
                        shot_item.segment_number = segment_number
                        shot_item.segment_title = segment_title
                        
                        # Get start/end frames from image generation thread
                        image_thread = shot.get('imageGenerationThread', {})
                        if image_thread:
                            shot_item.start_frame_url = image_thread.get('startFrame', '')
                            shot_item.end_frame_url = image_thread.get('endFrame', '')
                
                self.report({'INFO'}, f"Loaded {len(context.scene.concepto_shots)} shots")
            else:
                error_msg = result.get('error', 'Unknown error')
                error_details = result.get('details', '')
                if error_details:
                    self.report({'ERROR'}, f"Failed to load episode: {error_msg}\n{error_details}")
                else:
                    self.report({'ERROR'}, f"Failed to load episode: {error_msg}")
                return {'CANCELLED'}
        except Exception as e:
            self.report({'ERROR'}, f"Error loading episode: {str(e)}")
            return {'CANCELLED'}
        finally:
            state.is_loading_episode = False
        
        return {'FINISHED'}

class CONCEPTO_OT_UpdateShotVisual(Operator):
    """Update shot visual text"""
    bl_idname = "concepto.update_shot_visual"
    bl_label = "Update Visual"
    bl_description = "Update shot visual description"
    bl_options = {'REGISTER', 'UNDO'}
    
    shot_id: StringProperty()
    visual_text: StringProperty()
    
    def execute(self, context):
        # Get preferences (persistent)
        prefs = get_addon_prefs(context)
        api = context.scene.concepto_api
        
        # Use preferences if available, otherwise fall back to scene properties
        api_endpoint = (prefs.api_endpoint if prefs else None) or api.api_endpoint
        api_key = (prefs.api_key if prefs else None) or api.api_key
        
        if not api.is_configured and not (api_endpoint and api_key):
            self.report({'ERROR'}, "API not configured")
            return {'CANCELLED'}
        
        client = api_client.ConceptoAPIClient(api_endpoint, api_key)
        success, result = client.update_shot(self.shot_id, visual=self.visual_text)
        
        if success:
            self.report({'INFO'}, "Shot updated successfully")
            # Reload episode to get latest data
            bpy.ops.concepto.load_episode()
            return {'FINISHED'}
        else:
            self.report({'ERROR'}, f"Failed to update: {result.get('error', 'Unknown error')}")
            return {'CANCELLED'}

class CONCEPTO_OT_RenderCurrentView(Operator):
    """Render current frame"""
    bl_idname = "concepto.render_current_view"
    bl_label = "Render Current Frame"
    bl_description = "Render current frame at 1920x1080 using current render settings"
    bl_options = {'REGISTER', 'UNDO'}
    
    def execute(self, context):
        state = context.scene.concepto_state
        scene = context.scene
        
        # Validate that an image type is selected
        if not state.selected_image_type or state.selected_image_type == 'NONE':
            self.report({'ERROR'}, "Please select image type (Main/Start/End) before rendering")
            return {'CANCELLED'}
        
        if not state.selected_shot_id:
            self.report({'ERROR'}, "Please select a shot first")
            return {'CANCELLED'}
        
        # Create temporary file for render
        temp_dir = tempfile.gettempdir()
        render_path = os.path.join(temp_dir, f"concepto_render_{scene.frame_current}_{os.getpid()}.png")
        
        # Save current render settings
        old_filepath = scene.render.filepath
        old_resolution_x = scene.render.resolution_x
        old_resolution_y = scene.render.resolution_y
        old_resolution_percentage = scene.render.resolution_percentage
        old_file_format = scene.render.image_settings.file_format
        old_color_mode = scene.render.image_settings.color_mode
        
        try:
            # Set resolution to 1920x1080 (as requested)
            scene.render.resolution_x = 1920
            scene.render.resolution_y = 1080
            scene.render.resolution_percentage = 100
            
            # Set output path and format
            scene.render.filepath = render_path
            scene.render.image_settings.file_format = 'PNG'
            scene.render.image_settings.color_mode = 'RGBA'
            
            # Render the current frame using whatever engine is selected
            # This uses the user's render settings (engine, samples, etc.)
            self.report({'INFO'}, f"Rendering frame {scene.frame_current}...")
            bpy.ops.render.render(write_still=True)
            
            # Check if file was created
            if os.path.exists(render_path):
                state.rendered_image_path = render_path
                state.show_render_preview = True
                
                # Load the image into Blender for preview
                try:
                    img = bpy.data.images.load(render_path)
                    img_name = f"Concepto_Render_{scene.frame_current}_{os.getpid()}"
                    img.name = img_name
                    # Pack the image so it's available even if file is deleted
                    try:
                        img.pack()
                    except:
                        pass  # Image might already be packed
                    # Force image to update and reload
                    img.reload()
                    img.update()
                    # Store image name in state for preview
                    state.rendered_image_name = img_name
                    # Force a redraw of the UI
                    for area in context.screen.areas:
                        if area.type == 'PROPERTIES':
                            area.tag_redraw()
                except Exception as e:
                    print(f"Warning: Could not load render for preview: {e}")
                    import traceback
                    traceback.print_exc()
                
                self.report({'INFO'}, f"Frame {scene.frame_current} rendered at 1920x1080")
                return {'FINISHED'}
            else:
                self.report({'ERROR'}, "Render file was not created")
                return {'CANCELLED'}
        except Exception as e:
            self.report({'ERROR'}, f"Render failed: {str(e)}")
            import traceback
            traceback.print_exc()
            return {'CANCELLED'}
        finally:
            # Restore render settings
            scene.render.filepath = old_filepath
            scene.render.resolution_x = old_resolution_x
            scene.render.resolution_y = old_resolution_y
            scene.render.resolution_percentage = old_resolution_percentage
            scene.render.image_settings.file_format = old_file_format
            scene.render.image_settings.color_mode = old_color_mode

class CONCEPTO_OT_UploadRenderedImage(Operator):
    """Upload rendered image to replace selected image"""
    bl_idname = "concepto.upload_rendered_image"
    bl_label = "Upload & Overwrite"
    bl_description = "Upload rendered image to replace selected image"
    bl_options = {'REGISTER', 'UNDO'}
    
    def execute(self, context):
        # Get preferences (persistent)
        prefs = get_addon_prefs(context)
        api = context.scene.concepto_api
        state = context.scene.concepto_state
        
        # Use preferences if available, otherwise fall back to scene properties
        api_endpoint = (prefs.api_endpoint if prefs else None) or api.api_endpoint
        api_key = (prefs.api_key if prefs else None) or api.api_key
        
        if not api.is_configured and not (api_endpoint and api_key):
            self.report({'ERROR'}, "API not configured")
            return {'CANCELLED'}
        
        if not state.selected_shot_id:
            self.report({'ERROR'}, "No shot selected")
            return {'CANCELLED'}
        
        if not state.rendered_image_path or not os.path.exists(state.rendered_image_path):
            self.report({'ERROR'}, "No rendered image available")
            return {'CANCELLED'}
        
        state.is_uploading_image = True
        
        try:
            client = api_client.ConceptoAPIClient(api_endpoint, api_key)
            
            # Determine which image to upload based on selected type
            main_path = None
            start_path = None
            end_path = None
            
            if state.selected_image_type == 'MAIN':
                main_path = state.rendered_image_path
            elif state.selected_image_type == 'START':
                start_path = state.rendered_image_path
            elif state.selected_image_type == 'END':
                end_path = state.rendered_image_path
            
            success, result = client.upload_shot_images(
                state.selected_shot_id,
                main_image_path=main_path,
                start_frame_path=start_path,
                end_frame_path=end_path
            )
            
            if success:
                image_type_name = {
                    'MAIN': 'Main Image',
                    'START': 'Start Frame',
                    'END': 'End Frame'
                }.get(state.selected_image_type, 'Image')
                self.report({'INFO'}, f"{image_type_name} uploaded successfully")
                # Reload episode to get updated image URLs
                bpy.ops.concepto.load_episode()
                state.show_render_preview = False
                # Clear selected image type after successful upload
                state.selected_image_type = 'NONE'
            else:
                error_msg = result.get('error', 'Unknown error')
                error_details = result.get('details', '')
                if error_details:
                    self.report({'ERROR'}, f"Upload failed: {error_msg}\nDetails: {error_details[:100]}")
                else:
                    self.report({'ERROR'}, f"Upload failed: {error_msg}")
                return {'CANCELLED'}
        except Exception as e:
            self.report({'ERROR'}, f"Error uploading: {str(e)}")
            return {'CANCELLED'}
        finally:
            state.is_uploading_image = False
        
        return {'FINISHED'}

class CONCEPTO_OT_SelectShot(Operator):
    """Select a shot"""
    bl_idname = "concepto.select_shot"
    bl_label = "Select Shot"
    bl_description = "Select shot to edit"
    bl_options = {'REGISTER'}
    
    shot_id: StringProperty()
    
    def execute(self, context):
        context.scene.concepto_state.selected_shot_id = self.shot_id
        return {'FINISHED'}

class CONCEPTO_OT_SelectImageType(Operator):
    """Select image type to overwrite"""
    bl_idname = "concepto.select_image_type"
    bl_label = "Select Image Type"
    bl_description = "Select which image to overwrite"
    bl_options = {'REGISTER'}
    
    image_type: StringProperty()
    
    def execute(self, context):
        context.scene.concepto_state.selected_image_type = self.image_type
        return {'FINISHED'}

class CONCEPTO_OT_SelectSegment(Operator):
    """Select a segment"""
    bl_idname = "concepto.select_segment"
    bl_label = "Select Segment"
    bl_description = "Select segment to view shots"
    bl_options = {'REGISTER'}
    
    segment_id: StringProperty()
    
    def execute(self, context):
        context.scene.concepto_state.selected_segment_id = self.segment_id
        return {'FINISHED'}

class CONCEPTO_OT_ViewShotImages(Operator):
    """View shot images"""
    bl_idname = "concepto.view_shot_images"
    bl_label = "View Images"
    bl_description = "View and manage shot images"
    bl_options = {'REGISTER'}
    
    shot_id: StringProperty()
    
    def execute(self, context):
        context.scene.concepto_state.selected_shot_id = self.shot_id
        return {'FINISHED'}

class CONCEPTO_OT_EnlargeImage(Operator):
    """Enlarge image in image editor"""
    bl_idname = "concepto.enlarge_image"
    bl_label = "Enlarge Image"
    bl_description = "Open image in image editor"
    bl_options = {'REGISTER'}
    
    image_url: StringProperty()
    
    def execute(self, context):
        if not self.image_url:
            self.report({'ERROR'}, "No image URL provided")
            return {'CANCELLED'}
        
        # Check if it's a local file path (for rendered images) or a URL
        if os.path.exists(self.image_url):
            # It's a local file - load it directly
            try:
                img = bpy.data.images.load(self.image_url)
                img.name = f"Concepto_Render_{os.path.basename(self.image_url)}"
                
                # Find or create image editor
                image_editor_area = None
                for area in context.screen.areas:
                    if area.type == 'IMAGE_EDITOR':
                        image_editor_area = area
                        break
                
                if image_editor_area:
                    image_editor_area.spaces.active.image = img
                    self.report({'INFO'}, "Image loaded in image editor")
                else:
                    self.report({'INFO'}, f"Image loaded: {img.name}. Open Image Editor (Shift+F10) to view.")
                
                return {'FINISHED'}
            except Exception as e:
                self.report({'ERROR'}, f"Failed to load image: {str(e)}")
                return {'CANCELLED'}
        
        # Otherwise, it's a URL - download it
        try:
            self.report({'INFO'}, "Downloading image...")
            
            # Create temporary file
            temp_dir = tempfile.gettempdir()
            temp_file = os.path.join(temp_dir, f"concepto_image_{os.getpid()}_{hash(self.image_url)}.png")
            
            # Download image
            response = requests.get(self.image_url, timeout=10)
            response.raise_for_status()
            
            # Save to temp file
            with open(temp_file, 'wb') as f:
                f.write(response.content)
            
            # Load image in Blender
            try:
                img = bpy.data.images.load(temp_file)
                img.name = f"Concepto_Image_{os.path.basename(self.image_url)}"
                
                # Find or create image editor
                image_editor_area = None
                for area in context.screen.areas:
                    if area.type == 'IMAGE_EDITOR':
                        image_editor_area = area
                        break
                
                if image_editor_area:
                    image_editor_area.spaces.active.image = img
                    self.report({'INFO'}, "Image loaded in image editor")
                else:
                    self.report({'INFO'}, f"Image loaded: {img.name}. Open Image Editor (Shift+F10) to view.")
                
                return {'FINISHED'}
                
            except Exception as e:
                self.report({'ERROR'}, f"Failed to load image: {str(e)}")
                # Clean up temp file
                if os.path.exists(temp_file):
                    try:
                        os.remove(temp_file)
                    except:
                        pass
                return {'CANCELLED'}
                
        except requests.exceptions.RequestException as e:
            self.report({'ERROR'}, f"Failed to download image: {str(e)}")
            return {'CANCELLED'}
        except Exception as e:
            self.report({'ERROR'}, f"Error: {str(e)}")
            return {'CANCELLED'}

class CONCEPTO_OT_ShotsPage(Operator):
    """Navigate shots pages"""
    bl_idname = "concepto.shots_page"
    bl_label = "Shots Page"
    bl_description = "Navigate shots pages"
    bl_options = {'REGISTER'}
    
    direction: StringProperty()
    
    def execute(self, context):
        state = context.scene.concepto_state
        current_page = getattr(state, 'shots_page', 0)
        
        if self.direction == 'NEXT':
            state.shots_page = current_page + 1
        elif self.direction == 'PREV':
            state.shots_page = max(0, current_page - 1)
        
        return {'FINISHED'}

class CONCEPTO_OT_CancelRenderPreview(Operator):
    """Cancel render preview"""
    bl_idname = "concepto.cancel_render_preview"
    bl_label = "Cancel"
    bl_description = "Cancel render preview"
    bl_options = {'REGISTER'}
    
    def execute(self, context):
        state = context.scene.concepto_state
        state.show_render_preview = False
        
        # Clean up the loaded image from Blender
        if state.rendered_image_name:
            # Remove by stored name
            if state.rendered_image_name in bpy.data.images:
                bpy.data.images.remove(bpy.data.images[state.rendered_image_name])
            state.rendered_image_name = ""
        
        # Also try to remove by filepath
        if state.rendered_image_path:
            img_name = os.path.basename(state.rendered_image_path)
            for img in bpy.data.images:
                if img.filepath == state.rendered_image_path or f"Concepto_Render" in img.name:
                    # Only remove if it's our render image
                    if img_name in img.name or state.rendered_image_path in img.filepath:
                        bpy.data.images.remove(img)
                        break
        
        # Remove temp file
        if state.rendered_image_path and os.path.exists(state.rendered_image_path):
            try:
                os.remove(state.rendered_image_path)
            except:
                pass
        state.rendered_image_path = ""
        return {'FINISHED'}

class CONCEPTO_OT_SyncPreferences(Operator):
    """Sync preferences to scene properties"""
    bl_idname = "concepto.sync_preferences"
    bl_label = "Sync Preferences"
    bl_description = "Load saved preferences into scene properties"
    bl_options = {'REGISTER', 'UNDO'}
    
    def execute(self, context):
        prefs = get_addon_prefs(context)
        if not prefs:
            self.report({'ERROR'}, "No saved preferences found")
            return {'CANCELLED'}
        
        api = context.scene.concepto_api
        
        # Sync from preferences to scene properties
        # This will trigger update callbacks, but that's okay since values match
        if prefs.api_endpoint:
            api.api_endpoint = prefs.api_endpoint
        if prefs.api_key:
            api.api_key = prefs.api_key
        if prefs.show_id:
            api.show_id = prefs.show_id
        if prefs.episode_id:
            api.episode_id = prefs.episode_id
        
        # Mark as configured if we have the required fields
        if prefs.api_endpoint and prefs.api_key and prefs.show_id and prefs.episode_id:
            api.is_configured = True
        
        self.report({'INFO'}, "Preferences synced successfully")
        return {'FINISHED'}

class CONCEPTO_OT_EditShotVisual(Operator):
    """Edit shot visual text"""
    bl_idname = "concepto.edit_shot_visual"
    bl_label = "Edit Visual"
    bl_description = "Edit shot visual description"
    bl_options = {'REGISTER', 'UNDO'}
    
    shot_id: StringProperty()
    current_visual: StringProperty()
    
    def invoke(self, context, event):
        return context.window_manager.invoke_props_dialog(self, width=500)
    
    def draw(self, context):
        layout = self.layout
        layout.label(text="Visual Description:")
        layout.prop(self, "current_visual", text="", multiline=True)
    
    def execute(self, context):
        if not self.shot_id:
            return {'CANCELLED'}
        
        # Get preferences (persistent)
        prefs = get_addon_prefs(context)
        api = context.scene.concepto_api
        
        # Use preferences if available, otherwise fall back to scene properties
        api_endpoint = (prefs.api_endpoint if prefs else None) or api.api_endpoint
        api_key = (prefs.api_key if prefs else None) or api.api_key
        
        if not api.is_configured and not (api_endpoint and api_key):
            self.report({'ERROR'}, "API not configured")
            return {'CANCELLED'}
        
        client = api_client.ConceptoAPIClient(api_endpoint, api_key)
        success, result = client.update_shot(self.shot_id, visual=self.current_visual)
        
        if success:
            self.report({'INFO'}, "Visual updated successfully")
            # Update local shot data
            for shot in context.scene.concepto_shots:
                if shot.shot_id == self.shot_id:
                    shot.visual = self.current_visual
                    break
            return {'FINISHED'}
        else:
            self.report({'ERROR'}, f"Failed to update: {result.get('error', 'Unknown error')}")
            return {'CANCELLED'}

# List of operator classes to register
_classes = (
    CONCEPTO_OT_PasteAPIConfig,
    CONCEPTO_OT_ConfigureAPI,
    CONCEPTO_OT_LoadEpisode,
    CONCEPTO_OT_UpdateShotVisual,
    CONCEPTO_OT_RenderCurrentView,
    CONCEPTO_OT_UploadRenderedImage,
    CONCEPTO_OT_SelectShot,
    CONCEPTO_OT_SelectImageType,
    CONCEPTO_OT_SelectSegment,
    CONCEPTO_OT_ViewShotImages,
    CONCEPTO_OT_EnlargeImage,
    CONCEPTO_OT_ShotsPage,
    CONCEPTO_OT_CancelRenderPreview,
    CONCEPTO_OT_EditShotVisual,
    CONCEPTO_OT_SyncPreferences,
)

def register():
    """Register all operator classes."""
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
    """Unregister all operator classes."""
    # Unregister in reverse order
    for cls in reversed(_classes):
        try:
            bpy.utils.unregister_class(cls)
        except (RuntimeError, ValueError, KeyError):
            pass  # Not registered, continue

