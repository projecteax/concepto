"""
API Client for Concepto External API
"""
import requests
import json
import os
from typing import Dict, List, Optional, Tuple

class ConceptoAPIClient:
    def __init__(self, api_endpoint: str, api_key: str):
        self.api_endpoint = api_endpoint.rstrip('/')
        self.api_key = api_key
        self.headers = {
            'X-API-Key': api_key,
            'Content-Type': 'application/json',
        }
    
    def _make_request(self, method: str, endpoint: str, **kwargs) -> Tuple[bool, Dict]:
        """Make HTTP request to API"""
        url = f"{self.api_endpoint}{endpoint}"
        headers = kwargs.pop('headers', {})
        headers.update(self.headers)
        
        try:
            if method.upper() == 'GET':
                response = requests.get(url, headers=headers, **kwargs)
            elif method.upper() == 'PUT':
                response = requests.put(url, headers=headers, json=kwargs.pop('json', {}), **kwargs)
            elif method.upper() == 'POST':
                # Handle file uploads separately
                if 'files' in kwargs:
                    # Remove Content-Type for multipart/form-data
                    headers.pop('Content-Type', None)
                    response = requests.post(url, headers=headers, files=kwargs.pop('files'), **kwargs)
                else:
                    response = requests.post(url, headers=headers, json=kwargs.pop('json', {}), **kwargs)
            else:
                return False, {"error": f"Unsupported method: {method}"}
            
            # Check if response is HTML (likely wrong endpoint)
            content_type = response.headers.get('Content-Type', '').lower()
            if 'text/html' in content_type or response.text.strip().startswith('<!DOCTYPE') or response.text.strip().startswith('<html'):
                return False, {
                    "error": f"Received HTML instead of JSON. The API endpoint may be incorrect. URL: {url}",
                    "code": "INVALID_ENDPOINT",
                    "details": f"Expected JSON but got HTML. Please check your API endpoint URL. It should end with '/api/external'"
                }
            
            if response.status_code == 200 or response.status_code == 201:
                try:
                    return True, response.json()
                except json.JSONDecodeError as e:
                    # Response claims to be JSON but isn't valid
                    return False, {
                        "error": f"Invalid JSON response from server. URL: {url}",
                        "code": "INVALID_JSON",
                        "details": f"Response preview: {response.text[:200]}"
                    }
            else:
                # Try to parse error response as JSON
                try:
                    error_data = response.json() if response.content else {}
                    return False, {
                        "error": error_data.get('error', f'HTTP {response.status_code}'),
                        "code": error_data.get('code', 'UNKNOWN_ERROR'),
                        "details": error_data.get('details', '')
                    }
                except json.JSONDecodeError:
                    # Error response is not JSON
                    return False, {
                        "error": f"HTTP {response.status_code} - Non-JSON error response",
                        "code": "HTTP_ERROR",
                        "details": f"URL: {url}, Response preview: {response.text[:200]}"
                    }
        except requests.exceptions.RequestException as e:
            return False, {
                "error": f"Network error: {str(e)}",
                "code": "NETWORK_ERROR",
                "details": f"URL: {url}"
            }
        except Exception as e:
            return False, {
                "error": f"Unexpected error: {str(e)}",
                "code": "UNEXPECTED_ERROR",
                "details": f"URL: {url}"
            }
    
    def get_episode(self, episode_id: str) -> Tuple[bool, Dict]:
        """Get episode data with all segments and shots"""
        return self._make_request('GET', f'/episodes/{episode_id}')
    
    def get_shot(self, shot_id: str) -> Tuple[bool, Dict]:
        """Get shot data"""
        return self._make_request('GET', f'/shots/{shot_id}')
    
    def update_shot(self, shot_id: str, audio: Optional[str] = None, 
                    visual: Optional[str] = None, 
                    word_count: Optional[int] = None,
                    runtime: Optional[float] = None) -> Tuple[bool, Dict]:
        """Update shot data"""
        updates = {}
        if audio is not None:
            updates['audio'] = audio
        if visual is not None:
            updates['visual'] = visual
        if word_count is not None:
            updates['wordCount'] = word_count
        if runtime is not None:
            updates['runtime'] = runtime
        
        return self._make_request('PUT', f'/shots/{shot_id}', json=updates)
    
    def upload_shot_images(self, shot_id: str, 
                          main_image_path: Optional[str] = None,
                          start_frame_path: Optional[str] = None,
                          end_frame_path: Optional[str] = None) -> Tuple[bool, Dict]:
        """Upload/replace shot images"""
        files = {}
        file_handles = []
        
        try:
            if main_image_path and os.path.exists(main_image_path):
                file_handle = open(main_image_path, 'rb')
                file_handles.append(file_handle)
                # Get file extension from path
                ext = os.path.splitext(main_image_path)[1] or '.png'
                mime_type = 'image/png' if ext == '.png' else 'image/jpeg'
                files['mainImage'] = (f'main{ext}', file_handle, mime_type)
            
            if start_frame_path and os.path.exists(start_frame_path):
                file_handle = open(start_frame_path, 'rb')
                file_handles.append(file_handle)
                ext = os.path.splitext(start_frame_path)[1] or '.png'
                mime_type = 'image/png' if ext == '.png' else 'image/jpeg'
                files['startFrame'] = (f'start{ext}', file_handle, mime_type)
            
            if end_frame_path and os.path.exists(end_frame_path):
                file_handle = open(end_frame_path, 'rb')
                file_handles.append(file_handle)
                ext = os.path.splitext(end_frame_path)[1] or '.png'
                mime_type = 'image/png' if ext == '.png' else 'image/jpeg'
                files['endFrame'] = (f'end{ext}', file_handle, mime_type)
            
            if not files:
                return False, {"error": "No images provided or files don't exist"}
            
            success, result = self._make_request('POST', f'/shots/{shot_id}/images', files=files)
            return success, result
        except Exception as e:
            return False, {"error": f"Upload error: {str(e)}", "code": "UPLOAD_ERROR"}
        finally:
            # Close file handles
            for handle in file_handles:
                try:
                    handle.close()
                except:
                    pass

