import bpy
from bpy.props import StringProperty, BoolProperty, EnumProperty, IntProperty
from bpy.types import PropertyGroup, AddonPreferences

class ConceptoAddonPreferences(AddonPreferences):
    """Addon preferences - persists across Blender sessions"""
    bl_idname = "concepto_blender_plugin"  # Must match the addon folder name
    
    api_endpoint: StringProperty(
        name="API Endpoint",
        description="Concepto API endpoint URL",
        default="https://your-app.com/api/external",
    )
    
    api_key: StringProperty(
        name="API Key",
        description="Your Concepto API key",
        default="",
        subtype='PASSWORD',
    )
    
    show_id: StringProperty(
        name="Show ID",
        description="Show ID from Concepto",
        default="",
    )
    
    episode_id: StringProperty(
        name="Episode ID",
        description="Episode ID from Concepto",
        default="",
    )
    
    def draw(self, context):
        layout = self.layout
        layout.label(text="Concepto API Configuration (Saved across sessions)")
        layout.prop(self, "api_endpoint")
        layout.prop(self, "api_key")
        layout.prop(self, "show_id")
        layout.prop(self, "episode_id")

def update_api_endpoint(self, context):
    """Update callback to save to preferences when scene property changes"""
    prefs = getattr(context.preferences.addons.get("concepto_blender_plugin"), 'preferences', None)
    if prefs:
        prefs.api_endpoint = self.api_endpoint

def update_api_key(self, context):
    """Update callback to save to preferences when scene property changes"""
    prefs = getattr(context.preferences.addons.get("concepto_blender_plugin"), 'preferences', None)
    if prefs:
        prefs.api_key = self.api_key

def update_show_id(self, context):
    """Update callback to save to preferences when scene property changes"""
    prefs = getattr(context.preferences.addons.get("concepto_blender_plugin"), 'preferences', None)
    if prefs:
        prefs.show_id = self.show_id

def update_episode_id(self, context):
    """Update callback to save to preferences when scene property changes"""
    prefs = getattr(context.preferences.addons.get("concepto_blender_plugin"), 'preferences', None)
    if prefs:
        prefs.episode_id = self.episode_id

class ConceptoAPISettings(PropertyGroup):
    """API Configuration Settings"""
    
    api_endpoint: StringProperty(
        name="API Endpoint",
        description="Concepto API endpoint URL",
        default="https://your-app.com/api/external",
        update=update_api_endpoint,
    )
    
    api_key: StringProperty(
        name="API Key",
        description="Your Concepto API key",
        default="",
        subtype='PASSWORD',
        update=update_api_key,
    )
    
    show_id: StringProperty(
        name="Show ID",
        description="Show ID from Concepto",
        default="",
        update=update_show_id,
    )
    
    episode_id: StringProperty(
        name="Episode ID",
        description="Episode ID from Concepto",
        default="",
        update=update_episode_id,
    )
    
    segment_id: StringProperty(
        name="Segment ID",
        description="Current Segment ID (optional)",
        default="",
    )
    
    shot_id: StringProperty(
        name="Shot ID",
        description="Current Shot ID (optional)",
        default="",
    )
    
    is_configured: BoolProperty(
        name="Is Configured",
        description="Whether API is configured",
        default=False,
    )

class ConceptoShotData(PropertyGroup):
    """Data for a single shot"""
    
    shot_id: StringProperty(name="Shot ID")
    shot_number: StringProperty(name="Shot Number")
    audio: StringProperty(name="Audio")
    visual: StringProperty(name="Visual")
    main_image_url: StringProperty(name="Main Image URL")
    start_frame_url: StringProperty(name="Start Frame URL")
    end_frame_url: StringProperty(name="End Frame URL")
    segment_id: StringProperty(name="Segment ID")
    segment_number: IntProperty(name="Segment Number")
    segment_title: StringProperty(name="Segment Title")

def get_segment_items(self, context):
    """Dynamic enum items for segment dropdown"""
    items = [('NONE', "No Segment Selected", "Select a segment")]
    
    if not hasattr(context.scene, 'concepto_state'):
        return items
    
    state = context.scene.concepto_state
    if not state.episode_data:
        return items
    
    try:
        import json
        episode_data = json.loads(state.episode_data)
        av_script = episode_data.get('avScript', {})
        segments = av_script.get('segments', [])
        
        unique_segments = {}
        for segment in segments:
            seg_id = segment.get('id', '')
            if seg_id not in unique_segments:
                unique_segments[seg_id] = {
                    'id': seg_id,
                    'number': segment.get('segmentNumber', 0),
                    'title': segment.get('title', ''),
                }
        
        sorted_segments = sorted(unique_segments.items(), key=lambda x: x[1]['number'])
        for seg_id, seg_data in sorted_segments:
            display_name = f"SC{seg_data['number']:02d}: {seg_data['title']}"
            items.append((seg_id, display_name, f"Segment {seg_data['number']}: {seg_data['title']}"))
    except:
        pass
    
    return items

