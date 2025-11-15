bl_info = {
    "name": "Concepto AV Script Sync",
    "author": "Concepto Team",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "View3D > Sidebar > Concepto",
    "description": "Sync AV script data and images with Concepto app",
    "category": "Animation",
}

import bpy

# Import modules
from . import operators
from . import panels
from . import properties
from . import api_client

# Store module references for reloading
_modules = (
    properties,
    operators,
    panels,
)

def register():
    """Register all addon classes and properties."""
    # Register in order: properties first, then operators, then panels
    for module in _modules:
        if hasattr(module, 'register'):
            try:
                module.register()
            except Exception as e:
                print(f"Error registering {module.__name__}: {e}")
                # Continue with other modules even if one fails
                import traceback
                traceback.print_exc()
    
    # Preferences will be loaded automatically when the panel is drawn
    # The panel's draw() method handles loading preferences into scene properties
    
    print("Concepto Blender Plugin registered successfully")

def unregister():
    """Unregister all addon classes and properties."""
    # Unregister in reverse order: panels first, then operators, then properties
    for module in reversed(_modules):
        if hasattr(module, 'unregister'):
            try:
                module.unregister()
            except Exception as e:
                print(f"Error unregistering {module.__name__}: {e}")
                # Continue with other modules even if one fails
                import traceback
                traceback.print_exc()
    
    print("Concepto Blender Plugin unregistered successfully")

# Handle reloading (for development)
if "bpy" in locals():
    import importlib
    if "properties" in locals():
        importlib.reload(properties)
    if "operators" in locals():
        importlib.reload(operators)
    if "panels" in locals():
        importlib.reload(panels)
    if "api_client" in locals():
        importlib.reload(api_client)