def get_shot_items(self, context):
    """Dynamic enum items for shot dropdown"""
    items = [('NONE', "No Shot Selected", "Select a shot")]
    
    if not hasattr(context.scene, 'concepto_state') or not hasattr(context.scene, 'concepto_shots'):
        return items
    
    state = context.scene.concepto_state
    shots = context.scene.concepto_shots
    
    if not state.selected_segment_id:
        return items
    
    filtered_shots = [s for s in shots if s.segment_id == state.selected_segment_id]
    filtered_shots.sort(key=lambda x: (x.segment_number, x.shot_number))
    
    for shot in filtered_shots:
        display_name = f"{shot.shot_number}"
        if shot.visual:
            visual_preview = shot.visual[:40] + "..." if len(shot.visual) > 40 else shot.visual
            description = f"{shot.shot_number}: {visual_preview}"
        else:
            description = shot.shot_number
        # IMPORTANT: shot IDs may not be globally unique across segments.
        # Use a composite key so selection + uploads resolve to the correct segment+shot.
        composite_key = f"{shot.segment_id}|{shot.shot_id}"
        items.append((composite_key, display_name, description))
    
    return items

def update_segment_selection(self, context):
    """Update selected_segment_id when dropdown changes"""
    if hasattr(context.scene, 'concepto_state'):
        state = context.scene.concepto_state
        if self.selected_segment_enum != 'NONE':
            state.selected_segment_id = self.selected_segment_enum
            # Clear shot selection when segment changes
            state.selected_shot_id = ''
            state.selected_shot_enum = 'NONE'

def update_shot_selection(self, context):
    """Update selected_shot_id when dropdown changes"""
    if hasattr(context.scene, 'concepto_state'):
        state = context.scene.concepto_state
        if self.selected_shot_enum != 'NONE':
            # Store composite key (segmentId|shotId) for disambiguation
            state.selected_shot_id = self.selected_shot_enum

class ConceptoPluginState(PropertyGroup):
    """Plugin state management"""
    
    selected_segment_id: StringProperty(name="Selected Segment ID")
    selected_shot_id: StringProperty(name="Selected Shot ID")
    selected_image_type: EnumProperty(
        name="Selected Image Type",
        items=[
            ('NONE', "None", "No image type selected"),
            ('MAIN', "Main Image", "Main storyboard image"),
            ('START', "Start Frame", "Starting frame"),
            ('END', "End Frame", "Ending frame"),
        ],
        default='NONE',
    )
    
    # Episode data cache
    episode_data: StringProperty(name="Episode Data JSON", default="")
    
    # Loading states
    is_loading_episode: BoolProperty(name="Is Loading Episode", default=False)
    is_uploading_image: BoolProperty(name="Is Uploading Image", default=False)
    
    # Rendered image preview
    rendered_image_path: StringProperty(name="Rendered Image Path", default="")
    show_render_preview: BoolProperty(name="Show Render Preview", default=False)
    rendered_image_name: StringProperty(name="Rendered Image Name", default="")
    
    # Search and pagination
    shot_search: StringProperty(name="Search Shots", default="", description="Search shots by name or number")
    shots_page: IntProperty(name="Shots Page", default=0, min=0, description="Current page of shots")
    
    # Dropdown selections
    selected_segment_enum: EnumProperty(
        name="Segment",
        items=get_segment_items,
        update=update_segment_selection,
        description="Select a segment"
    )
    selected_shot_enum: EnumProperty(
        name="Shot",
        items=get_shot_items,
        update=update_shot_selection,
        description="Select a shot"
    )

# List of classes to register
_classes = (
    ConceptoAddonPreferences,
    ConceptoAPISettings,
    ConceptoShotData,
    ConceptoPluginState,
)

def register():
    """Register property classes and add properties to Scene."""
    # Unregister first if already registered (for reloading during development)
    for cls in _classes:
        try:
            bpy.utils.unregister_class(cls)
        except (RuntimeError, ValueError, KeyError):
            pass  # Not registered, continue
    
    # Register classes
    for cls in _classes:
        bpy.utils.register_class(cls)
    
    # Add properties to Scene type (only if they don't exist)
    if not hasattr(bpy.types.Scene, 'concepto_api'):
        bpy.types.Scene.concepto_api = bpy.props.PointerProperty(
            type=ConceptoAPISettings,
            name="Concepto API Settings",
            description="API configuration for Concepto"
        )
    
    if not hasattr(bpy.types.Scene, 'concepto_state'):
        bpy.types.Scene.concepto_state = bpy.props.PointerProperty(
            type=ConceptoPluginState,
            name="Concepto Plugin State",
            description="Plugin state management"
        )
    
    if not hasattr(bpy.types.Scene, 'concepto_shots'):
        bpy.types.Scene.concepto_shots = bpy.props.CollectionProperty(
            type=ConceptoShotData,
            name="Concepto Shots",
            description="Shot data from Concepto"
        )

def unregister():
    """Unregister property classes and remove properties from Scene."""
    # Remove properties first (must be done before unregistering classes)
    if hasattr(bpy.types.Scene, 'concepto_api'):
        del bpy.types.Scene.concepto_api
    if hasattr(bpy.types.Scene, 'concepto_state'):
        del bpy.types.Scene.concepto_state
    if hasattr(bpy.types.Scene, 'concepto_shots'):
        del bpy.types.Scene.concepto_shots
    
    # Unregister classes in reverse order
    for cls in reversed(_classes):
        try:
            bpy.utils.unregister_class(cls)
        except (RuntimeError, ValueError, KeyError):
            pass  # Not registered, continue

