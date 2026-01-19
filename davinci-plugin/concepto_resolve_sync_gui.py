#!/usr/bin/env python3
"""
Concepto <-> DaVinci Resolve Sync (GUI)

Goals:
- User config (API endpoint, API key, Episode ID) saved locally (no retyping).
- Fetch episode (avScript + avPreviewData.videoClipStartTimes) and show name.
- For a selected Segment (scene):
  - Download ALL assets for each take into: C:\\davinci_projects\\[show_name]\\[episode]\\[take]\\
  - Create a Bin per take in Resolve and import those files.
  - Add ONLY the currently selected MAIN asset (shot.videoUrl or shot.imageUrl) to the timeline.
  - Place each clip at the correct startTime from AV Preview (videoClipStartTimes override, else sequential).
  - Apply duration and offset (shot.duration, shot.videoOffset).
- Refresh: re-fetch latest data.
- Sync: push timeline changes (startTime, duration, offset) back to Concepto.

NOTE: Resolve scripting API differs across installs. This script aggressively feature-detects methods and
falls back where needed.
"""

from __future__ import annotations

# Version timestamp - updated when plugin is modified
PLUGIN_VERSION_TIMESTAMP = "2026-01-20 01:15"

import traceback
import json
import os
import re
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import DaVinciResolveScript as dvr_script
except ImportError:
    # Try to locate modules (typical Resolve installs)
    possible_paths = [
        os.path.expandvars(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        os.path.expandvars(r"%APPDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules"),
        r"C:\ProgramData\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
        r"C:\Program Files\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Modules",
    ]
    for p in possible_paths:
        if os.path.isdir(p) and p not in sys.path:
            sys.path.insert(0, p)
            try:
                import DaVinciResolveScript as dvr_script
                break
            except ImportError:
                continue
    else:
        raise

# Try to locate PySide - check Resolve's Python site-packages too
USE_PYSIDE = False
USE_TKINTER = False

try:
    from PySide2 import QtCore, QtGui, QtWidgets  # type: ignore
    USE_PYSIDE = True
except ImportError:
    try:
        from PySide6 import QtCore, QtGui, QtWidgets  # type: ignore
        USE_PYSIDE = True
    except ImportError:
        # Try searching Resolve's Python paths
        resolve_python_paths = [
            os.path.join(os.path.dirname(sys.executable), "Lib", "site-packages"),
            r"C:\Program Files\Blackmagic Design\DaVinci Resolve\fusionscript\python\Lib\site-packages",
            os.path.expandvars(r"%PROGRAMDATA%\Blackmagic Design\DaVinci Resolve\Support\Developer\Scripting\Lib\site-packages"),
        ]
        for sp_path in resolve_python_paths:
            if os.path.isdir(sp_path) and sp_path not in sys.path:
                sys.path.insert(0, sp_path)
        # Try again after adding paths
        try:
            from PySide2 import QtCore, QtGui, QtWidgets  # type: ignore
            USE_PYSIDE = True
        except ImportError:
            try:
                from PySide6 import QtCore, QtGui, QtWidgets  # type: ignore
                USE_PYSIDE = True
            except ImportError:
                # Fallback to tkinter
                try:
                    import tkinter as tk  # type: ignore
                    from tkinter import ttk, messagebox, scrolledtext  # type: ignore
                    USE_TKINTER = True
                    QtCore = None  # type: ignore
                    QtGui = None  # type: ignore
                    QtWidgets = None  # type: ignore
                except ImportError:
                    QtCore = None  # type: ignore
                    QtGui = None  # type: ignore
                    QtWidgets = None  # type: ignore

import urllib.request
import urllib.error
import urllib.parse


UTILITY_DIR_DEFAULT = r"C:\Users\caspi\AppData\Roaming\Blackmagic Design\DaVinci Resolve\Support\Fusion\Scripts\Utility"
DOWNLOAD_ROOT_DEFAULT = r"C:\davinci_projects"

LOG_PATH_DEFAULT = os.path.join(UTILITY_DIR_DEFAULT, "concepto_resolve_sync_gui.log")


def _log_to_file(msg: str) -> None:
    # Also print to Resolve console/stdout (helps when GUI log is missed)
    try:
        print(msg.rstrip(), flush=True)
    except Exception:
        pass
    try:
        p = Path(os.environ.get("CONCEPTO_RESOLVE_LOG", LOG_PATH_DEFAULT))
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "a", encoding="utf-8") as f:
            f.write(msg.rstrip() + "\n")
    except Exception:
        # last resort: ignore
        pass


# Log GUI library selection after _log_to_file is defined
if USE_TKINTER:
    _log_to_file("Using tkinter as GUI fallback (PySide2/6 not available)")
elif USE_PYSIDE:
    _log_to_file("Using PySide2/6 for GUI")
else:
    _log_to_file("WARNING: No GUI library available")

# Create dummy base class for MainWindow when PySide is not available
if not USE_PYSIDE:
    class _DummyQWidget:
        pass
    class _DummyQtWidgets:
        QWidget = _DummyQWidget
    QtWidgets = _DummyQtWidgets()


def _safe_slug(s: str) -> str:
    s = s.strip()
    s = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "_", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:120] if len(s) > 120 else s


def _server_base_from_api_endpoint(api_endpoint: str) -> str:
    """
    If api_endpoint is like http://localhost:3000/api/external -> returns http://localhost:3000
    """
    ep = (api_endpoint or "").strip().rstrip("/")
    marker = "/api/external"
    if marker in ep:
        return ep.split(marker, 1)[0]
    # fallback: strip trailing /api
    if ep.endswith("/api"):
        return ep[:-4]
    return ep


def _resolve_url(url: Optional[str], api_endpoint: str) -> Optional[str]:
    """
    Resolve relative URLs from AV Preview (often like /api/proxy-media?url=...) into absolute.
    """
    if not url or not isinstance(url, str):
        return None
    u = url.strip()
    if not u:
        return None
    if u.startswith("http://") or u.startswith("https://"):
        return u
    base = _server_base_from_api_endpoint(api_endpoint)
    if u.startswith("/"):
        return base + u
    # sometimes stored without leading slash
    return base + "/" + u.lstrip("/")


def _method(obj: Any, name: str):
    fn = getattr(obj, name, None)
    return fn if fn is not None and callable(fn) else None


def _seconds_to_timecode(seconds: float, fps: float) -> str:
    if fps <= 0:
        fps = 24.0
    total_frames = int(round(seconds * fps))
    frames = total_frames % int(round(fps))
    total_seconds = total_frames // int(round(fps))
    ss = total_seconds % 60
    total_minutes = total_seconds // 60
    mm = total_minutes % 60
    hh = total_minutes // 60
    return f"{hh:02d}:{mm:02d}:{ss:02d}:{frames:02d}"


def _seconds_to_frames(seconds: float, fps: float) -> int:
    return int(round(seconds * fps))


@dataclass
class PluginConfig:
    api_endpoint: str = "http://localhost:3000/api/external"
    api_key: str = ""
    show_id: str = ""
    episode_id: str = ""
    download_root: str = DOWNLOAD_ROOT_DEFAULT

    @staticmethod
    def path() -> Path:
        base = Path(os.environ.get("CONCEPTO_RESOLVE_CONFIG_DIR", "")) if os.environ.get("CONCEPTO_RESOLVE_CONFIG_DIR") else None
        if base and base.exists():
            return base / "concepto_resolve_config.json"
        # Prefer Utility dir if it exists (what you're using)
        util = Path(UTILITY_DIR_DEFAULT)
        if util.exists():
            return util / "concepto_resolve_config.json"
        # Fallback
        return Path.home() / "concepto_resolve_config.json"

    @classmethod
    def load(cls) -> "PluginConfig":
        p = cls.path()
        if p.exists():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
                return cls(
                    api_endpoint=data.get("api_endpoint", cls().api_endpoint),
                    api_key=data.get("api_key", ""),
                    show_id=data.get("show_id", ""),
                    episode_id=data.get("episode_id", ""),
                    download_root=data.get("download_root", DOWNLOAD_ROOT_DEFAULT),
                )
            except Exception:
                pass
        return cls()

    def save(self) -> None:
        p = self.path()
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(
            json.dumps(
                {
                    "api_endpoint": self.api_endpoint,
                    "api_key": self.api_key,
                    "show_id": self.show_id,
                    "episode_id": self.episode_id,
                    "download_root": self.download_root,
                },
                indent=2,
            ),
            encoding="utf-8",
        )


class ConceptoClient:
    def __init__(self, endpoint: str, api_key: str):
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key

    def _request_json(self, method: str, url: str, body: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        headers = {
            "X-API-Key": self.api_key,
            "Accept": "application/json",
        }
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")

        req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                return json.loads(raw)
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
            try:
                return json.loads(raw) if raw else {"success": False, "error": f"HTTP {e.code}"}
            except Exception:
                return {"success": False, "error": f"HTTP {e.code}", "details": raw[:300]}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_episode(self, episode_id: str) -> Dict[str, Any]:
        payload = self._request_json("GET", f"{self.endpoint}/episodes/{episode_id}")
        if not payload.get("success"):
            raise RuntimeError(payload.get("error", "Failed to fetch episode"))
        return payload["data"]

    def get_show(self, show_id: str) -> Dict[str, Any]:
        payload = self._request_json("GET", f"{self.endpoint}/shows/{show_id}")
        if not payload.get("success"):
            raise RuntimeError(payload.get("error", "Failed to fetch show"))
        return payload["data"]

    def update_shot(self, shot_id: str, updates: Dict[str, Any]) -> None:
        payload = self._request_json("PUT", f"{self.endpoint}/shots/{shot_id}", updates)
        if not payload.get("success"):
            raise RuntimeError(payload.get("error", "Failed to update shot"))

    def update_video_clip_start_times(self, episode_id: str, video_clip_start_times: Dict[str, float]) -> None:
        payload = self._request_json(
            "PUT",
            f"{self.endpoint}/episodes/{episode_id}/av-preview",
            {"videoClipStartTimes": video_clip_start_times},
        )
        if not payload.get("success"):
            raise RuntimeError(payload.get("error", "Failed to update av-preview"))

    def upload_audio_clip(self, episode_id: str, audio_file_path: str) -> str:
        """Upload audio file and return URL"""
        import mimetypes
        url = f"{self.endpoint}/episodes/{episode_id}/audio-clips"
        
        # Read file
        with open(audio_file_path, "rb") as f:
            file_data = f.read()
        
        # Determine content type
        content_type, _ = mimetypes.guess_type(audio_file_path)
        if not content_type:
            content_type = "audio/mpeg"
        
        # Create multipart form data
        boundary = f"----WebKitFormBoundary{os.urandom(16).hex()}"
        filename = os.path.basename(audio_file_path)
        
        body_parts = []
        body_parts.append(f"--{boundary}".encode())
        body_parts.append(f'Content-Disposition: form-data; name="audio"; filename="{filename}"'.encode())
        body_parts.append(f"Content-Type: {content_type}".encode())
        body_parts.append(b"")
        body_parts.append(file_data)
        body_parts.append(f"--{boundary}--".encode())
        
        body = b"\r\n".join(body_parts)
        
        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }
        
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:  # Longer timeout for large files
                raw = resp.read().decode("utf-8", errors="replace")
                payload = json.loads(raw)
                if not payload.get("success"):
                    raise RuntimeError(payload.get("error", "Failed to upload audio"))
                return payload["data"]["url"]
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
            try:
                payload = json.loads(raw) if raw else {"error": f"HTTP {e.code}"}
                raise RuntimeError(payload.get("error", f"HTTP {e.code}"))
            except Exception:
                raise RuntimeError(f"HTTP {e.code}: {raw[:300]}")

    def update_audio_tracks(self, episode_id: str, audio_tracks: List[Dict[str, Any]]) -> None:
        """Update audioTracks in avPreviewData"""
        payload = self._request_json(
            "PUT",
            f"{self.endpoint}/episodes/{episode_id}/av-preview",
            {"audioTracks": audio_tracks},
        )
        if not payload.get("success"):
            raise RuntimeError(payload.get("error", "Failed to update audio tracks"))

    def import_av_script(self, episode_id: str, shots: List[Dict[str, Any]], target_segment_id: Optional[str] = None) -> Dict[str, Any]:
        """Import/update AV Script shots from Resolve (SRT-derived)"""
        body: Dict[str, Any] = {"shots": shots}
        if target_segment_id:
            body["targetSegmentId"] = target_segment_id
        endpoints = [
            f"{self.endpoint}/episodes/{episode_id}/av-script/import",
            f"{self.endpoint}/episodes/{episode_id}/av-script",
        ]
        last_error = None
        last_url = None
        for url in endpoints:
            last_url = url
            _log_to_file(f"IMPORT AV SCRIPT: Trying POST {url}")
            try:
                payload = self._request_json("POST", url, body)
                if payload.get("success"):
                    _log_to_file(f"IMPORT AV SCRIPT: Success via {url}")
                    return payload.get("data", {})
                last_error = payload.get("error", "Failed to import AV Script shots")
                _log_to_file(f"IMPORT AV SCRIPT: {url} returned error: {last_error}")
                # Retry on method not allowed if route not available
                if str(last_error).startswith("HTTP 405"):
                    _log_to_file(f"IMPORT AV SCRIPT: HTTP 405 on {url}, trying next endpoint...")
                    continue
                break
            except Exception as e:
                last_error = str(e)
                _log_to_file(f"IMPORT AV SCRIPT: Exception on {url}: {e}")
                if "405" in str(e) or "Method Not Allowed" in str(e):
                    continue
                break
        error_msg = f"Failed to import AV Script shots. Last endpoint tried: {last_url}. Error: {last_error}"
        _log_to_file(f"IMPORT AV SCRIPT: All endpoints failed. {error_msg}")
        raise RuntimeError(error_msg)

    def upload_shot_image(
        self,
        shot_id: str,
        image_file_path: str,
        episode_id: Optional[str] = None,
        segment_id: Optional[str] = None,
        mode: str = "replace",
    ) -> str:
        """Upload image file to a shot and return URL"""
        import mimetypes
        url = f"{self.endpoint}/shots/{shot_id}/images"

        with open(image_file_path, "rb") as f:
            file_data = f.read()

        content_type, _ = mimetypes.guess_type(image_file_path)
        if not content_type:
            content_type = "image/png"

        boundary = f"----WebKitFormBoundary{os.urandom(16).hex()}"
        filename = os.path.basename(image_file_path)

        body_parts = []
        body_parts.append(f"--{boundary}".encode())
        body_parts.append(f'Content-Disposition: form-data; name="mainImage"; filename="{filename}"'.encode())
        body_parts.append(f"Content-Type: {content_type}".encode())
        body_parts.append(b"")
        body_parts.append(file_data)

        # Optional fields
        body_parts.append(f"--{boundary}".encode())
        body_parts.append(b'Content-Disposition: form-data; name="mode"')
        body_parts.append(b"")
        body_parts.append(mode.encode())

        if episode_id:
            body_parts.append(f"--{boundary}".encode())
            body_parts.append(b'Content-Disposition: form-data; name="episodeId"')
            body_parts.append(b"")
            body_parts.append(str(episode_id).encode())
        if segment_id:
            body_parts.append(f"--{boundary}".encode())
            body_parts.append(b'Content-Disposition: form-data; name="segmentId"')
            body_parts.append(b"")
            body_parts.append(str(segment_id).encode())

        body_parts.append(f"--{boundary}--".encode())
        body = b"\r\n".join(body_parts)

        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }

        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=120) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                payload = json.loads(raw)
                if not payload.get("success"):
                    raise RuntimeError(payload.get("error", "Failed to upload image"))
                return payload["data"].get("mainImage") or payload["data"].get("url") or ""
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
            try:
                payload = json.loads(raw) if raw else {"error": f"HTTP {e.code}"}
                raise RuntimeError(payload.get("error", f"HTTP {e.code}"))
            except Exception:
                raise RuntimeError(f"HTTP {e.code}: {raw[:300]}")

    def upload_shot_video(
        self,
        shot_id: str,
        video_file_path: str,
        episode_id: Optional[str] = None,
        segment_id: Optional[str] = None,
        mode: str = "replace",
        set_main: bool = True,
    ) -> str:
        """Upload video file to a shot and return URL"""
        import mimetypes
        url = f"{self.endpoint}/shots/{shot_id}/videos"

        with open(video_file_path, "rb") as f:
            file_data = f.read()

        content_type, _ = mimetypes.guess_type(video_file_path)
        if not content_type:
            content_type = "video/mp4"

        boundary = f"----WebKitFormBoundary{os.urandom(16).hex()}"
        filename = os.path.basename(video_file_path)

        body_parts = []
        body_parts.append(f"--{boundary}".encode())
        body_parts.append(f'Content-Disposition: form-data; name="video"; filename="{filename}"'.encode())
        body_parts.append(f"Content-Type: {content_type}".encode())
        body_parts.append(b"")
        body_parts.append(file_data)

        # Optional fields
        body_parts.append(f"--{boundary}".encode())
        body_parts.append(b'Content-Disposition: form-data; name="mode"')
        body_parts.append(b"")
        body_parts.append(mode.encode())

        body_parts.append(f"--{boundary}".encode())
        body_parts.append(b'Content-Disposition: form-data; name="setMain"')
        body_parts.append(b"")
        body_parts.append(b"true" if set_main else b"false")

        if episode_id:
            body_parts.append(f"--{boundary}".encode())
            body_parts.append(b'Content-Disposition: form-data; name="episodeId"')
            body_parts.append(b"")
            body_parts.append(str(episode_id).encode())
        if segment_id:
            body_parts.append(f"--{boundary}".encode())
            body_parts.append(b'Content-Disposition: form-data; name="segmentId"')
            body_parts.append(b"")
            body_parts.append(str(segment_id).encode())

        body_parts.append(f"--{boundary}--".encode())
        body = b"\r\n".join(body_parts)

        headers = {
            "X-API-Key": self.api_key,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        }

        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
                payload = json.loads(raw)
                if not payload.get("success"):
                    raise RuntimeError(payload.get("error", "Failed to upload video"))
                return payload["data"].get("videoUrl") or payload["data"].get("url") or ""
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace") if hasattr(e, "read") else ""
            try:
                payload = json.loads(raw) if raw else {"error": f"HTTP {e.code}"}
                raise RuntimeError(payload.get("error", f"HTTP {e.code}"))
            except Exception:
                raise RuntimeError(f"HTTP {e.code}: {raw[:300]}")


def _collect_take_assets(shot: Dict[str, Any], api_endpoint: str = "") -> List[Tuple[str, str]]:
    """
    Returns list of (url, suggested_filename).
    Includes ALL images/videos from imageGenerationThread + main url + reference/start/end + audio files.
    """
    take = (shot.get("take") or "TAKE_UNKNOWN").replace("_image", "")
    assets: List[Tuple[str, str]] = []

    def add(url: Optional[str], name: str):
        resolved = _resolve_url(url, api_endpoint) if api_endpoint else url
        if resolved and isinstance(resolved, str):
            assets.append((resolved, name))

    # Main assets - use appropriate extension for images
    add(shot.get("videoUrl"), f"{take}_MAIN_video.mp4")
    image_url = shot.get("imageUrl")
    if image_url:
        # Determine image extension from URL, default to .jpg
        ext = ".jpg"
        if "." in image_url.split("?")[0]:
            url_ext = os.path.splitext(image_url.split("?")[0])[1].lower()
            if url_ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
                ext = url_ext
        add(image_url, f"{take}_MAIN_image{ext}")

    # Audio files from shot.audioFiles (legacy/direct audio files)
    audio_files = shot.get("audioFiles") or []
    for idx, audio_file in enumerate(audio_files):
        # Handle both dict and object-style audio files
        if isinstance(audio_file, dict):
            audio_url = audio_file.get("audioUrl")
            voice_name = audio_file.get("voiceName") or audio_file.get("voice", f"voice_{idx+1}")
        else:
            # Try attribute access
            audio_url = getattr(audio_file, "audioUrl", None) if hasattr(audio_file, "audioUrl") else None
            voice_name = getattr(audio_file, "voiceName", None) or getattr(audio_file, "voice", f"voice_{idx+1}")
        
        if audio_url:
            # Use .mp3 as default, but keep original extension if present in URL
            ext = ".mp3"
            if "." in audio_url.split("?")[0]:
                url_ext = os.path.splitext(audio_url.split("?")[0])[1].lower()
                if url_ext in [".mp3", ".wav", ".aac", ".m4a", ".ogg", ".mp4"]:
                    ext = url_ext
            add(audio_url, f"{take}_audio_{_safe_slug(str(voice_name))}{ext}")

    thread = shot.get("imageGenerationThread") or {}
    add(thread.get("referenceImage"), f"{take}_reference_image.jpg")
    add(thread.get("referenceVideo"), f"{take}_reference_video.mp4")
    add(thread.get("startFrame"), f"{take}_start_frame.jpg")
    add(thread.get("endFrame"), f"{take}_end_frame.jpg")
    add(thread.get("sketchImage"), f"{take}_sketch.jpg")

    for idx, img in enumerate(thread.get("generatedImages") or []):
        add(img.get("imageUrl"), f"{take}_gen_image_{idx+1}.jpg")

    for idx, vid in enumerate(thread.get("generatedVideos") or []):
        add(vid.get("videoUrl"), f"{take}_gen_video_{idx+1}.mp4")

    # Deduplicate by URL
    seen = set()
    out: List[Tuple[str, str]] = []
    for url, name in assets:
        if url in seen:
            continue
        seen.add(url)
        out.append((url, name))
    return out


def _collect_audio_track_assets(
    episode: Dict[str, Any],
    segment_id: Optional[str] = None,
    *,
    api_endpoint: str = "",
    log_callback=None,
) -> List[Tuple[str, str]]:
    """
    Collect audio assets from AV Preview audio tracks.
    Returns list of (url, suggested_filename).
    If segment_id is provided, only collect audio clips that belong to shots in that segment.
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            _log_to_file(msg)
    
    assets: List[Tuple[str, str]] = []
    seen_urls = set()
    
    def add(url: Optional[str], name: str):
        resolved = _resolve_url(url, api_endpoint) if api_endpoint else url
        if resolved and isinstance(resolved, str) and resolved not in seen_urls:
            seen_urls.add(resolved)
            assets.append((resolved, name))
    
    # Debug: Check episode structure
    log(f"DEBUG: Checking episode for avPreviewData...")
    log(f"DEBUG: Episode keys: {list(episode.keys())[:10]}...")
    
    av_preview = episode.get("avPreviewData")
    log(f"DEBUG: avPreviewData type: {type(av_preview)}, value: {av_preview is not None}")
    
    if av_preview is None:
        log(f"WARNING: episode.avPreviewData is None or missing")
        return assets
    
    if not isinstance(av_preview, dict):
        log(f"WARNING: episode.avPreviewData is not a dict (type: {type(av_preview)})")
        return assets
    
    log(f"DEBUG: avPreviewData keys: {list(av_preview.keys())}")
    
    audio_tracks = av_preview.get("audioTracks") or []
    log(f"DEBUG: audioTracks type: {type(audio_tracks)}, count: {len(audio_tracks) if isinstance(audio_tracks, list) else 0}")
    
    if not audio_tracks:
        log(f"INFO: No audio tracks found in avPreviewData.audioTracks")
        return assets
    
    log(f"INFO: Found {len(audio_tracks)} audio track(s) in AV Preview")
    
    # If segment_id provided, get shot IDs from that segment to filter audio clips
    relevant_shot_ids = set()
    if segment_id:
        segments = ((episode.get("avScript") or {}).get("segments") or [])
        seg = next((s for s in segments if s.get("id") == segment_id), None)
        if seg:
            for shot in seg.get("shots") or []:
                relevant_shot_ids.add(shot.get("id"))
    
    for track_idx, track in enumerate(audio_tracks):
        track_name = track.get("name") or track.get("id") or f"Track_{track_idx+1}"
        track_type = track.get("type") or "audio"
        clips = track.get("clips") or []
        
        log(f"DEBUG: Track {track_idx+1}: '{track_name}' (type: {track_type}), {len(clips)} clip(s)")
        
        for clip_idx, clip in enumerate(clips):
            if not isinstance(clip, dict):
                log(f"WARNING: Clip {clip_idx+1} in track '{track_name}' is not a dict (type: {type(clip)})")
                continue
                
            clip_url = clip.get("url")
            clip_name = clip.get("name") or clip.get("id") or f"clip_{clip_idx+1}"
            
            log(f"DEBUG:   Clip {clip_idx+1}: '{clip_name}', URL: {clip_url[:80] + '...' if clip_url and len(clip_url) > 80 else clip_url}")
            
            # Filter by segment if specified (check if clip name/id references a shot)
            if segment_id and relevant_shot_ids:
                # Try to extract shot ID from clip name/id if it contains shot ID
                clip_shot_match = False
                for shot_id in relevant_shot_ids:
                    if shot_id in str(clip.get("id", "")) or shot_id in str(clip.get("name", "")):
                        clip_shot_match = True
                        break
                # If we can't determine relevance, include it anyway (better to download extra than miss)
                # Actually, let's include all audio tracks for now since they might span multiple segments
                pass
            
            if clip_url:
                # Determine file extension
                ext = ".mp3"
                if "." in clip_url.split("?")[0]:
                    url_ext = os.path.splitext(clip_url.split("?")[0])[1].lower()
                    if url_ext in [".mp3", ".wav", ".aac", ".m4a", ".ogg", ".mp4", ".flac"]:
                        ext = url_ext
                
                # Create filename: TrackName_ClipName_ClipId.ext
                safe_track = _safe_slug(str(track_name))
                safe_clip = _safe_slug(str(clip_name))
                clip_id_short = str(clip.get("id", ""))[-8:] if clip.get("id") else f"{clip_idx+1:03d}"
                filename = f"AVPreview_{safe_track}_{safe_clip}_{clip_id_short}{ext}"
                
                add(clip_url, filename)
                log(f"DEBUG:     Added audio asset: {filename}")
            else:
                log(f"WARNING: Clip {clip_idx+1} in track '{track_name}' has no URL")
    
    log(f"INFO: Collected {len(assets)} audio track asset(s) total")
    return assets


def _get_timeline_settings(timeline: Any) -> Tuple[float, float, str]:
    fps_raw = timeline.GetSetting("timelineFrameRate")
    fps = float(fps_raw) if fps_raw else 24.0
    start_tc = timeline.GetStartTimecode() or "00:00:00:00"
    parts = start_tc.split(":")
    tl_start_sec = 0.0
    if len(parts) == 4:
        tl_start_sec = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2]) + (int(parts[3]) / fps)
    return fps, tl_start_sec, start_tc


def _extract_take_and_visual(content: str) -> Tuple[Optional[str], str]:
    take_match = re.search(r"\[?\s*(SC\d{2}T\d{2})\s*\]?", content, re.IGNORECASE)
    if take_match:
        take = take_match.group(1).upper()
        visual_desc = re.sub(r"\[?\s*SC\d{2}T\d{2}\s*\]?\s*-?\s*", "", content, flags=re.IGNORECASE).strip()
        return take, visual_desc
    return None, content.strip()


def _collect_subtitle_entries(
    timeline: Any,
    fps: float,
    tl_start_sec: float,
    log_callback: Optional[Callable[[str], None]] = None
) -> List[Dict[str, Any]]:
    get_track_count = _method(timeline, "GetTrackCount")
    get_items = _method(timeline, "GetItemListInTrack")
    if not get_track_count or not get_items:
        raise RuntimeError("Cannot read timeline tracks (API missing).")

    s_tracks = int(timeline.GetTrackCount("subtitle") or 0)
    if s_tracks == 0:
        raise RuntimeError("No subtitle tracks found. Create subtitles first in format: [SC01T01] - Visual description")

    if log_callback:
        log_callback(f"EXPORT: Scanning {s_tracks} subtitle track(s)...")

    entries: List[Dict[str, Any]] = []
    for t in range(1, s_tracks + 1):
        items = timeline.GetItemListInTrack("subtitle", t) or []
        for it in items:
            try:
                content = ""
                try:
                    content = it.GetName()
                except Exception:
                    pass
                if not content:
                    try:
                        fn = _method(it, "GetText")
                        if fn:
                            content = fn()
                    except Exception:
                        pass
                if not content:
                    try:
                        prop_fn = _method(it, "GetProperty")
                        if prop_fn:
                            content = prop_fn("Text") or prop_fn("Caption")
                    except Exception:
                        pass
                if not content:
                    continue

                start_frame = None
                dur_frame = None
                for m in ["GetStart", "GetStartFrame"]:
                    fn = _method(it, m)
                    if fn:
                        try:
                            start_frame = int(fn())
                            break
                        except Exception:
                            pass
                for m in ["GetDuration", "GetDurationFrames"]:
                    fn = _method(it, m)
                    if fn:
                        try:
                            dur_frame = int(fn())
                            break
                        except Exception:
                            pass
                if start_frame is None or dur_frame is None:
                    if log_callback:
                        log_callback("EXPORT: Skipping subtitle - could not read timing")
                    continue

                rel_start_sec = (start_frame - int(tl_start_sec * fps)) / fps
                dur_sec = dur_frame / fps
                take, visual_desc = _extract_take_and_visual(content)
                entries.append({
                    "take": take,
                    "visual": visual_desc,
                    "start": rel_start_sec,
                    "duration": dur_sec,
                    "text": content,
                })
            except Exception as e:
                if log_callback:
                    log_callback(f"EXPORT: Error reading subtitle item: {e}")
                continue

    entries.sort(key=lambda x: x["start"])
    return entries


def _collect_main_track_clips(
    timeline: Any,
    fps: float,
    tl_start_sec: float,
    log_callback: Optional[Callable[[str], None]] = None
) -> List[Dict[str, Any]]:
    get_track_count = _method(timeline, "GetTrackCount")
    get_items = _method(timeline, "GetItemListInTrack")
    if not get_track_count or not get_items:
        raise RuntimeError("Cannot read timeline tracks (API missing).")

    v_tracks = int(timeline.GetTrackCount("video") or 0)
    if v_tracks == 0:
        raise RuntimeError("No video tracks found in timeline.")

    main_track_idx = None
    for idx in range(1, v_tracks + 1):
        try:
            get_track_name = _method(timeline, "GetTrackName")
            if get_track_name:
                name_result = timeline.GetTrackName("video", idx)
                if name_result and str(name_result).strip().upper() == "MAIN":
                    main_track_idx = idx
                    break
        except Exception:
            pass

    if main_track_idx is None:
        raise RuntimeError("No video track named 'MAIN' found. Please rename your main track to MAIN.")

    items = timeline.GetItemListInTrack("video", main_track_idx) or []
    clips: List[Dict[str, Any]] = []
    for item_idx, item in enumerate(items):
        try:
            item_name = getattr(item, "GetName", lambda: "(unknown)")()
            start_frame = None
            dur_frame = None
            for m in ["GetStart", "GetStartFrame"]:
                fn = _method(item, m)
                if fn:
                    try:
                        start_frame = int(fn())
                        break
                    except Exception:
                        pass
            for m in ["GetDuration", "GetDurationFrames"]:
                fn = _method(item, m)
                if fn:
                    try:
                        dur_frame = int(fn())
                        break
                    except Exception:
                        pass
            if start_frame is None or dur_frame is None:
                if log_callback:
                    log_callback(f"EXPORT SRT+VIDEO: Skipping clip '{item_name}' - could not read timing")
                continue

            rel_start_sec = (start_frame - int(tl_start_sec * fps)) / fps
            dur_sec = dur_frame / fps

            offset_frame = 0
            for prop_name in ["SourceStart", "In", "StartFrame"]:
                try:
                    get_prop = _method(item, "GetProperty")
                    if get_prop:
                        prop_val = get_prop(prop_name)
                        if prop_val is not None:
                            offset_frame = int(prop_val)
                            break
                except Exception:
                    pass
            offset_sec = offset_frame / fps

            media_pool_item = None
            try:
                get_mp_item = _method(item, "GetMediaPoolItem")
                if get_mp_item:
                    media_pool_item = item.GetMediaPoolItem()
            except Exception:
                pass
            if not media_pool_item:
                if log_callback:
                    log_callback(f"EXPORT SRT+VIDEO: Warning: no MediaPoolItem for '{item_name}', skipping")
                continue

            # Extract take code from item name first (this is the source of truth)
            take_match = re.search(r"(SC\d{2}T\d{2})", item_name, re.IGNORECASE)
            if not take_match:
                if log_callback:
                    log_callback(f"EXPORT SRT+VIDEO: Skipping '{item_name}' - no SCxxTxx in item name")
                continue
            take = take_match.group(1).upper()  # Keep this - don't overwrite!

            file_path = None
            try:
                get_file_path = _method(media_pool_item, "GetClipProperty")
                if get_file_path:
                    # Try multiple property names
                    for prop_name in ["File Path", "FilePath", "File"]:
                        try:
                            props = media_pool_item.GetClipProperty([prop_name])
                            if props and isinstance(props, dict):
                                file_path = props.get(prop_name) or props.get("File Path") or props.get("FilePath")
                                if file_path:
                                    break
                        except Exception:
                            pass
                    
                    # If dict didn't work, try direct property access
                    if not file_path:
                        try:
                            file_path = media_pool_item.GetClipProperty("File Path")
                        except Exception:
                            pass
            except Exception as e:
                if log_callback:
                    log_callback(f"EXPORT SRT+VIDEO: Error getting file path: {e}")
            
            if not file_path:
                if log_callback:
                    log_callback(f"EXPORT SRT+VIDEO: Warning: Could not get file path for '{item_name}', but found take {take} - will try to use item name")
                # Use item name as fallback - extract extension from it
                base_name = item_name
            elif not os.path.exists(file_path):
                if log_callback:
                    log_callback(f"EXPORT SRT+VIDEO: Warning: Source file not found at '{file_path}' for '{item_name}', but found take {take} - will try to use item name")
                # File doesn't exist, but we have take code - use item name
                base_name = item_name
            else:
                base_name = os.path.basename(file_path)
            
            # IMPORTANT: Don't overwrite take code from filename - item_name is the source of truth
            # The file path might be in a folder with a different take code, but the timeline item name is correct
            # Only log if there's a mismatch for debugging
            filename_take_match = re.search(r"(SC\d{2}T\d{2})", base_name, re.IGNORECASE)
            if filename_take_match:
                filename_take = filename_take_match.group(1).upper()
                if filename_take != take:
                    if log_callback:
                        log_callback(f"EXPORT SRT+VIDEO: Note: Item name has take {take} but filename has {filename_take} - using {take} from item name")
            ext = os.path.splitext(base_name)[1].lower()
            is_image = ext in [".png", ".jpg", ".jpeg", ".webp", ".gif"]
            clip_type = "image" if is_image else "video"

            clips.append({
                "take": take,
                "file_path": file_path,  # May be None if file not found, but we still have take code
                "start": rel_start_sec,
                "duration": dur_sec,
                "offset": offset_sec,
                "item_name": item_name,
                "clip_type": clip_type,
                "track_index": main_track_idx,
                "item_index": item_idx,
            })
        except Exception as e:
            if log_callback:
                log_callback(f"EXPORT SRT+VIDEO: Error processing clip: {e}")
            continue

    return clips


def _download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    # urllib is strict about URL escaping; many of our asset URLs can contain spaces/() etc.
    # Normalize by percent-encoding only the path portion (keep query as-is).
    try:
        parts = urllib.parse.urlsplit(url)
        safe_path = urllib.parse.quote(parts.path, safe="/%:@")
        safe_url = urllib.parse.urlunsplit((parts.scheme, parts.netloc, safe_path, parts.query, parts.fragment))
    except Exception:
        safe_url = url

    _log_to_file(f"DOWNLOAD: {safe_url} -> {dest}")
    req = urllib.request.Request(safe_url, headers={"User-Agent": "ConceptoResolveSync/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        try:
            status = getattr(resp, "status", None)
            _log_to_file(f"DOWNLOAD: HTTP status={status}")
        except Exception:
            pass
        with open(dest, "wb") as f:
            while True:
                chunk = resp.read(1024 * 256)
                if not chunk:
                    break
                f.write(chunk)
    _log_to_file(f"DOWNLOAD: OK {dest} ({dest.stat().st_size if dest.exists() else 'n/a'} bytes)")


def _timecode_to_frames(tc: str, fps: float) -> int:
    try:
        parts = tc.strip().split(":")
        if len(parts) != 4:
            return 0
        hh, mm, ss, ff = [int(p) for p in parts]
        return int(round((((hh * 60 + mm) * 60) + ss) * fps + ff))
    except Exception:
        return 0


def _frames_to_timecode(frames: int, fps: float) -> str:
    if fps <= 0:
        fps = 24.0
    frames = max(0, int(frames))
    ff = frames % int(round(fps))
    total_seconds = frames // int(round(fps))
    ss = total_seconds % 60
    total_minutes = total_seconds // 60
    mm = total_minutes % 60
    hh = total_minutes // 60
    return f"{hh:02d}:{mm:02d}:{ss:02d}:{ff:02d}"


def resolve_get_context() -> Tuple[Any, Any, Any]:
    resolve = dvr_script.scriptapp("Resolve")
    if not resolve:
        raise RuntimeError("Could not connect to DaVinci Resolve. Make sure Resolve is running.")
    pm = resolve.GetProjectManager()
    if not pm:
        raise RuntimeError("Could not get ProjectManager.")
    project = pm.GetCurrentProject()
    if not project:
        raise RuntimeError("No current project open in Resolve.")
    media_pool = project.GetMediaPool()
    if not media_pool:
        raise RuntimeError("Could not get MediaPool.")
    return resolve, project, media_pool


def resolve_ensure_bins(media_pool: Any, root_name: str, segment_name: str, take_name: str) -> Any:
    """
    Create or find: RootFolder / root_name / segment_name / take_name
    Returns the take folder object.
    """
    root = media_pool.GetRootFolder()
    add_folder = _method(media_pool, "AddSubFolder")
    get_folders = _method(root, "GetSubFolderList")
    if not add_folder or not get_folders:
        raise RuntimeError("Resolve API missing folder methods (AddSubFolder/GetSubFolderList).")

    def find_or_create(parent: Any, name: str) -> Any:
        for f in parent.GetSubFolderList() or []:
            if getattr(f, "GetName", lambda: "")() == name:
                return f
        return media_pool.AddSubFolder(parent, name)

    concepto_folder = find_or_create(root, root_name)
    seg_folder = find_or_create(concepto_folder, segment_name)
    take_folder = find_or_create(seg_folder, take_name)
    return take_folder


def resolve_import_files(media_pool: Any, folder: Any, files: List[str]) -> List[Any]:
    """
    Imports files into the provided folder/bin. Returns list of MediaPoolItems.
    """
    set_current = _method(media_pool, "SetCurrentFolder")
    imp = _method(media_pool, "ImportMedia")
    if not set_current or not imp:
        raise RuntimeError("Resolve API missing ImportMedia/SetCurrentFolder.")
    media_pool.SetCurrentFolder(folder)
    items = media_pool.ImportMedia(files)
    return items or []


def resolve_place_on_timeline(project: Any, media_pool: Any, timeline: Any, item: Any, *,
                              record_seconds: float, duration_seconds: float, offset_seconds: float,
                              log_callback=None, track_index: int = 1, track_type: str = "video") -> None:
    """
    Place media pool item on timeline with precise positioning.
    
    According to DaVinci Resolve API:
    - startFrame: Source IN point (trim start) - where to start reading from the clip
    - endFrame: Source OUT point (trim end) - where to stop reading from the clip
    - recordFrame: Timeline position - where on the timeline to place the clip
    - trackIndex: Which video track (1-based)
    
    Duration = endFrame - startFrame
    """
    def log(msg):
        if log_callback:
            log_callback(msg)
        else:
            _log_to_file(msg)
    
    # Get timeline frame rate
    fps_raw = None
    try:
        fps_raw = timeline.GetSetting("timelineFrameRate")
    except Exception as e:
        log(f"Warning: Could not get timeline frame rate: {e}")
    try:
        fps = float(fps_raw) if fps_raw else 24.0
    except Exception:
        fps = 24.0
    log(f"Timeline FPS: {fps}")

    # Ensure minimum duration (at least 1 frame)
    if duration_seconds < 0.1:
        duration_seconds = 1.0
        log(f"Warning: Duration too small ({duration_seconds}s), using 1.0s minimum")
    
    # Get timeline start timecode (Resolve timelines often start at 01:00:00:00)
    timeline_start_frame = 0
    try:
        get_start_tc = _method(timeline, "GetStartTimecode")
        if get_start_tc:
            start_tc_str = timeline.GetStartTimecode()
            if start_tc_str and isinstance(start_tc_str, str) and ":" in start_tc_str:
                # Parse timecode like "01:00:00:00"
                try:
                    parts = start_tc_str.split(":")
                    if len(parts) == 4:
                        h, m, s, f = map(int, parts)
                        timeline_start_sec = h * 3600 + m * 60 + s + (f / fps)
                        timeline_start_frame = int(round(timeline_start_sec * fps))
                        log(f"Timeline start timecode: {start_tc_str} ({timeline_start_frame} frames)")
                except Exception:
                    pass
    except Exception as e:
        log(f"Could not get timeline start timecode: {e}")
    
    # Calculate frames
    # recordFrame: timeline position (where to place on timeline) - MUST be relative to timeline start
    record_frame = max(0, int(round(record_seconds * fps))) + timeline_start_frame
    
    # startFrame: source in point (trim start) - offset into source clip
    start_frame = max(0, int(round(offset_seconds * fps)))
    
    # duration_frames: how many frames to play from source
    duration_frames = max(1, int(round(duration_seconds * fps)))
    
    # endFrame: source out point (trim end) = startFrame + duration
    end_frame = start_frame + duration_frames
    
    log(f"Frame calculations:")
    log(f"  Timeline position (recordFrame): {record_frame} ({record_seconds:.3f}s)")
    log(f"  Source trim IN (startFrame): {start_frame} ({offset_seconds:.3f}s)")
    log(f"  Source trim OUT (endFrame): {end_frame} ({offset_seconds + duration_seconds:.3f}s)")
    log(f"  Duration: {duration_frames} frames ({duration_seconds:.3f}s)")
    
    # Validate: endFrame must be > startFrame
    if end_frame <= start_frame:
        duration_frames = int(fps)  # At least 1 second
        end_frame = start_frame + duration_frames
        log(f"Warning: Invalid frame range, adjusted to duration={duration_frames} frames")
    
    # Get the actual clip duration to validate our trim
    clip_duration_frames = None
    try:
        get_duration = _method(item, "GetClipProperty")
        if get_duration:
            props = item.GetClipProperty(["Duration"])
            if props and isinstance(props, dict):
                clip_duration_str = props.get("Duration")
                if clip_duration_str:
                    # Try parsing as timecode "HH:MM:SS:FF"
                    if isinstance(clip_duration_str, str) and ":" in clip_duration_str:
                        try:
                            parts = clip_duration_str.split(":")
                            if len(parts) == 4:
                                h, m, s, f = map(int, parts)
                                total_sec = h * 3600 + m * 60 + s + (f / fps)
                                clip_duration_frames = int(round(total_sec * fps))
                            else:
                                # Try as float seconds
                                clip_duration_frames = int(round(float(clip_duration_str) * fps))
                        except:
                            pass
                    else:
                        # Try as float (seconds) or int (frames)
                        try:
                            val = float(clip_duration_str)
                            clip_duration_frames = int(round(val * fps)) if val < 1000 else int(val)
                        except:
                            pass
        if clip_duration_frames:
            log(f"  Clip actual duration: {clip_duration_frames} frames")
            if end_frame > clip_duration_frames:
                log(f"  Warning: Trim end ({end_frame}) exceeds clip duration ({clip_duration_frames}), clamping")
                end_frame = clip_duration_frames
            # CRITICAL: Ensure end_frame > start_frame after clamping
            if end_frame <= start_frame:
                log(f"  ERROR: After clamping, end_frame ({end_frame}) <= start_frame ({start_frame})")
                start_frame = 0
                end_frame = max(int(fps), min(clip_duration_frames, int(fps * 3)))  # At least 1s, max 3s or clip length
                duration_frames = end_frame - start_frame
                log(f"  Fixed: start_frame={start_frame}, end_frame={end_frame}, duration={duration_frames} frames")
    except Exception as e:
        log(f"  Could not get clip duration: {e}")
    
    # FINAL VALIDATION: Must have valid duration before placement
    if end_frame <= start_frame:
        log(f"  ERROR: Invalid frame range: start={start_frame}, end={end_frame}. Forcing minimum 1 second.")
        start_frame = 0
        end_frame = int(fps)  # 1 second minimum
        duration_frames = end_frame - start_frame
        record_frame = max(0, record_frame)  # Ensure valid timeline position
    log(f"  FINAL: start_frame={start_frame}, end_frame={end_frame}, duration={duration_frames} frames, record_frame={record_frame}")

    mp_append = _method(media_pool, "AppendToTimeline")
    tl_append = _method(timeline, "AppendToTimeline")
    tl_insert_clips = _method(timeline, "InsertClips")
    if not mp_append and not tl_append and not tl_insert_clips:
        raise RuntimeError("Resolve API missing AppendToTimeline/InsertClips; cannot place items on timeline.")
    get_items = _method(timeline, "GetItemListInTrack")

    def track_count_now() -> Optional[int]:
        if not get_items:
            return None
        try:
            return len(timeline.GetItemListInTrack(track_type, int(track_index)) or [])
        except Exception:
            return None

    # CRITICAL: Ensure timeline is current and unlocked before placement
    try:
        project.SetCurrentTimeline(timeline)
        log("Set timeline as current before placement")
    except Exception as e:
        log(f"Warning: Could not set timeline as current: {e}")
    
    # Try multiple approaches - Resolve API varies significantly across versions
    # Method 1: MediaPool.AppendToTimeline with dict (most precise, supports trim)
    timeline_dict_base = {
        "mediaPoolItem": item,
        "startFrame": start_frame,      # Source IN point
        "endFrame": end_frame,          # Source OUT point  
        "recordFrame": record_frame,    # Timeline position
    }
    
    for attempt in range(4):
        try:
            before_n = track_count_now()
            if attempt == 0:
                # Try with trackIndex (preferred when supported)
                log(f"Attempt {attempt+1}: MediaPool.AppendToTimeline dict trackType={track_type} trackIndex={track_index}...")
                timeline_dict = {**timeline_dict_base, "trackIndex": track_index, "trackType": track_type}
            elif attempt == 1:
                # Try without trackIndex but with trackType
                log(f"Attempt {attempt+1}: MediaPool.AppendToTimeline dict trackType={track_type} (no trackIndex)...")
                timeline_dict = {**timeline_dict_base, "trackType": track_type}
            elif attempt == 2:
                # Try minimal dict (no track specification)
                log(f"Attempt {attempt+1}: AppendToTimeline (minimal dict)...")
                timeline_dict = timeline_dict_base
            else:
                # Try with both trackIndex and trackType
                log(f"Attempt {attempt+1}: MediaPool.AppendToTimeline dict trackIndex={track_index} + trackType={track_type}...")
                timeline_dict = {**timeline_dict_base, "trackIndex": track_index, "trackType": track_type}
                
            result = media_pool.AppendToTimeline([timeline_dict])
            log(f"  Result: {result} (type: {type(result).__name__})")
            
            # Success if result is truthy or a list
            if result is not False and result is not None:
                after_n = track_count_now()
                if before_n is not None and after_n is not None and after_n <= before_n:
                    log(f"  WARNING: API returned success but track item count did not increase ({before_n}->{after_n}); trying next method.")
                    continue
                if isinstance(result, list) and len(result) > 0:
                    log(f"✓ Timeline placement successful! Created {len(result)} timeline item(s)")
                    # Verify the item is actually visible on the timeline
                    import time
                    time.sleep(0.1)  # Delay for Resolve to process
                    # Verify item exists and has valid duration
                    verify_items = timeline.GetItemListInTrack(track_type, track_index) or []
                    if verify_items:
                        last_item = verify_items[-1]
                        try:
                            get_start = _method(last_item, "GetStart")
                            get_end = _method(last_item, "GetEnd")
                            if get_start and get_end:
                                item_start = last_item.GetStart()
                                item_end = last_item.GetEnd()
                                item_dur = item_end - item_start if item_end > item_start else 0
                                log(f"  Verified: Timeline item start={item_start}, end={item_end}, duration={item_dur} frames")
                                if item_dur <= 0:
                                    log(f"  WARNING: Timeline item has zero/negative duration! This may be why it's invisible.")
                                else:
                                    log(f"  ✓ Clip should be visible on timeline")
                        except Exception as e:
                            log(f"  Could not verify timeline item: {e}")
                    return
                elif result is True:
                    log(f"✓ Timeline placement successful (returned True)")
                    import time
                    time.sleep(0.1)
                    return
                else:
                    log(f"✓ Timeline placement successful (returned truthy value)")
                    return
            else:
                log(f"  Attempt {attempt+1} returned False/None, trying next method...")
                
        except Exception as e:
            log(f"  Attempt {attempt+1} failed: {type(e).__name__}: {e}")
            if attempt < 3:
                continue
            # Last attempt failed, continue to fallback

    # Fallback 1: Try InsertClip if available (alternative API method)
    insert_clip = _method(timeline, "InsertClip")
    if insert_clip:
        try:
            log("Fallback 1: Trying InsertClip method...")
            tc_str = _seconds_to_timecode(record_seconds, fps)
            log(f"  Setting playhead to {tc_str} (frame {record_frame})...")
            timeline.SetCurrentTimecode(tc_str)
            
            # Try to get file path from media pool item
            file_url = None
            get_url = _method(item, "GetClipProperty")
            if get_url:
                try:
                    props = item.GetClipProperty(["File Path"])
                    if props and isinstance(props, dict):
                        file_url = props.get("File Path")
                    if not file_url:
                        props = item.GetClipProperty(["FileURL"])
                        if props and isinstance(props, dict):
                            file_url = props.get("FileURL")
                except Exception:
                    pass
            
            if file_url:
                timeline_item = timeline.InsertClip(file_url, tc_str, track_index)
                if timeline_item:
                    log(f"✓ InsertClip successful! Timeline item created.")
                    # Try to trim after placement
                    try:
                        set_start = _method(timeline_item, "SetProperty")
                        if set_start:
                            # Try to set trim points
                            timeline_item.SetProperty("Start", start_frame)
                            timeline_item.SetProperty("End", end_frame)
                            log(f"  Applied trim: start={start_frame}, end={end_frame}")
                    except Exception:
                        pass
                    return
            else:
                log("  Could not get file path from MediaPoolItem for InsertClip")
        except Exception as e:
            log(f"  InsertClip failed: {type(e).__name__}: {e}")
    
    # Fallback 2: move playhead then append item list (no precise trimming)
    # record_frame already includes timeline_start_frame, so use it directly
    tc_str = _frames_to_timecode(record_frame, fps)

    if tl_insert_clips:
        try:
            before_n = track_count_now()
            log(f"Fallback 2a: Using Timeline.InsertClips trackType={track_type} at {tc_str} trackIndex={track_index}...")
            result = timeline.InsertClips([item], tc_str, track_index)
            log(f"  InsertClips returned: {result}")
            after_n = track_count_now()
            if result is not False and result is not None and (before_n is None or after_n is None or after_n > before_n):
                log("✓ InsertClips placed item (fallback).")
                return
        except Exception as e:
            log(f"  InsertClips failed: {type(e).__name__}: {e}")

    if tl_append:
        try:
            before_n = track_count_now()
            log(f"Fallback 2b: Using Timeline.AppendToTimeline at {tc_str}...")
            set_tc = _method(timeline, "SetCurrentTimecode")
            if set_tc:
                timeline.SetCurrentTimecode(tc_str)
            result = timeline.AppendToTimeline([item])
            log(f"  Timeline.AppendToTimeline returned: {result}")
            after_n = track_count_now()
            if result is not False and result is not None and (before_n is None or after_n is None or after_n > before_n):
                log("✓ Timeline.AppendToTimeline placed item (fallback).")
                return
        except Exception as e:
            log(f"  Timeline.AppendToTimeline failed: {type(e).__name__}: {e}")

    log("Fallback 2c: Using MediaPool.AppendToTimeline (simple append, may ignore playhead)...")
    set_tc = _method(timeline, "SetCurrentTimecode")
    if set_tc:
        try:
            log(f"  Setting playhead to {tc_str} (frame {record_frame}, timeline start offset {timeline_start_frame})...")
            timeline.SetCurrentTimecode(tc_str)
        except Exception as e:
            log(f"  SetCurrentTimecode failed: {type(e).__name__}: {e}")

    try:
        before_n = track_count_now()
        log("  Appending item to timeline...")
        result = media_pool.AppendToTimeline([item])
        log(f"  AppendToTimeline returned: {result}")
        after_n = track_count_now()
        if result is not False and result is not None and (before_n is None or after_n is None or after_n > before_n):
            log("✓ Item placed (fallback method). Note: Trim/offset NOT applied - may need manual adjustment.")
            # Try to trim after placement using TimelineItem methods
            try:
                import time
                time.sleep(0.1)
                if get_items:
                    items = timeline.GetItemListInTrack(track_type, track_index) or []
                    if items:
                        # Get the last item (should be the one we just added)
                        timeline_item = items[-1]
                        set_start = _method(timeline_item, "SetProperty")
                        if set_start:
                            try:
                                timeline_item.SetProperty("Start", start_frame)
                                timeline_item.SetProperty("End", end_frame)
                                log(f"  Applied trim after placement: start={start_frame}, end={end_frame}")
                            except Exception:
                                pass
            except Exception:
                pass
            return
    except Exception as e:
        log(f"  Fallback AppendToTimeline failed: {type(e).__name__}: {e}")

    raise RuntimeError("All timeline placement methods failed.")


def _audio_clip_filename(track: Dict[str, Any], clip: Dict[str, Any]) -> str:
    track_name = track.get("name") or track.get("id") or "Track"
    clip_name = clip.get("name") or clip.get("id") or "clip"
    clip_id_short = str(clip.get("id", ""))[-8:] if clip.get("id") else "000"
    url = (clip.get("url") or "").split("?")[0]
    ext = ".mp3"
    try:
        url_ext = os.path.splitext(url)[1].lower()
        if url_ext in [".mp3", ".wav", ".aac", ".m4a", ".ogg", ".mp4", ".flac"]:
            ext = url_ext
    except Exception:
        pass
    safe_track = _safe_slug(str(track_name))
    safe_clip = _safe_slug(str(clip_name))
    return f"AVPreview_{safe_track}_{safe_clip}_{clip_id_short}{ext}"


def resolve_get_or_create_timeline(project: Any, timeline_name: str) -> Any:
    """
    Returns an existing timeline with name or creates a new empty timeline.
    """
    get_tl = _method(project, "GetCurrentTimeline")
    get_list = _method(project, "GetTimelineCount")
    get_by_idx = _method(project, "GetTimelineByIndex")
    set_current = _method(project, "SetCurrentTimeline")

    if get_list and get_by_idx:
        count = int(project.GetTimelineCount() or 0)
        for i in range(1, count + 1):
            tl = project.GetTimelineByIndex(i)
            if tl and getattr(tl, "GetName", lambda: "")() == timeline_name:
                if set_current:
                    project.SetCurrentTimeline(tl)
                return tl

    # Create timeline: MediaPool.CreateEmptyTimeline exists on some installs
    mp = project.GetMediaPool()
    create_empty = _method(mp, "CreateEmptyTimeline")
    if create_empty:
        tl = mp.CreateEmptyTimeline(timeline_name)
        if tl and set_current:
            project.SetCurrentTimeline(tl)
        return tl

    # Fallback: use current timeline
    tl = project.GetCurrentTimeline() if get_tl else None
    if not tl:
        raise RuntimeError("No timeline available and cannot create one (missing CreateEmptyTimeline).")
    return tl


class MainWindow(QtWidgets.QWidget):  # type: ignore
    def __init__(self):
        super().__init__()
        self.setWindowTitle("Concepto Resolve Sync")
        self.resize(880, 640)

        self.cfg = PluginConfig.load()
        self.client: Optional[ConceptoClient] = None
        self.episode: Optional[Dict[str, Any]] = None
        self.show: Optional[Dict[str, Any]] = None
        self.selected_segment_id: Optional[str] = None

        self._build_ui()

    def _build_ui(self):
        layout = QtWidgets.QVBoxLayout(self)

        # Version timestamp (top right)
        version_label = QtWidgets.QLabel(f"Latest version updated at: {PLUGIN_VERSION_TIMESTAMP}")
        version_label.setAlignment(QtCore.Qt.AlignRight)
        version_label.setStyleSheet("color: gray; font-size: 9px;")
        layout.addWidget(version_label)

        # Config row
        cfg_box = QtWidgets.QGroupBox("API Configuration")
        cfg_layout = QtWidgets.QGridLayout(cfg_box)

        self.endpoint_edit = QtWidgets.QLineEdit(self.cfg.api_endpoint)
        self.key_edit = QtWidgets.QLineEdit(self.cfg.api_key)
        self.key_edit.setEchoMode(QtWidgets.QLineEdit.Password)
        self.show_edit = QtWidgets.QLineEdit(self.cfg.show_id)
        self.episode_edit = QtWidgets.QLineEdit(self.cfg.episode_id)
        self.download_root_edit = QtWidgets.QLineEdit(self.cfg.download_root)

        cfg_layout.addWidget(QtWidgets.QLabel("API Endpoint:"), 0, 0)
        cfg_layout.addWidget(self.endpoint_edit, 0, 1)
        cfg_layout.addWidget(QtWidgets.QLabel("API Key:"), 1, 0)
        cfg_layout.addWidget(self.key_edit, 1, 1)
        cfg_layout.addWidget(QtWidgets.QLabel("Show ID:"), 2, 0)
        cfg_layout.addWidget(self.show_edit, 2, 1)
        cfg_layout.addWidget(QtWidgets.QLabel("Episode ID:"), 3, 0)
        cfg_layout.addWidget(self.episode_edit, 3, 1)
        cfg_layout.addWidget(QtWidgets.QLabel("Download Root:"), 4, 0)
        cfg_layout.addWidget(self.download_root_edit, 4, 1)

        btn_row = QtWidgets.QHBoxLayout()
        self.save_btn = QtWidgets.QPushButton("Save")
        self.paste_btn = QtWidgets.QPushButton("Paste JSON Config")
        self.test_btn = QtWidgets.QPushButton("Test & Load")
        self.refresh_btn = QtWidgets.QPushButton("Refresh")
        self.refresh_btn.setEnabled(False)
        btn_row.addWidget(self.save_btn)
        btn_row.addWidget(self.paste_btn)
        btn_row.addWidget(self.test_btn)
        btn_row.addWidget(self.refresh_btn)
        btn_row.addStretch(1)
        cfg_layout.addLayout(btn_row, 5, 0, 1, 2)

        layout.addWidget(cfg_box)

        # Episode info + segment selection
        info_box = QtWidgets.QGroupBox("Episode / Segment")
        info_layout = QtWidgets.QHBoxLayout(info_box)
        self.info_label = QtWidgets.QLabel("Not loaded.")
        self.segment_combo = QtWidgets.QComboBox()
        self.segment_combo.setEnabled(False)
        info_layout.addWidget(self.info_label, 3)
        info_layout.addWidget(QtWidgets.QLabel("Segment:"))
        info_layout.addWidget(self.segment_combo, 2)
        layout.addWidget(info_box)

        # Shots table
        self.table = QtWidgets.QTableWidget(0, 6)
        self.table.setHorizontalHeaderLabels(["Order", "Take", "ShotId", "Main", "Duration", "Offset"])
        self.table.horizontalHeader().setStretchLastSection(True)
        self.table.setSelectionBehavior(QtWidgets.QAbstractItemView.SelectRows)
        layout.addWidget(self.table, 1)

        # Actions
        act_box = QtWidgets.QGroupBox("Actions")
        act_layout = QtWidgets.QVBoxLayout(act_box)
        
        # Row 1: Main actions
        row1 = QtWidgets.QHBoxLayout()
        self.download_btn = QtWidgets.QPushButton("Download + Create Bins + Build Timeline (Selected Segment)")
        self.download_btn.setEnabled(False)
        self.sync_btn = QtWidgets.QPushButton("SYNC (Resolve -> Concepto)")
        self.sync_btn.setEnabled(False)
        self.sync_from_concepto_btn = QtWidgets.QPushButton("SYNC (Concepto -> Resolve)")
        self.sync_from_concepto_btn.setEnabled(False)
        row1.addWidget(self.download_btn, 3)
        row1.addWidget(self.sync_btn, 1)
        row1.addWidget(self.sync_from_concepto_btn, 1)
        
        # Row 2: Export/Import
        row2 = QtWidgets.QHBoxLayout()
        self.export_av_script_btn = QtWidgets.QPushButton("Export to AV Script (SRT)")
        self.export_av_script_btn.setEnabled(True)
        self.export_srt_video_btn = QtWidgets.QPushButton("Export SRT + Video")
        self.export_srt_video_btn.setEnabled(True)
        self.export_audio_btn = QtWidgets.QPushButton("Export Audio to AV Preview")
        self.export_audio_btn.setEnabled(False)
        self.import_to_timeline_btn = QtWidgets.QPushButton("Import to Current Timeline")
        self.import_to_timeline_btn.setEnabled(False)
        self.diagnose_btn = QtWidgets.QPushButton("Diagnose Resolve API")
        self.diagnose_btn.setEnabled(True)
        row2.addWidget(self.export_av_script_btn, 1)
        row2.addWidget(self.export_srt_video_btn, 1)
        row2.addWidget(self.export_audio_btn, 1)
        row2.addWidget(self.import_to_timeline_btn, 1)
        row2.addWidget(self.diagnose_btn, 1)
        
        act_layout.addLayout(row1)
        act_layout.addLayout(row2)
        layout.addWidget(act_box)

        # Log
        self.log = QtWidgets.QPlainTextEdit()
        self.log.setReadOnly(True)
        layout.addWidget(self.log, 1)

        # Signals
        self.save_btn.clicked.connect(self.on_save)
        self.paste_btn.clicked.connect(self.on_paste_json)
        self.test_btn.clicked.connect(self.on_test_load)
        self.refresh_btn.clicked.connect(self.on_refresh)
        self.segment_combo.currentIndexChanged.connect(self.on_segment_changed)
        self.download_btn.clicked.connect(self.on_download_build)
        self.sync_btn.clicked.connect(self.on_sync)
        self.sync_from_concepto_btn.clicked.connect(self.on_sync_from_concepto)
        self.export_av_script_btn.clicked.connect(self.on_export_av_script)
        self.export_srt_video_btn.clicked.connect(self.on_export_srt_video)
        self.export_audio_btn.clicked.connect(self.on_export_audio)
        self.import_to_timeline_btn.clicked.connect(self.on_import_to_timeline)
        self.diagnose_btn.clicked.connect(self.on_diagnose)

    def _log(self, msg: str):
        self.log.appendPlainText(msg)
        self.log.verticalScrollBar().setValue(self.log.verticalScrollBar().maximum())
        _log_to_file(f"GUI: {msg}")

    def on_save(self):
        self.cfg.api_endpoint = self.endpoint_edit.text().strip()
        self.cfg.api_key = self.key_edit.text().strip()
        self.cfg.show_id = self.show_edit.text().strip()
        self.cfg.episode_id = self.episode_edit.text().strip()
        self.cfg.download_root = self.download_root_edit.text().strip() or DOWNLOAD_ROOT_DEFAULT
        self.cfg.save()
        self._log(f"Saved config to: {self.cfg.path()}")

    def on_paste_json(self):
        """
        Blender-style config paste:
        {
          "apiKey": "...",
          "apiEndpoint": "http://localhost:3000/api/external",
          "showId": "...",
          "episodeId": "..."
        }
        """
        try:
            text, ok = QtWidgets.QInputDialog.getMultiLineText(
                self,
                "Paste JSON Config",
                "Paste Concepto JSON config:",
                "",
            )
            if not ok or not text.strip():
                return
            data = json.loads(text)
            if isinstance(data, dict):
                if data.get("apiEndpoint"):
                    self.endpoint_edit.setText(str(data["apiEndpoint"]))
                if data.get("apiKey"):
                    self.key_edit.setText(str(data["apiKey"]))
                if data.get("showId"):
                    self.show_edit.setText(str(data["showId"]))
                if data.get("episodeId"):
                    self.episode_edit.setText(str(data["episodeId"]))
            self.on_save()
            self._log("Pasted JSON config.")
        except Exception as e:
            self._log(f"Paste JSON ERROR: {e}")

    def _load_episode(self):
        endpoint = self.endpoint_edit.text().strip()
        key = self.key_edit.text().strip()
        show_id_input = self.show_edit.text().strip()
        episode_id = self.episode_edit.text().strip()
        if not endpoint or not key or not episode_id:
            raise RuntimeError("Please fill API Endpoint, API Key, and Episode ID (Show ID optional).")

        self.client = ConceptoClient(endpoint, key)
        ep = self.client.get_episode(episode_id)
        self.episode = ep
        show_id = ep.get("showId")
        # If user provided showId, ensure it matches (helps catch wrong episode)
        if show_id_input and show_id and show_id_input != show_id:
            self._log(f"WARNING: Show ID mismatch. Config showId={show_id_input} but episode.showId={show_id}")
        if show_id_input and not show_id:
            show_id = show_id_input
        self.show = self.client.get_show(show_id) if show_id else None

        show_name = (self.show or {}).get("name", ep.get("showId", "UnknownShow"))
        episode_title = ep.get("title", episode_id)
        self.info_label.setText(f"Show: {show_name} | Episode: {episode_title} ({episode_id})")

        segments = ((ep.get("avScript") or {}).get("segments") or [])
        self.segment_combo.blockSignals(True)
        self.segment_combo.clear()
        for seg in segments:
            self.segment_combo.addItem(f"SC{int(seg.get('segmentNumber',0)):02d}: {seg.get('title','')}", seg.get("id"))
        self.segment_combo.blockSignals(False)
        self.segment_combo.setEnabled(True)
        self.refresh_btn.setEnabled(True)

        # default select first
        if segments:
            self.segment_combo.setCurrentIndex(0)
            self.selected_segment_id = self.segment_combo.currentData()
            self._render_segment()

        self.download_btn.setEnabled(True)
        self.sync_btn.setEnabled(True)
        self.sync_from_concepto_btn.setEnabled(True)
        self.export_audio_btn.setEnabled(True)
        self.import_to_timeline_btn.setEnabled(True)

    def on_test_load(self):
        self._log("Loading episode...")
        try:
            self.on_save()
            self._load_episode()
            self._log("Loaded successfully.")
        except Exception as e:
            self._log(f"ERROR: {e}")

    def on_refresh(self):
        self._log("Refreshing episode data from Concepto...")
        try:
            if not self.client:
                # Need to reload client first
                endpoint = self.endpoint_edit.text().strip()
                key = self.key_edit.text().strip()
                if not endpoint or not key:
                    raise RuntimeError("Please fill API Endpoint and API Key first.")
                self.client = ConceptoClient(endpoint, key)
            
            selected = self.segment_combo.currentData() if self.segment_combo.isEnabled() else None
            self._load_episode()
            # restore selection
            if selected:
                idx = self.segment_combo.findData(selected)
                if idx >= 0:
                    self.segment_combo.setCurrentIndex(idx)
                    self.selected_segment_id = selected
                    self._render_segment()
            self._log("✓ Refresh complete - episode data reloaded from Concepto.")
        except Exception as e:
            self._log(f"Refresh ERROR: {e}")
            import traceback
            self._log(f"Traceback: {traceback.format_exc()}")

    def on_segment_changed(self, _idx: int):
        self.selected_segment_id = self.segment_combo.currentData()
        self._render_segment()

    def _render_segment(self):
        self.table.setRowCount(0)
        if not self.episode or not self.selected_segment_id:
            return
        segments = ((self.episode.get("avScript") or {}).get("segments") or [])
        seg = next((s for s in segments if s.get("id") == self.selected_segment_id), None)
        if not seg:
            return
        shots = seg.get("shots") or []
        # Display order: stable by order then shotNumber (UI only)
        shots_display = sorted(shots, key=lambda s: (s.get("order", 0), float(s.get("shotNumber", 0) or 0)))
        for i, shot in enumerate(shots_display):
            take = (shot.get("take") or "").replace("_image", "")
            main = "video" if shot.get("videoUrl") else ("image" if shot.get("imageUrl") else "none")
            dur = shot.get("duration", 0)
            off = shot.get("videoOffset", 0) or 0
            self.table.insertRow(i)
            self.table.setItem(i, 0, QtWidgets.QTableWidgetItem(str(shot.get("shotNumber", ""))))
            self.table.setItem(i, 1, QtWidgets.QTableWidgetItem(take))
            self.table.setItem(i, 2, QtWidgets.QTableWidgetItem(shot.get("id", "")))
            self.table.setItem(i, 3, QtWidgets.QTableWidgetItem(main))
            self.table.setItem(i, 4, QtWidgets.QTableWidgetItem(str(dur)))
            self.table.setItem(i, 5, QtWidgets.QTableWidgetItem(str(off)))

        self.table.resizeColumnsToContents()

    def _compute_visual_start_times(self, seg: Dict[str, Any], shots: List[Dict[str, Any]]) -> Dict[str, float]:
        """
        Build clipId -> startTime, matching AVPreview logic:
        clipId = `${segment.id}-${shot.id}-${index}`
        startTime = videoClipStartTimes[clipId] ?? sequential(currentStartTime)
        
        IMPORTANT: Shots are ordered by 'order' field (rows in AV script), then by shotNumber.
        Sequential placement ensures no overlaps - each clip starts AFTER the previous one ends.
        """
        start_times: Dict[str, float] = {}
        avp = self.episode.get("avPreviewData") if self.episode else {}
        overrides = (avp or {}).get("videoClipStartTimes") or {}
        
        # Sort shots by order (row) then shotNumber to match AV script order
        sorted_shots = sorted(shots, key=lambda s: (float(s.get("order", 0) or 0), float(s.get("shotNumber", 0) or 0)))
        
        current_end = 0.0  # Track where the last clip ends
        # IMPORTANT: clipId index must match AVPreview.tsx: segment.shots.forEach((shot, index) => ...)
        for idx, shot in enumerate(shots):
            clip_id = f"{seg.get('id')}-{shot.get('id')}-{idx}"
            duration = float(shot.get("duration") or 0)
            
            if clip_id in overrides:
                # Use override from Concepto
                start = float(overrides[clip_id])
            else:
                # Sequential placement: start AFTER previous clip ends (no overlap)
                start = current_end
            
            start_times[clip_id] = start
            # Update current_end to be after this clip ends (for next sequential placement)
            current_end = max(current_end, start + duration)
        
        return start_times

    def on_download_build(self):
        def worker():
            try:
                if not self.episode or not self.selected_segment_id or not self.client:
                    raise RuntimeError("Load an episode and select a segment first.")

                # Resolve context
                self._log("Connecting to Resolve...")
                _resolve, project, media_pool = resolve_get_context()

                # Determine show/episode folder
                show_name = _safe_slug((self.show or {}).get("name") or self.episode.get("showId") or "UnknownShow")
                episode_name = _safe_slug(self.episode.get("title") or self.cfg.episode_id)
                base_dir = Path(self.download_root_edit.text().strip() or DOWNLOAD_ROOT_DEFAULT)
                episode_dir = base_dir / show_name / episode_name
                episode_dir.mkdir(parents=True, exist_ok=True)
                self._log(f"Local episode folder: {episode_dir}")

                # Find selected segment
                segments = ((self.episode.get("avScript") or {}).get("segments") or [])
                seg = next((s for s in segments if s.get("id") == self.selected_segment_id), None)
                if not seg:
                    raise RuntimeError("Selected segment not found.")

                # Use RAW order for clipId + startTimes to match Concepto AVPreview indexing.
                shots_raw = seg.get("shots") or []
                start_times = self._compute_visual_start_times(seg, shots_raw)

                # Timeline
                tl_name = f"CONCEPTO_{show_name}_{episode_name}"
                timeline = resolve_get_or_create_timeline(project, tl_name)
                self._log(f"Using timeline: {getattr(timeline,'GetName',lambda:tl_name)()}")

                # Collect audio track assets once for the entire segment (these go in episode folder, not take folders)
                audio_track_assets = _collect_audio_track_assets(
                    self.episode,
                    self.selected_segment_id,
                    api_endpoint=self.cfg.api_endpoint,
                    log_callback=self._log,
                )
                audio_local_files: List[str] = []  # Collect downloaded audio files for later bin import
                
                if audio_track_assets:
                    audio_dir = episode_dir / "AVPreview_Audio"
                    audio_dir.mkdir(parents=True, exist_ok=True)
                    self._log(f"Downloading {len(audio_track_assets)} audio track assets from AV Preview...")
                    for url, filename in audio_track_assets:
                        ext = os.path.splitext(url.split("?")[0])[1]
                        if not os.path.splitext(filename)[1] and ext:
                            filename = filename + ext
                        dest = audio_dir / _safe_slug(filename)
                        if not dest.exists():
                            try:
                                _download_file(url, dest)
                                self._log(f"Downloaded audio track: {dest.name}")
                                audio_local_files.append(str(dest))
                            except Exception as e:
                                self._log(f"Failed to download audio track {filename}: {e}")
                                continue
                        else:
                            # File already exists, add to list for import
                            audio_local_files.append(str(dest))
                else:
                    self._log("INFO: No audio tracks found in AV Preview for this segment.")

                # Process takes - sort by order (row) to ensure proper sequencing
                sorted_shots = sorted(shots_raw, key=lambda s: (float(s.get("order", 0) or 0), float(s.get("shotNumber", 0) or 0)))
                self._log(f"Processing {len(sorted_shots)} shots in order (sorted by row/order field)")
                
                # List to collect placeholders for SRT generation
                placeholders_to_create = []
                
                for idx, shot in enumerate(sorted_shots):
                    take = (shot.get("take") or f"TAKE_{idx+1:03d}").replace("_image", "")
                    take_dir = episode_dir / take

                    # Download assets
                    assets = _collect_take_assets(shot, self.cfg.api_endpoint)
                    # ... rest of download ...
                    local_files: List[str] = []
                    for url, filename in assets:
                        ext = os.path.splitext(url.split("?")[0])[1]
                        if not os.path.splitext(filename)[1] and ext:
                            filename = filename + ext
                        dest = take_dir / _safe_slug(filename)
                        if not dest.exists():
                            try:
                                _download_file(url, dest)
                                self._log(f"[{take}] Downloaded: {dest.name}")
                            except Exception as e:
                                self._log(f"[{take}] Failed to download {filename}: {e}")
                                continue
                        local_files.append(str(dest))

                    # Create bins + import
                    seg_label = f"SC{int(seg.get('segmentNumber',0)):02d}_{_safe_slug(seg.get('title',''))}"[:80]
                    take_folder = resolve_ensure_bins(media_pool, "CONCEPTO", seg_label, take)
                    imported = resolve_import_files(media_pool, take_folder, local_files)
                    self._log(f"[{take}] Imported {len(imported)} items into bin.")

                    # Place main on timeline (or collect for subtitle if no video/image)
                    main_video_url = shot.get("videoUrl")
                    main_image_url = shot.get("imageUrl")
                    main_url = main_video_url or main_image_url
                    visual_description = shot.get("visual", "")
                    
                    # Collect details for ALL takes into SRT (for full script overlay)
                    clip_id = f"{seg.get('id')}-{shot.get('id')}-{idx}"
                    start_sec = float(start_times.get(clip_id, 0.0))
                    dur_sec = float(shot.get("duration") or 0)
                    if dur_sec <= 0: dur_sec = 3.0
                    
                    subtitle_text = f"[{take}] {visual_description}" if visual_description else f"[{take}]"
                    placeholders_to_create.append({
                        'start': start_sec,
                        'duration': dur_sec,
                        'text': subtitle_text
                    })

                    if not main_url:
                        self._log(f"[{take}] Queued for subtitle placeholder (no video/image)")
                        continue

                    # Determine which type of main asset we have
                    has_video = bool(main_video_url)
                    has_image = bool(main_image_url)
                    self._log(f"[{take}] Main asset: video={has_video}, image={has_image}")


                    # Find matching local file for main - prioritize based on what's actually available
                    main_file = None
                    if has_video:
                        # Look for MAIN_video first
                        for f in local_files:
                            if f.endswith(".mp4") and "MAIN_video" in os.path.basename(f):
                                main_file = f
                                self._log(f"[{take}] Found main video file: {os.path.basename(f)}")
                                break
                    
                    if not main_file and has_image:
                        # Look for MAIN_image (check multiple extensions)
                        for f in local_files:
                            basename = os.path.basename(f).lower()
                            if "MAIN_image" in basename and any(basename.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
                                main_file = f
                                self._log(f"[{take}] Found main image file: {os.path.basename(f)}")
                                break
                    
                    # Fallback: if we still don't have a main file, try to find any video or image
                    if not main_file:
                        if has_video:
                            # Look for any .mp4 file
                            for f in local_files:
                                if f.endswith(".mp4"):
                                    main_file = f
                                    self._log(f"[{take}] Using fallback video file: {os.path.basename(f)}")
                                    break
                        elif has_image:
                            # Look for any image file
                            for f in local_files:
                                basename = os.path.basename(f).lower()
                                if any(basename.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
                                    main_file = f
                                    self._log(f"[{take}] Using fallback image file: {os.path.basename(f)}")
                                    break
                    
                    # Last resort: use first file
                    if not main_file and local_files:
                        main_file = local_files[0]
                        self._log(f"[{take}] Using first available file as main: {os.path.basename(main_file)}")
                    
                    if not main_file:
                        self._log(f"[{take}] WARNING: Could not find main file in downloaded assets!")
                        self._log(f"[{take}] Debug: local_files count={len(local_files)}")
                        for f in local_files[:5]:  # Show first 5 files
                            self._log(f"[{take}]   - {os.path.basename(f)}")

                    # Find media pool item that matches the imported main file (best-effort)
                    main_item = imported[0] if imported else None
                    # If we can list clips in folder, pick by name match
                    get_clips = _method(take_folder, "GetClipList")
                    if get_clips and main_file:
                        want = os.path.basename(main_file)
                        for it in take_folder.GetClipList() or []:
                            nm = getattr(it, "GetName", lambda: "")()
                            if nm == want or want in nm:
                                main_item = it
                                break

                    if not main_item:
                        self._log(f"[{take}] Could not find MediaPoolItem for main, skipping timeline.")
                        self._log(f"[{take}] Debug: imported={len(imported)} items, main_file={main_file}")
                        if imported:
                            self._log(f"[{take}] Debug: first imported item name={getattr(imported[0], 'GetName', lambda: '(no GetName)')()}")
                        continue

                    clip_id = f"{seg.get('id')}-{shot.get('id')}-{idx}"
                    start_sec = float(start_times.get(clip_id, 0.0))
                    dur_sec = float(shot.get("duration") or 0)
                    if dur_sec <= 0:
                        dur_sec = 3.0
                        self._log(f"[{take}] Warning: Duration was {shot.get('duration')}, using default 3.0s")
                    off_sec = float(shot.get("videoOffset") or 0) or 0.0

                    item_name = getattr(main_item, "GetName", lambda: "(unknown)")()
                    self._log(f"[{take}] Placing '{item_name}' on timeline: start={start_sec}s dur={dur_sec}s offset={off_sec}s")
                    
                    # Validate media pool item before placement
                    try:
                        # Check if item has GetClipProperty method
                        if not hasattr(main_item, "GetClipProperty") and not hasattr(main_item, "GetDuration"):
                            self._log(f"[{take}] Warning: MediaPoolItem may be invalid (no GetClipProperty/GetDuration method)")
                        
                        # Verify item name is not empty
                        if not item_name or item_name == "(unknown)":
                            self._log(f"[{take}] Warning: MediaPoolItem has no name")
                    except Exception as e:
                        self._log(f"[{take}] Warning: Could not validate MediaPoolItem: {e}")
                    
                    # Ensure timeline is current and unlocked
                    try:
                        project.SetCurrentTimeline(timeline)
                        self._log(f"[{take}] Set timeline as current: {getattr(timeline, 'GetName', lambda: '(unknown)')()}")
                    except Exception as e:
                        self._log(f"[{take}] Warning: Could not set timeline as current: {e}")
                    
                    # Check for overlaps with existing clips on timeline and adjust position
                    try:
                        fps_raw = timeline.GetSetting("timelineFrameRate")
                        fps = float(fps_raw) if fps_raw else 24.0
                    except Exception:
                        fps = 24.0
                    
                    # Get timeline start timecode
                    timeline_start_frame = 0
                    try:
                        get_start_tc = _method(timeline, "GetStartTimecode")
                        if get_start_tc:
                            start_tc_str = timeline.GetStartTimecode()
                            if start_tc_str and isinstance(start_tc_str, str) and ":" in start_tc_str:
                                try:
                                    parts = start_tc_str.split(":")
                                    if len(parts) == 4:
                                        h, m, s, f = map(int, parts)
                                        timeline_start_sec = h * 3600 + m * 60 + s + (f / fps)
                                        timeline_start_frame = int(round(timeline_start_sec * fps))
                                except Exception:
                                    pass
                    except Exception:
                        pass
                    
                    # Calculate target frame positions
                    target_start_frame = int(round(start_sec * fps)) + timeline_start_frame
                    target_end_frame = target_start_frame + int(round(dur_sec * fps))
                    
                    # Get existing clips on V1 to check for overlaps
                    get_items = _method(timeline, "GetItemListInTrack")
                    if get_items:
                        try:
                            existing_items = timeline.GetItemListInTrack("video", 1) or []
                            for ex_item in existing_items:
                                try:
                                    ex_start = None
                                    ex_end = None
                                    for m in ["GetStart", "GetStartFrame"]:
                                        fn = _method(ex_item, m)
                                        if fn:
                                            try:
                                                ex_start = int(fn())
                                                break
                                            except Exception:
                                                pass
                                    for m in ["GetEnd", "GetEndFrame"]:
                                        fn = _method(ex_item, m)
                                        if fn:
                                            try:
                                                ex_end = int(fn())
                                                break
                                            except Exception:
                                                pass
                                    if ex_start is not None and ex_end is not None:
                                        # Check for overlap
                                        if not (target_end_frame <= ex_start or target_start_frame >= ex_end):
                                            # Overlap detected - move new clip to start AFTER existing clip
                                            self._log(f"[{take}] Overlap detected with clip at frames {ex_start}-{ex_end}, adjusting position")
                                            adjusted_start_frame = ex_end
                                            start_sec = (adjusted_start_frame - timeline_start_frame) / fps
                                            target_start_frame = adjusted_start_frame
                                            target_end_frame = target_start_frame + int(round(dur_sec * fps))
                                            self._log(f"[{take}] Adjusted start to {start_sec:.3f}s (frame {adjusted_start_frame}) to avoid overlap")
                                            break
                                except Exception:
                                    pass
                        except Exception:
                            pass
                    
                    try:
                        # Both videos and images use "video" track type in Resolve
                        # This allows images to be moved just like videos
                        is_image = main_file and any(main_file.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"])
                        track_type = "video"  # Images also go on video tracks in Resolve
                        self._log(f"[{take}] Placing {'image' if is_image else 'video'} on video track V1 at {start_sec:.3f}s")
                        resolve_place_on_timeline(project, media_pool, timeline, main_item, record_seconds=start_sec, duration_seconds=dur_sec, offset_seconds=off_sec, log_callback=self._log, track_index=1, track_type=track_type)
                        self._log(f"[{take}] ✓ Successfully placed on timeline")
                    except Exception as e:
                        self._log(f"[{take}] ✗ Failed to place on timeline: {type(e).__name__}: {e}")
                        import traceback
                        self._log(f"[{take}] Traceback: {traceback.format_exc()}")
                    
                    # Verify clip was actually placed by checking timeline items
                    try:
                        get_items = _method(timeline, "GetItemListInTrack")
                        if get_items:
                            # Small delay to let Resolve process
                            import time
                            time.sleep(0.1)
                            placed_items = timeline.GetItemListInTrack("video", 1) or []
                            # Check if our clip is there by name
                            found = False
                            for placed_item in placed_items:
                                try:
                                    placed_name = getattr(placed_item, "GetName", lambda: "")()
                                    if item_name in placed_name or take in placed_name:
                                        # Get the timeline item properties
                                        try:
                                            get_start = _method(placed_item, "GetStart")
                                            get_end = _method(placed_item, "GetEnd")
                                            if get_start and get_end:
                                                item_start = placed_item.GetStart()
                                                item_end = placed_item.GetEnd()
                                                self._log(f"[{take}] ✓ Verified clip on timeline: start={item_start}, end={item_end}")
                                        except Exception:
                                            pass
                                        found = True
                                        break
                                except Exception:
                                    pass
                            if not found:
                                self._log(f"[{take}] ⚠ WARNING: Clip may not be visible on timeline after placement")
                    except Exception as e:
                        self._log(f"[{take}] Could not verify timeline placement: {e}")
                    
                    # Add a marker for mapping/sync (best-effort)
                    try:
                        fps_raw = timeline.GetSetting("timelineFrameRate")
                        fps = float(fps_raw) if fps_raw else 24.0
                    except Exception:
                        fps = 24.0
                    add_marker = _method(timeline, "AddMarker")
                    if add_marker:
                        try:
                            frame = _seconds_to_frames(start_sec, fps)
                            note = json.dumps({
                                "concepto": True,
                                "episodeId": self.cfg.episode_id,
                                "segmentId": seg.get("id"),
                                "shotId": shot.get("id"),
                                "take": take,
                                "clipId": clip_id,
                            })
                            timeline.AddMarker(frame, "Blue", f"{take}", note, 1)
                        except Exception:
                            pass

                # After all takes are processed, create subtitle track from placeholders if any
                if placeholders_to_create:
                    self._log(f"Generating subtitle track for {len(placeholders_to_create)} placeholders...")
                    try:
                        # Convert to SRT time format: HH:MM:SS,mmm
                        def to_srt_time(secs):
                            h = int(secs // 3600)
                            m = int((secs % 3600) // 60)
                            s = int(secs % 60)
                            ms = int((secs % 1) * 1000)
                            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
                        
                        srt_lines = []
                        for i, p in enumerate(placeholders_to_create):
                            start_sec = p['start']
                            end_sec = p['start'] + p['duration']
                            # SRT likes single lines or explicit \n
                            text = p['text'].replace('\n', ' ')
                            
                            srt_lines.append(str(i + 1))
                            srt_lines.append(f"{to_srt_time(start_sec)} --> {to_srt_time(end_sec)}")
                            srt_lines.append(text)
                            srt_lines.append("")
                        
                        srt_content = "\n".join(srt_lines)
                        srt_path = os.path.join(episode_dir, "placeholders.srt")
                        with open(srt_path, "w", encoding="utf-8") as f:
                            f.write(srt_content)
                        
                        self._log(f"Importing subtitles from {srt_path}...")
                        # Resolve API: ImportIntoTimeline(path, importType="srt")
                        import_into = _method(timeline, "ImportIntoTimeline")
                        if import_into:
                            result = timeline.ImportIntoTimeline(srt_path, {"importType": "subtitle"})
                            if not result:
                                # Try alternate importType
                                result = timeline.ImportIntoTimeline(srt_path, "srt")
                            
                            if result:
                                self._log(f"✓ Subtitle track created successfully!")
                            else:
                                self._log(f"⚠ Automatic subtitle import returned False. You can manually import {srt_path}")
                        else:
                            self._log(f"⚠ Timeline.ImportIntoTimeline method not found. File is at: {srt_path}")
                    except Exception as e:
                        self._log(f"✗ Failed to create subtitle track: {e}")

                # After all takes are processed, create subtitle track from placeholders if any
                if placeholders_to_create:
                    self._log(f"Generating subtitle track for {len(placeholders_to_create)} placeholders...")
                    try:
                        # STEP 1: Get timeline start offset in seconds
                        # Most timelines start at 01:00:00:00 (3600 seconds)
                        tl_start_sec = 0.0
                        try:
                            fps_raw = timeline.GetSetting("timelineFrameRate")
                            fps = float(fps_raw) if fps_raw else 24.0
                            start_tc = timeline.GetStartTimecode() # e.g. "01:00:00:00"
                            parts = start_tc.split(":")
                            if len(parts) == 4:
                                tl_start_sec = int(parts[0])*3600 + int(parts[1])*60 + int(parts[2]) + (int(parts[3])/fps)
                                self._log(f"Timeline starts at {start_tc} ({tl_start_sec}s offset)")
                        except Exception as e:
                            self._log(f"Note: Using 0.0 as start offset: {e}")

                        # Convert to SRT time format: HH:MM:SS,mmm
                        def to_srt_time(secs):
                            # Add timeline start offset to make times absolute to timeline
                            absolute_secs = secs + tl_start_sec
                            h = int(absolute_secs // 3600)
                            m = int((absolute_secs % 3600) // 60)
                            s = int(absolute_secs % 60)
                            ms = int((absolute_secs % 1) * 1000)
                            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
                        
                        srt_lines = []
                        for i, p in enumerate(placeholders_to_create):
                            start_sec = p['start']
                            end_sec = p['start'] + p['duration']
                            text = p['text'].replace('\n', ' ')
                            
                            srt_lines.append(str(i + 1))
                            srt_lines.append(f"{to_srt_time(start_sec)} --> {to_srt_time(end_sec)}")
                            srt_lines.append(text)
                            srt_lines.append("")
                        
                        srt_content = "\n".join(srt_lines)
                        srt_path = os.path.join(episode_dir, "placeholders.srt")
                        with open(srt_path, "w", encoding="utf-8") as f:
                            f.write(srt_content)
                        
                        self._log(f"Importing subtitles from {srt_path}...")
                        
                        # STEP 2: Import SRT into Media Pool for visibility
                        srt_item = None
                        try:
                            srt_bin = resolve_ensure_bins(media_pool, "CONCEPTO", seg_label, "Subtitles")
                            media_pool.SetCurrentFolder(srt_bin)
                            imported_items = media_pool.ImportMedia([srt_path])
                            if imported_items:
                                srt_item = imported_items[0]
                                self._log(f"✓ SRT imported into bin: Subtitles")
                        except Exception:
                            pass

                        # STEP 3: Place on timeline using official ImportIntoTimeline
                        # Since we adjusted the times in SRT to match the timeline TC,
                        # we don't need any complex offsets here.
                        result = timeline.ImportIntoTimeline(srt_path, {"importType": "subtitle"})
                        if result:
                            self._log("✓ Subtitles successfully placed on timeline.")
                        else:
                            # Fallback
                            result = timeline.ImportIntoTimeline(srt_path, "subtitle")
                            if result:
                                self._log("✓ Subtitles placed via fallback.")
                            else:
                                self._log("⚠ Automatic placement failed. SRT is in your bin - drag it to start of timeline.")
                                
                    except Exception as e:
                        self._log(f"✗ Failed to create subtitle track: {e}")

                # After all takes are processed, create audio bin and import audio files
                if audio_local_files:
                    try:
                        seg_label = f"SC{int(seg.get('segmentNumber',0)):02d}_{_safe_slug(seg.get('title',''))}"[:80]
                        concepto_root = media_pool.GetRootFolder()
                        concepto_folder = None
                        # Find or create CONCEPTO folder
                        for f in concepto_root.GetSubFolderList() or []:
                            if getattr(f, "GetName", lambda: "")() == "CONCEPTO":
                                concepto_folder = f
                                break
                        if not concepto_folder:
                            concepto_folder = media_pool.AddSubFolder(concepto_root, "CONCEPTO")
                        
                        # Find or create segment folder
                        seg_folder = None
                        for f in concepto_folder.GetSubFolderList() or []:
                            if getattr(f, "GetName", lambda: "")() == seg_label:
                                seg_folder = f
                                break
                        if not seg_folder:
                            seg_folder = media_pool.AddSubFolder(concepto_folder, seg_label)
                        
                        # Create AVPreview_Audio bin (below all takes)
                        audio_bin_name = "AVPreview_Audio"
                        audio_bin = None
                        for f in seg_folder.GetSubFolderList() or []:
                            if getattr(f, "GetName", lambda: "")() == audio_bin_name:
                                audio_bin = f
                                break
                        if not audio_bin:
                            audio_bin = media_pool.AddSubFolder(seg_folder, audio_bin_name)
                        
                        self._log(f"Creating audio bin '{audio_bin_name}' and importing {len(audio_local_files)} audio file(s)...")
                        imported_audio = resolve_import_files(media_pool, audio_bin, audio_local_files)
                        self._log(f"✓ Imported {len(imported_audio)} audio file(s) into '{audio_bin_name}' bin")

                        # Place AVPreview audio clips onto timeline A-tracks (A1..)
                        try:
                            avp = (self.episode or {}).get("avPreviewData") or {}
                            audio_tracks = avp.get("audioTracks") or []
                            if not audio_tracks:
                                self._log("AUDIO: No avPreviewData.audioTracks to place on timeline.")
                            else:
                                # Build name -> MediaPoolItem map from audio bin
                                name_to_item: Dict[str, Any] = {}
                                get_clip_list = _method(audio_bin, "GetClipList")
                                if get_clip_list:
                                    for it in (audio_bin.GetClipList() or []):
                                        try:
                                            nm = getattr(it, "GetName", lambda: "")()
                                            if nm:
                                                name_to_item[nm] = it
                                        except Exception:
                                            pass

                                # Ensure enough audio tracks exist (best-effort)
                                get_track_count = _method(timeline, "GetTrackCount")
                                add_track = _method(timeline, "AddTrack")
                                desired = len(audio_tracks)
                                if get_track_count:
                                    try:
                                        current_a = int(timeline.GetTrackCount("audio") or 0)
                                    except Exception:
                                        current_a = 1
                                    if add_track and current_a < desired:
                                        for _ in range(desired - current_a):
                                            try:
                                                add_track("audio")
                                            except Exception:
                                                break

                                # Place AVPreview audio on A2+ (A1 is reserved for embedded video audio)
                                audio_track_offset = 2  # Start AVPreview audio on A2
                                self._log(f"AUDIO: Placing {sum(len(t.get('clips') or []) for t in audio_tracks)} AVPreview audio clip(s) onto timeline A{audio_track_offset}+...")
                                
                                # Ensure at least A2 exists for AVPreview audio
                                if get_track_count:
                                    try:
                                        current_a = int(timeline.GetTrackCount("audio") or 0)
                                    except Exception:
                                        current_a = 1
                                    if add_track and current_a < audio_track_offset:
                                        for _ in range(audio_track_offset - current_a):
                                            try:
                                                add_track("audio")
                                            except Exception:
                                                break
                                
                                for t_idx, tr in enumerate(audio_tracks):
                                    clips = tr.get("clips") or []
                                    # Use separate audio track per AVPreview track (A2, A3, etc.)
                                    target_audio_track = audio_track_offset + t_idx
                                    
                                    # Ensure track exists
                                    if get_track_count and add_track:
                                        try:
                                            current_a = int(timeline.GetTrackCount("audio") or 0)
                                            if current_a < target_audio_track:
                                                for _ in range(target_audio_track - current_a):
                                                    try:
                                                        add_track("audio")
                                                    except Exception:
                                                        break
                                        except Exception:
                                            pass
                                    
                                    for c_idx, cl in enumerate(clips):
                                        if not isinstance(cl, dict):
                                            continue
                                        fn = _audio_clip_filename(tr, cl)
                                        want_name = _safe_slug(fn)
                                        mp_item = name_to_item.get(want_name)
                                        if not mp_item and name_to_item:
                                            # fallback: contains match
                                            for k, v in name_to_item.items():
                                                if want_name in k:
                                                    mp_item = v
                                                    break
                                        if not mp_item:
                                            self._log(f"AUDIO: Missing MediaPoolItem for {want_name} (AVPreview track {t_idx+1} clip {c_idx+1})")
                                            continue
                                        st = float(cl.get("startTime") or 0)
                                        du = float(cl.get("duration") or 0)
                                        off = float(cl.get("offset") or 0)
                                        if du <= 0:
                                            du = 1.0
                                        self._log(f"AUDIO: Place '{want_name}' A{target_audio_track} (AVPreview track {t_idx+1}) start={st}s dur={du}s offset={off}s")
                                        try:
                                            resolve_place_on_timeline(
                                                project,
                                                media_pool,
                                                timeline,
                                                mp_item,
                                                record_seconds=st,
                                                duration_seconds=du,
                                                offset_seconds=off,
                                                log_callback=self._log,
                                                track_index=target_audio_track,
                                                track_type="audio",
                                            )
                                        except Exception as e:
                                            self._log(f"AUDIO: Failed placing '{want_name}': {type(e).__name__}: {e}")
                        except Exception as e:
                            self._log(f"AUDIO: Unexpected error while placing audio: {type(e).__name__}: {e}")
                    except Exception as e:
                        self._log(f"ERROR: Failed to create audio bin or import audio files: {e}")
                        import traceback
                        self._log(f"Traceback: {traceback.format_exc()}")

                self._log("Done: Download + bins + timeline build completed.")
            except Exception as e:
                self._log(f"ERROR: {e}")

        threading.Thread(target=worker, daemon=True).start()

    def on_sync(self):
        def worker():
            try:
                if not self.client or not self.episode or not self.selected_segment_id:
                    raise RuntimeError("Load an episode and select a segment first.")

                self._log("SYNC: Connecting to Resolve...")
                _resolve, project, _media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open.")

                # segment + shots (raw order for clipId indexing)
                segments = ((self.episode.get("avScript") or {}).get("segments") or [])
                seg = next((s for s in segments if s.get("id") == self.selected_segment_id), None)
                if not seg:
                    raise RuntimeError("Selected segment not found.")
                shots_raw = seg.get("shots") or []
                take_to_shot: Dict[str, Dict[str, Any]] = {}
                for idx, sh in enumerate(shots_raw):
                    take = (sh.get("take") or "").replace("_image", "")
                    if take:
                        take_to_shot[take] = {"shot": sh, "idx": idx}

                # fps
                try:
                    fps_raw = timeline.GetSetting("timelineFrameRate")
                    fps = float(fps_raw) if fps_raw else 24.0
                except Exception:
                    fps = 24.0
                
                # Get timeline start timecode (needed to convert absolute frame to relative seconds)
                timeline_start_frame = 0
                try:
                    get_start_tc = _method(timeline, "GetStartTimecode")
                    if get_start_tc:
                        start_tc_str = timeline.GetStartTimecode()
                        if start_tc_str and isinstance(start_tc_str, str) and ":" in start_tc_str:
                            try:
                                parts = start_tc_str.split(":")
                                if len(parts) == 4:
                                    h, m, s, f = map(int, parts)
                                    timeline_start_sec = h * 3600 + m * 60 + s + (f / fps)
                                    timeline_start_frame = int(round(timeline_start_sec * fps))
                                    self._log(f"SYNC: Timeline start timecode: {start_tc_str} ({timeline_start_frame} frames)")
                            except Exception:
                                pass
                except Exception:
                    pass

                updated_start_times: Dict[str, float] = {}
                updated_shots: List[Tuple[str, Dict[str, Any]]] = []

                # Strategy B: Read timeline items (video tracks for timing, subtitle tracks for text)
                get_track_count = _method(timeline, "GetTrackCount")
                get_items = _method(timeline, "GetItemListInTrack")
                
                if get_track_count and get_items:
                    # 1. SCAN VIDEO TRACKS (Timing & Offset)
                    try:
                        v_tracks = int(timeline.GetTrackCount("video") or 0)
                    except Exception:
                        v_tracks = 1
                    
                    self._log(f"SYNC: Scanning {v_tracks} video tracks for timing...")
                    for t in range(1, v_tracks + 1):
                        items = timeline.GetItemListInTrack("video", t) or []
                        for it in items:
                            nm = ""
                            try:
                                nm = it.GetName()
                            except Exception:
                                try:
                                    mpit = it.GetMediaPoolItem()
                                    nm = mpit.GetName() if mpit else ""
                                except Exception:
                                    nm = ""
                            
                            take_match = re.search(r"(SC\d{2}T\d{2})", nm)
                            if take_match:
                                take = take_match.group(1)
                                if take in take_to_shot:
                                    sh = take_to_shot[take]["shot"]
                                    idx = take_to_shot[take]["idx"]
                                    clip_id = f"{seg.get('id')}-{sh.get('id')}-{idx}"
                                    
                                    # Read position
                                    for m in ["GetStart", "GetStartFrame"]:
                                        fn = _method(it, m)
                                        if fn:
                                            pos = fn()
                                            if pos is not None:
                                                updated_start_times[clip_id] = (int(pos) - timeline_start_frame) / fps
                                                break
                                    
                                    # Read duration & offset
                                    updates = {}
                                    dur_fn = _method(it, "GetDuration")
                                    if dur_fn: updates["duration"] = float(dur_fn()) / fps
                                    
                                    # Source Offset (best effort)
                                    try:
                                        prop_fn = _method(it, "GetProperty") or _method(it, "GetClipProperty")
                                        if prop_fn:
                                            props = prop_fn()
                                            if isinstance(props, dict):
                                                in_f = props.get("In") or props.get("StartFrame")
                                                if in_f: updates["videoOffset"] = float(in_f) / fps
                                    except Exception: pass
                                    
                                    if updates: updated_shots.append((sh.get("id"), updates))

                    # 2. SCAN SUBTITLE TRACKS (Visual Description)
                    try:
                        s_tracks = int(timeline.GetTrackCount("subtitle") or 0)
                    except Exception:
                        s_tracks = 0
                    
                    if s_tracks > 0:
                        self._log(f"SYNC: Scanning {s_tracks} subtitle tracks for text edits...")
                        for t in range(1, s_tracks + 1):
                            items = timeline.GetItemListInTrack("subtitle", t) or []
                            for it in items:
                                try:
                                    # Try EVERY possible way to get text from a subtitle item
                                    content = ""
                                    
                                    # 1. Try GetName (Resolve often puts subtitle text in name)
                                    try: content = it.GetName()
                                    except Exception: pass
                                    
                                    # 2. Try GetText
                                    if not content:
                                        try:
                                            fn = _method(it, "GetText")
                                            if fn: content = fn()
                                        except Exception: pass
                                        
                                    # 3. Try Properties
                                    if not content:
                                        try:
                                            prop_fn = _method(it, "GetProperty")
                                            if prop_fn:
                                                content = prop_fn("Text") or prop_fn("Caption") or prop_fn("Notes")
                                        except Exception: pass

                                    if not content:
                                        continue
                                    
                                    # Clean content for regex (remove newlines)
                                    search_text = content.replace("\n", " ")
                                    
                                    # Look for take ID like [SC01T06] - more flexible regex
                                    take_match = re.search(r"\[?\s*(SC\d{2}T\d{2})\s*\]?", search_text)
                                    if take_match:
                                        take = take_match.group(1)
                                        if take in take_to_shot:
                                            sh = take_to_shot[take]["shot"]
                                            # New visual: remove the [SCXXTXX] part from the content
                                            new_visual = re.sub(r"\[?\s*SC\d{2}T\d{2}\s*\]?\s*", "", content, flags=re.IGNORECASE).strip()
                                            
                                            old_visual = (sh.get("visual") or "").strip()
                                            if new_visual and new_visual != old_visual:
                                                self._log(f"SYNC: [{take}] Text changed: '{old_visual[:30]}...' -> '{new_visual[:30]}...'")
                                                updated_shots.append((sh.get("id"), {"visual": new_visual}))
                                            else:
                                                self._log(f"SYNC: [{take}] No text changes detected.")
                                except Exception as e:
                                    self._log(f"SYNC: Subtitle error: {e}")

                # Push updates
                if updated_start_times:
                    self._log(f"SYNC: Updating {len(updated_start_times)} startTimes -> Concepto...")
                    for clip_id, start_sec in updated_start_times.items():
                        self._log(f"SYNC:   clipId={clip_id} -> startTime={start_sec:.3f}s")
                    try:
                        self.client.update_video_clip_start_times(self.cfg.episode_id, updated_start_times)
                        self._log(f"SYNC: ✓ Successfully updated videoClipStartTimes in Concepto")
                    except Exception as e:
                        self._log(f"SYNC: ERROR updating Concepto: {type(e).__name__}: {e}")
                        import traceback
                        self._log(f"SYNC: Traceback: {traceback.format_exc()}")
                else:
                    self._log("SYNC: No startTime changes detected (or unable to read them).")
                    self._log("SYNC: Tip: Make sure clips are on the timeline and visible in the Edit page.")

                if updated_shots:
                    self._log(f"SYNC: Updating {len(updated_shots)} shots (duration/videoOffset) -> Concepto...")
                    for shot_id, updates in updated_shots:
                        self.client.update_shot(shot_id, updates)
                else:
                    self._log("SYNC: No duration/videoOffset changes detected (or unable to read them).")

                self._log("SYNC complete. Use Refresh to verify.")
            except Exception as e:
                self._log(f"SYNC ERROR: {e}")

        threading.Thread(target=worker, daemon=True).start()

    def on_sync_from_concepto(self):
        """Sync changes FROM Concepto TO Resolve timeline"""
        def worker():
            try:
                if not self.client or not self.episode or not self.selected_segment_id:
                    raise RuntimeError("Load an episode and select a segment first.")

                self._log("SYNC FROM CONCEPTO: Fetching latest data from Concepto...")
                # Reload episode to get latest data
                ep = self.client.get_episode(self.cfg.episode_id)
                self.episode = ep
                
                segments = ((ep.get("avScript") or {}).get("segments") or [])
                seg = next((s for s in segments if s.get("id") == self.selected_segment_id), None)
                if not seg:
                    raise RuntimeError("Selected segment not found.")
                
                shots_raw = seg.get("shots") or []
                avp = ep.get("avPreviewData") or {}
                video_clip_start_times = avp.get("videoClipStartTimes") or {}
                
                self._log(f"SYNC FROM CONCEPTO: Found {len(video_clip_start_times)} videoClipStartTimes in Concepto")
                
                # Connect to Resolve
                self._log("SYNC FROM CONCEPTO: Connecting to Resolve...")
                _resolve, project, _media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open.")
                
                # Get timeline settings
                try:
                    fps_raw = timeline.GetSetting("timelineFrameRate")
                    fps = float(fps_raw) if fps_raw else 24.0
                except Exception:
                    fps = 24.0
                
                # Get timeline start timecode
                timeline_start_frame = 0
                try:
                    get_start_tc = _method(timeline, "GetStartTimecode")
                    if get_start_tc:
                        start_tc_str = timeline.GetStartTimecode()
                        if start_tc_str and isinstance(start_tc_str, str) and ":" in start_tc_str:
                            try:
                                parts = start_tc_str.split(":")
                                if len(parts) == 4:
                                    h, m, s, f = map(int, parts)
                                    timeline_start_sec = h * 3600 + m * 60 + s + (f / fps)
                                    timeline_start_frame = int(round(timeline_start_sec * fps))
                                    self._log(f"SYNC FROM CONCEPTO: Timeline start: {start_tc_str} ({timeline_start_frame} frames)")
                            except Exception:
                                pass
                except Exception:
                    pass
                
                # Build take -> shot mapping
                take_to_shot: Dict[str, Dict[str, Any]] = {}
                for idx, sh in enumerate(shots_raw):
                    take = (sh.get("take") or "").replace("_image", "")
                    if take:
                        take_to_shot[take] = {"shot": sh, "idx": idx}
                
                # Find and update timeline items
                get_items = _method(timeline, "GetItemListInTrack")
                if not get_items:
                    raise RuntimeError("Cannot read timeline items (missing GetItemListInTrack).")
                
                updated_count = 0
                try:
                    v_tracks = int(timeline.GetTrackCount("video") or 0)
                except Exception:
                    v_tracks = 1
                
                self._log(f"SYNC FROM CONCEPTO: Scanning {v_tracks} video track(s)...")
                for t in range(1, v_tracks + 1):
                    try:
                        items = timeline.GetItemListInTrack("video", t) or []
                    except Exception:
                        continue
                    
                    for it in items:
                        # Identify clip by name
                        nm = ""
                        try:
                            nm = it.GetName()
                        except Exception:
                            try:
                                mpit = it.GetMediaPoolItem()
                                nm = mpit.GetName() if mpit else ""
                            except Exception:
                                nm = ""
                        
                        take_match = re.search(r"(SC\d{2}T\d{2})", nm)
                        if not take_match:
                            continue
                        take = take_match.group(1)
                        if take not in take_to_shot:
                            continue
                        
                        sh = take_to_shot[take]["shot"]
                        idx = take_to_shot[take]["idx"]
                        clip_id = f"{seg.get('id')}-{sh.get('id')}-{idx}"
                        
                        # Get Concepto data for this clip
                        concepto_start_sec = video_clip_start_times.get(clip_id)
                        concepto_duration = float(sh.get("duration") or 0)
                        concepto_offset = float(sh.get("videoOffset") or 0)
                        
                        # Check if main video/image has changed and needs to be replaced
                        concepto_main_video_url = sh.get("videoUrl")
                        concepto_main_image_url = sh.get("imageUrl")
                        concepto_main_url = concepto_main_video_url or concepto_main_image_url
                        
                        # Get current clip's MediaPoolItem and file path
                        current_mp_item = None
                        current_file_path = None
                        try:
                            get_mp_item = _method(it, "GetMediaPoolItem")
                            if get_mp_item:
                                current_mp_item = it.GetMediaPoolItem()
                                if current_mp_item:
                                    # Try to get file path from MediaPoolItem
                                    try:
                                        props = current_mp_item.GetClipProperty(["File Path"])
                                        if props and isinstance(props, dict):
                                            current_file_path = props.get("File Path") or props.get("FilePath")
                                    except Exception:
                                        pass
                        except Exception:
                            pass
                        
                        # Check if we need to download and replace the file
                        needs_file_replacement = False
                        new_mp_item = None
                        
                        if concepto_main_url:
                            # Determine expected filename based on take and type
                            url_filename = os.path.basename(concepto_main_url.split("?")[0])
                            if concepto_main_video_url:
                                expected_filename = f"{take}_MAIN_video.mp4"
                            else:
                                # Image - try to get extension from URL
                                ext = ".jpg"
                                if "." in url_filename:
                                    url_ext = os.path.splitext(url_filename)[1].lower()
                                    if url_ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]:
                                        ext = url_ext
                                expected_filename = f"{take}_MAIN_image{ext}"
                            
                            # Get episode directory structure
                            show_name = _safe_slug((self.show or {}).get("name") or self.episode.get("showId") or "UnknownShow")
                            episode_name = _safe_slug(self.episode.get("title") or self.cfg.episode_id)
                            episode_dir = Path(self.cfg.download_root) / show_name / episode_name
                            take_dir = episode_dir / take
                            expected_file_path = take_dir / expected_filename
                            
                            # Check if current clip's file matches expected file path
                            current_filename = os.path.basename(current_file_path) if current_file_path else ""
                            current_file_matches = current_file_path and os.path.exists(current_file_path) and os.path.normpath(current_file_path) == os.path.normpath(str(expected_file_path))
                            
                            # Always download if URL exists (to ensure we have latest version from Concepto)
                            self._log(f"SYNC FROM CONCEPTO: [{take}] Downloading main file from Concepto: {expected_filename}")
                            try:
                                take_dir.mkdir(parents=True, exist_ok=True)
                                
                                # Download file
                                dest_file = expected_file_path
                                # Resolve URL if needed
                                resolved_url = _resolve_url(concepto_main_url, self.cfg.api_endpoint)
                                _download_file(resolved_url, dest_file)
                                self._log(f"SYNC FROM CONCEPTO: [{take}] ✓ Downloaded main file: {dest_file.name}")
                                
                                # Check if we need to replace on timeline
                                if not current_file_matches:
                                    self._log(f"SYNC FROM CONCEPTO: [{take}] File path changed: current='{current_filename}', expected='{expected_filename}' - will replace on timeline")
                                    needs_file_replacement = True
                                else:
                                    self._log(f"SYNC FROM CONCEPTO: [{take}] File path matches, but checking if MediaPoolItem needs update")
                                    # Even if file path matches, we might need to update if MediaPoolItem is different
                                    needs_file_replacement = True  # Always replace to ensure we're using the latest file
                                
                                # Import to media pool
                                seg_label = f"SC{int(seg.get('segmentNumber',0)):02d}_{_safe_slug(seg.get('title',''))}"[:80]
                                take_folder = resolve_ensure_bins(media_pool, "CONCEPTO", seg_label, take)
                                
                                # Check if item already exists in folder with same file path
                                found_item = None
                                try:
                                    folder_items = take_folder.GetClipList() if hasattr(take_folder, "GetClipList") else []
                                    for folder_item in folder_items or []:
                                        try:
                                            item_path = None
                                            props = folder_item.GetClipProperty(["File Path"])
                                            if props and isinstance(props, dict):
                                                item_path = props.get("File Path") or props.get("FilePath")
                                            if item_path and os.path.normpath(item_path) == os.path.normpath(str(dest_file)):
                                                found_item = folder_item
                                                break
                                        except Exception:
                                            pass
                                except Exception:
                                    pass
                                
                                if found_item:
                                    new_mp_item = found_item
                                    self._log(f"SYNC FROM CONCEPTO: [{take}] Found existing MediaPoolItem for file")
                                else:
                                    # Import it
                                    imported_items = resolve_import_files(media_pool, take_folder, [str(dest_file)])
                                    if imported_items:
                                        new_mp_item = imported_items[0]
                                        self._log(f"SYNC FROM CONCEPTO: [{take}] ✓ Imported file to bin")
                                    else:
                                        self._log(f"SYNC FROM CONCEPTO: [{take}] WARNING: Failed to import file")
                                        needs_file_replacement = False
                                        
                            except Exception as e:
                                self._log(f"SYNC FROM CONCEPTO: [{take}] ERROR downloading/replacing file: {e}")
                                import traceback
                                self._log(f"Traceback: {traceback.format_exc()}")
                                needs_file_replacement = False
                        
                        if concepto_start_sec is None:
                            self._log(f"SYNC FROM CONCEPTO: [{take}] No startTime in Concepto, skipping")
                            continue
                        
                        # Get current timeline position for comparison
                        current_pos_frame = None
                        for m in ["GetStart", "GetStartFrame", "GetRecordFrame", "GetLeftOffset"]:
                            fn = _method(it, m)
                            if fn:
                                try:
                                    val = fn()
                                    if val is not None:
                                        current_pos_frame = int(val)
                                        break
                                except Exception:
                                    pass
                        
                        # Calculate target timeline frame (add timeline start offset)
                        target_frame = int(round(concepto_start_sec * fps)) + timeline_start_frame
                        target_tc = _frames_to_timecode(target_frame, fps)
                        
                        # If file needs replacement, use new_mp_item; otherwise use current
                        mp_item_to_use = new_mp_item if new_mp_item else current_mp_item
                        
                        if current_pos_frame is not None:
                            current_pos_sec = (current_pos_frame - timeline_start_frame) / fps
                            self._log(f"SYNC FROM CONCEPTO: [{take}] Current pos={current_pos_sec:.3f}s (frame {current_pos_frame}), Target={concepto_start_sec:.3f}s (frame {target_frame})")
                            
                            # If file was replaced, we need to update even if position is correct
                            # Also check if we need to replace the file on timeline
                            if needs_file_replacement:
                                self._log(f"SYNC FROM CONCEPTO: [{take}] File needs replacement on timeline, will update")
                            elif abs(current_pos_frame - target_frame) <= 1:
                                self._log(f"SYNC FROM CONCEPTO: [{take}] Already at correct position, skipping move")
                                updated_count += 1
                                continue
                        else:
                            self._log(f"SYNC FROM CONCEPTO: [{take}] Could not read current position, attempting update anyway")
                        
                        self._log(f"SYNC FROM CONCEPTO: [{take}] Updating to start={concepto_start_sec:.3f}s ({target_tc}), dur={concepto_duration:.3f}s, offset={concepto_offset:.3f}s")
                        
                        # Try to move/update the clip - use multiple methods
                        moved = False
                        try:
                            # If we need to replace the file, we must use the new MediaPoolItem
                            if needs_file_replacement and new_mp_item:
                                mp_item_to_use = new_mp_item
                                self._log(f"SYNC FROM CONCEPTO: [{take}] Using new MediaPoolItem for replacement")
                            
                            # Method 1: Try DeleteClipAtTrack + InsertClipAtTrack (most reliable)
                            delete_at_track = _method(timeline, "DeleteClipAtTrack")
                            insert_at_track = _method(timeline, "InsertClipAtTrack")
                            if delete_at_track and insert_at_track and current_pos_frame is not None:
                                try:
                                    # Use the appropriate media pool item (new if replaced, current otherwise)
                                    mp_item = mp_item_to_use
                                    
                                    if mp_item:
                                        # Get current track index and trim info
                                        current_track = t
                                        # Get source IN/OUT frames
                                        source_in = None
                                        source_out = None
                                        get_props = _method(it, "GetProperty") or _method(it, "GetProperties")
                                        if get_props:
                                            try:
                                                props = get_props(["Start", "End"]) or get_props()
                                                if isinstance(props, dict):
                                                    source_in = props.get("Start") or props.get("In")
                                                    source_out = props.get("End") or props.get("Out")
                                            except Exception:
                                                pass
                                        
                                        # Delete old clip
                                        try:
                                            timeline.DeleteClipAtTrack(current_track, current_pos_frame)
                                            self._log(f"  Deleted clip at track {current_track}, frame {current_pos_frame}")
                                        except Exception as e:
                                            self._log(f"  DeleteClipAtTrack failed: {e}")
                                        
                                        # Insert at new position
                                        try:
                                            result = timeline.InsertClipAtTrack(current_track, target_frame, mp_item)
                                            if result:
                                                self._log(f"  InsertClipAtTrack successful at frame {target_frame}")
                                                # Apply trim if we have source IN/OUT
                                                if source_in is not None or source_out is not None:
                                                    new_it = result
                                                    set_prop = _method(new_it, "SetProperty")
                                                    if set_prop:
                                                        try:
                                                            if source_in is not None:
                                                                new_it.SetProperty("Start", source_in)
                                                            if source_out is not None:
                                                                new_it.SetProperty("End", source_out)
                                                            self._log(f"  Applied trim: Start={source_in}, End={source_out}")
                                                        except Exception:
                                                            pass
                                                moved = True
                                        except Exception as e:
                                            self._log(f"  InsertClipAtTrack failed: {e}")
                                            # Try to restore old position if insert failed
                                            if current_pos_frame is not None and mp_item:
                                                try:
                                                    timeline.InsertClipAtTrack(current_track, current_pos_frame, mp_item)
                                                    self._log(f"  Restored clip to original position")
                                                except Exception:
                                                    pass
                                except Exception as e:
                                    self._log(f"  Delete+Insert method failed: {e}")
                            
                            # Method 2: Try SetProperty for timeline position (if delete+insert didn't work)
                            if not moved:
                                set_prop = _method(it, "SetProperty")
                                if set_prop:
                                    try:
                                        # Try common property names for timeline position
                                        for prop_name in ["RecordFrame", "StartFrame", "Start", "LeftOffset", "Position"]:
                                            try:
                                                it.SetProperty(prop_name, target_frame)
                                                self._log(f"  Set {prop_name}={target_frame}")
                                                moved = True
                                                break
                                            except Exception as e:
                                                self._log(f"    {prop_name} failed: {e}")
                                    except Exception as e:
                                        self._log(f"  SetProperty failed: {e}")
                            
                            # Method 3: Try SetStart/SetStartFrame methods
                            if not moved:
                                for m in ["SetStart", "SetStartFrame", "SetRecordFrame", "SetLeftOffset", "SetPosition"]:
                                    fn = _method(it, m)
                                    if fn:
                                        try:
                                            fn(target_frame)
                                            self._log(f"  Called {m}({target_frame})")
                                            moved = True
                                            break
                                        except Exception as e:
                                            self._log(f"    {m} failed: {e}")
                            
                            # If we successfully moved the clip, now update duration and offset
                            if moved:
                                # Get the timeline item again (it might be a new object after insert)
                                try:
                                    items_after = timeline.GetItemListInTrack("video", t) or []
                                    new_it = None
                                    for check_it in items_after:
                                        check_nm = ""
                                        try:
                                            check_nm = check_it.GetName()
                                        except Exception:
                                            try:
                                                mpit = check_it.GetMediaPoolItem()
                                                check_nm = mpit.GetName() if mpit else ""
                                            except Exception:
                                                pass
                                        if take in check_nm:
                                            # Verify position matches
                                            check_pos = None
                                            for pos_m in ["GetStart", "GetStartFrame"]:
                                                pos_fn = _method(check_it, pos_m)
                                                if pos_fn:
                                                    try:
                                                        check_pos = int(pos_fn())
                                                        break
                                                    except Exception:
                                                        pass
                                            if check_pos is not None and abs(check_pos - target_frame) <= 2:
                                                new_it = check_it
                                                break
                                    
                                    # Use new_it if found, otherwise use original it
                                    update_it = new_it if new_it else it
                                    
                                    # Update duration if different
                                    current_dur = None
                                    for m in ["GetDuration", "GetDurationFrames"]:
                                        fn = _method(update_it, m)
                                        if fn:
                                            try:
                                                current_dur = int(fn())
                                                break
                                            except Exception:
                                                pass
                                    
                                    if current_dur is not None:
                                        target_dur_frames = int(round(concepto_duration * fps))
                                        if abs(current_dur - target_dur_frames) > 1:
                                            # Try to set duration
                                            for m in ["SetDuration", "SetDurationFrames"]:
                                                fn = _method(update_it, m)
                                                if fn:
                                                    try:
                                                        fn(target_dur_frames)
                                                        self._log(f"  Set duration to {target_dur_frames} frames")
                                                        break
                                                    except Exception as e:
                                                        self._log(f"    {m} failed: {e}")
                                    
                                    # Update offset (source in point)
                                    if concepto_offset > 0:
                                        offset_frames = int(round(concepto_offset * fps))
                                        set_prop = _method(update_it, "SetProperty")
                                        if set_prop:
                                            try:
                                                for prop_name in ["In", "Start", "StartFrame", "SourceStart"]:
                                                    try:
                                                        update_it.SetProperty(prop_name, offset_frames)
                                                        self._log(f"  Set {prop_name}={offset_frames} (offset)")
                                                        break
                                                    except Exception as e:
                                                        self._log(f"    {prop_name} failed: {e}")
                                            except Exception as e:
                                                self._log(f"  SetProperty for offset failed: {e}")
                                except Exception as e:
                                    self._log(f"  Could not update duration/offset after move: {e}")
                            
                            if moved:
                                updated_count += 1
                                self._log(f"  ✓ Successfully updated [{take}]")
                            else:
                                self._log(f"  ✗ Could not move [{take}] - all methods failed")
                        except Exception as e:
                            self._log(f"  ✗ Failed to update [{take}]: {type(e).__name__}: {e}")
                            import traceback
                            self._log(f"    Traceback: {traceback.format_exc()}")
                
                self._log(f"SYNC FROM CONCEPTO: ✓ Updated {updated_count} clip(s) on timeline")
                self._log("SYNC FROM CONCEPTO complete. Check timeline to verify changes.")
            except Exception as e:
                self._log(f"SYNC FROM CONCEPTO ERROR: {e}")
                import traceback
                self._log(f"Traceback: {traceback.format_exc()}")

        threading.Thread(target=worker, daemon=True).start()

    def on_export_av_script(self):
        """Export current timeline subtitles as SRT file for AV Script import"""
        def worker():
            try:
                self._log("EXPORT: Connecting to Resolve...")
                _resolve, project, _media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open.")

                # Get timeline settings
                fps_raw = timeline.GetSetting("timelineFrameRate")
                fps = float(fps_raw) if fps_raw else 24.0
                
                # Get timeline start timecode
                start_tc = timeline.GetStartTimecode()  # e.g. "01:00:00:00"
                parts = start_tc.split(":")
                tl_start_sec = 0.0
                if len(parts) == 4:
                    tl_start_sec = int(parts[0])*3600 + int(parts[1])*60 + int(parts[2]) + (int(parts[3])/fps)
                
                self._log(f"EXPORT: Timeline starts at {start_tc} ({tl_start_sec:.3f}s offset)")

                # Scan subtitle tracks
                get_track_count = _method(timeline, "GetTrackCount")
                get_items = _method(timeline, "GetItemListInTrack")
                
                if not get_track_count or not get_items:
                    raise RuntimeError("Cannot read timeline tracks (API missing).")
                
                s_tracks = int(timeline.GetTrackCount("subtitle") or 0)
                if s_tracks == 0:
                    raise RuntimeError("No subtitle tracks found. Create subtitles first in format: [SC01T01] - Visual description")
                
                self._log(f"EXPORT: Scanning {s_tracks} subtitle track(s)...")
                
                # Collect all subtitle entries
                subtitle_entries = []
                for t in range(1, s_tracks + 1):
                    items = timeline.GetItemListInTrack("subtitle", t) or []
                    for it in items:
                        try:
                            # Get text (try multiple methods)
                            content = ""
                            try: content = it.GetName()
                            except: pass
                            if not content:
                                try:
                                    fn = _method(it, "GetText")
                                    if fn: content = fn()
                                except: pass
                            if not content:
                                try:
                                    prop_fn = _method(it, "GetProperty")
                                    if prop_fn:
                                        content = prop_fn("Text") or prop_fn("Caption")
                                except: pass
                            
                            if not content:
                                continue
                            
                            # Get timing (start and duration)
                            start_frame = None
                            dur_frame = None
                            
                            for m in ["GetStart", "GetStartFrame"]:
                                fn = _method(it, m)
                                if fn:
                                    try:
                                        start_frame = int(fn())
                                        break
                                    except: pass
                            
                            for m in ["GetDuration", "GetDurationFrames"]:
                                fn = _method(it, m)
                                if fn:
                                    try:
                                        dur_frame = int(fn())
                                        break
                                    except: pass
                            
                            if start_frame is None or dur_frame is None:
                                self._log(f"EXPORT: Skipping subtitle - could not read timing")
                                continue
                            
                            # Convert to relative seconds (subtract timeline start)
                            rel_start_sec = (start_frame - int(tl_start_sec * fps)) / fps
                            dur_sec = dur_frame / fps
                            
                            # Look for [SCxxTxx] pattern
                            take_match = re.search(r"\[?\s*(SC\d{2}T\d{2})\s*\]?", content)
                            if not take_match:
                                # Try to extract visual description anyway (might be just text)
                                visual_desc = content.strip()
                            else:
                                take = take_match.group(1)
                                # Extract visual description after [SCxxTxx]
                                visual_desc = re.sub(r"\[?\s*SC\d{2}T\d{2}\s*\]?\s*-?\s*", "", content, flags=re.IGNORECASE).strip()
                            
                            if visual_desc:
                                subtitle_entries.append({
                                    'start': rel_start_sec,
                                    'duration': dur_sec,
                                    'text': content,  # Keep full text with [SCxxTxx]
                                    'visual': visual_desc
                                })
                                
                        except Exception as e:
                            self._log(f"EXPORT: Error reading subtitle item: {e}")
                            continue
                
                if not subtitle_entries:
                    raise RuntimeError("No valid subtitles found. Use format: [SC01T01] - Visual description")
                
                # Sort by start time
                subtitle_entries.sort(key=lambda x: x['start'])
                self._log(f"EXPORT: Found {len(subtitle_entries)} subtitle entries")
                
                # Generate SRT
                def to_srt_time(secs):
                    h = int(secs // 3600)
                    m = int((secs % 3600) // 60)
                    s = int(secs % 60)
                    ms = int((secs % 1) * 1000)
                    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
                
                srt_lines = []
                for i, entry in enumerate(subtitle_entries):
                    start_sec = entry['start']
                    end_sec = start_sec + entry['duration']
                    text = entry['text'].replace('\n', ' ')  # SRT format
                    
                    srt_lines.append(str(i + 1))
                    srt_lines.append(f"{to_srt_time(start_sec)} --> {to_srt_time(end_sec)}")
                    srt_lines.append(text)
                    srt_lines.append("")
                
                srt_content = "\n".join(srt_lines)
                
                # Save to Downloads folder or user-selected location
                import tkinter.filedialog
                from pathlib import Path
                
                default_name = f"av_script_export_{timeline.GetName() or 'timeline'}.srt"
                default_path = Path.home() / "Downloads" / default_name
                
                save_path = tkinter.filedialog.asksaveasfilename(
                    defaultextension=".srt",
                    filetypes=[("SRT files", "*.srt"), ("All files", "*.*")],
                    initialfile=default_name,
                    initialdir=str(default_path.parent)
                )
                
                if not save_path:
                    self._log("EXPORT: Cancelled by user.")
                    return
                
                with open(save_path, "w", encoding="utf-8") as f:
                    f.write(srt_content)
                
                self._log(f"✓ EXPORT: Saved {len(subtitle_entries)} entries to {save_path}")
                self._log(f"You can now import this SRT file in Concepto AV Script page.")
                
            except Exception as e:
                self._log(f"EXPORT ERROR: {e}")
                import traceback
                self._log(f"Traceback: {traceback.format_exc()}")

        threading.Thread(target=worker, daemon=True).start()

    def on_export_srt_video(self):
        """Export SRT + MAIN track media and sync to Concepto AV Script/Preview"""
        def worker():
            try:
                if not self.client or not self.episode:
                    raise RuntimeError("Load an episode first.")

                self._log("EXPORT SRT+VIDEO: Connecting to Resolve...")
                _resolve, project, _media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open.")

                fps, tl_start_sec, start_tc = _get_timeline_settings(timeline)
                self._log(f"EXPORT SRT+VIDEO: Timeline starts at {start_tc} ({tl_start_sec:.3f}s offset)")

                subtitle_entries = _collect_subtitle_entries(timeline, fps, tl_start_sec, self._log)
                if not subtitle_entries:
                    raise RuntimeError("No valid subtitles found. Use format: [SC01T01] - Visual description")

                shots_payload: List[Dict[str, Any]] = []
                for idx, entry in enumerate(subtitle_entries):
                    take = entry.get("take")
                    if not take:
                        self._log("EXPORT SRT+VIDEO: Skipping subtitle without take code")
                        continue
                    seg_num = 1
                    take_match = re.search(r"SC(\d{2})T(\d{2})", take, re.IGNORECASE)
                    if take_match:
                        seg_num = int(take_match.group(1))
                    shots_payload.append({
                        "take": take,
                        "visual": entry.get("visual") or "",
                        "audio": "",
                        "duration": float(entry.get("duration") or 0),
                        "segmentNumber": seg_num,
                        "order": idx,
                    })

                if not shots_payload:
                    raise RuntimeError("No valid subtitles with SCxxTxx codes found.")

                self._log(f"EXPORT SRT+VIDEO: Importing {len(shots_payload)} shots to Concepto...")
                self.client.import_av_script(self.cfg.episode_id, shots_payload)

                # Refresh episode
                ep = self.client.get_episode(self.cfg.episode_id)
                self.episode = ep

                segments = ((ep.get("avScript") or {}).get("segments") or [])
                take_to_shot: Dict[str, Dict[str, Any]] = {}
                for seg in segments:
                    for shot in seg.get("shots") or []:
                        take_val = (shot.get("take") or "").upper()
                        if take_val:
                            take_to_shot[take_val] = {"shot": shot, "segment": seg}

                clips = _collect_main_track_clips(timeline, fps, tl_start_sec, self._log)
                if not clips:
                    self._log("EXPORT SRT+VIDEO: No MAIN track clips found.")
                else:
                    self._log(f"EXPORT SRT+VIDEO: Found {len(clips)} clip(s) on MAIN track:")
                    for clip in clips:
                        self._log(f"  - {clip.get('item_name')} -> take: {clip.get('take')}, file: {clip.get('file_path') or 'NOT FOUND'}")

                self._log(f"EXPORT SRT+VIDEO: Available shots in Concepto after import: {list(take_to_shot.keys())}")

                take_to_clip_id: Dict[str, str] = {}
                for seg in segments:
                    for idx, shot in enumerate(seg.get("shots") or []):
                        take_val = (shot.get("take") or "").upper()
                        if take_val:
                            take_to_clip_id[take_val] = f"{seg.get('id')}-{shot.get('id')}-{idx}"

                video_start_times: Dict[str, float] = {}
                for clip in clips:
                    clip_id = take_to_clip_id.get(clip["take"])
                    if clip_id:
                        video_start_times[clip_id] = float(clip["start"])
                    else:
                        self._log(f"EXPORT SRT+VIDEO: No clip_id mapping for take {clip['take']} (shot not in Concepto yet)")

                if video_start_times:
                    self.client.update_video_clip_start_times(self.cfg.episode_id, video_start_times)
                    self._log(f"EXPORT SRT+VIDEO: Updated {len(video_start_times)} clip start times")

                # Upload media + update duration/offset
                processed_takes = set()
                for clip in clips:
                    take = clip["take"]
                    self._log(f"EXPORT SRT+VIDEO: Processing clip: {clip.get('item_name')} (take: {take})")
                    if take in processed_takes:
                        self._log(f"EXPORT SRT+VIDEO: Duplicate take {take} on MAIN track, skipping")
                        continue
                    processed_takes.add(take)
                    mapping = take_to_shot.get(take)
                    if not mapping:
                        self._log(f"EXPORT SRT+VIDEO: No matching shot for take {take}, skipping upload")
                        self._log(f"EXPORT SRT+VIDEO: Available takes in Concepto: {list(take_to_shot.keys())}")
                        self._log(f"EXPORT SRT+VIDEO: This usually means the shot wasn't created from SRT import. Check if subtitle had [{take}] format.")
                        continue

                    shot = mapping["shot"]
                    seg = mapping["segment"]

                    # Always update duration and offset from timeline (this reflects current state)
                    try:
                        new_duration = float(clip["duration"])
                        new_offset = float(clip["offset"])
                        old_duration = float(shot.get("duration") or 0)
                        old_offset = float(shot.get("videoOffset") or 0)
                        
                        if abs(new_duration - old_duration) > 0.01 or abs(new_offset - old_offset) > 0.01:
                            self._log(f"[{take}] Updating duration: {old_duration:.2f}s -> {new_duration:.2f}s, offset: {old_offset:.2f}s -> {new_offset:.2f}s")
                            self.client.update_shot(shot.get("id"), {
                                "duration": new_duration,
                                "videoOffset": new_offset,
                            })
                        else:
                            self._log(f"[{take}] Duration/offset unchanged: {new_duration:.2f}s, offset: {new_offset:.2f}s")
                    except Exception as e:
                        self._log(f"[{take}] Warning: Could not update duration/offset: {e}")

                    file_path = clip.get("file_path")
                    if not file_path:
                        self._log(f"[{take}] Warning: No file path available for '{clip.get('item_name')}'. Cannot upload.")
                        self._log(f"[{take}] Tip: The clip is on the timeline but source file path could not be determined.")
                        continue
                    
                    if not os.path.exists(file_path):
                        self._log(f"[{take}] Warning: File not found at '{file_path}' for '{clip.get('item_name')}'. Cannot upload.")
                        continue
                    
                    # Check if file with same name already exists in Concepto
                    file_name = os.path.basename(file_path)
                    existing_url = shot.get("videoUrl") if clip["clip_type"] == "video" else shot.get("imageUrl")
                    should_upload = True
                    
                    if existing_url:
                        # Extract filename from URL (handle both full URLs and relative paths)
                        existing_filename = os.path.basename(existing_url.split("?")[0])  # Remove query params
                        if existing_filename.lower() == file_name.lower():
                            self._log(f"[{take}] File '{file_name}' already exists in Concepto with same name, skipping upload")
                            should_upload = False
                        else:
                            self._log(f"[{take}] Different file name: existing='{existing_filename}', new='{file_name}' - will upload")
                    
                    if should_upload:
                        if clip["clip_type"] == "video":
                            self._log(f"[{take}] Uploading video: {file_name}")
                            try:
                                url = self.client.upload_shot_video(
                                    shot.get("id"),
                                    file_path,
                                    self.cfg.episode_id,
                                    seg.get("id"),
                                    mode="replace",  # Use replace to update existing video
                                    set_main=True,
                                )
                                self._log(f"[{take}] ✓ Uploaded video -> {url}")
                            except Exception as e:
                                self._log(f"[{take}] ✗ Video upload failed: {e}")
                        else:
                            self._log(f"[{take}] Uploading image: {file_name}")
                            try:
                                url = self.client.upload_shot_image(
                                    shot.get("id"),
                                    file_path,
                                    self.cfg.episode_id,
                                    seg.get("id"),
                                    mode="replace",  # Use replace to update existing image
                                )
                                self._log(f"[{take}] ✓ Uploaded image -> {url}")
                            except Exception as e:
                                self._log(f"[{take}] ✗ Image upload failed: {e}")

                # Export audio tracks to AV Preview
                self._log("EXPORT SRT+VIDEO: Exporting audio tracks...")
                try:
                    a_tracks = int(timeline.GetTrackCount("audio") or 0)
                    if a_tracks > 0:
                        self._log(f"EXPORT SRT+VIDEO: Found {a_tracks} audio track(s)")
                        
                        audio_tracks_data: List[Dict[str, Any]] = []
                        temp_audio_files: List[str] = []
                        
                        for track_idx in range(1, a_tracks + 1):
                            items = timeline.GetItemListInTrack("audio", track_idx) or []
                            if not items:
                                continue
                            
                            # Get track name (try various methods)
                            track_name = f"Audio {track_idx}"
                            try:
                                get_track_name = _method(timeline, "GetTrackName")
                                if get_track_name:
                                    name_result = timeline.GetTrackName("audio", track_idx)
                                    if name_result:
                                        track_name = name_result
                            except Exception:
                                pass
                            
                            self._log(f"EXPORT SRT+VIDEO: Processing audio track {track_idx}: '{track_name}' ({len(items)} clips)")
                            
                            clips_data: List[Dict[str, Any]] = []
                            
                            for item_idx, item in enumerate(items):
                                try:
                                    item_name = getattr(item, "GetName", lambda: "(unknown)")()
                                    
                                    # Get timeline position
                                    start_frame = None
                                    for m in ["GetStart", "GetStartFrame"]:
                                        fn = _method(item, m)
                                        if fn:
                                            try:
                                                start_frame = int(fn())
                                                break
                                            except Exception:
                                                pass
                                    
                                    # Get duration
                                    dur_frame = None
                                    for m in ["GetDuration", "GetDurationFrames"]:
                                        fn = _method(item, m)
                                        if fn:
                                            try:
                                                dur_frame = int(fn())
                                                break
                                            except Exception:
                                                pass
                                    
                                    if start_frame is None or dur_frame is None:
                                        self._log(f"EXPORT SRT+VIDEO: Skipping audio clip '{item_name}' - could not read timing")
                                        continue
                                    
                                    # Convert to relative seconds
                                    rel_start_sec = (start_frame - int(tl_start_sec * fps)) / fps
                                    dur_sec = dur_frame / fps
                                    
                                    # Get source offset
                                    offset_frame = 0
                                    for prop_name in ["SourceStart", "In", "StartFrame"]:
                                        try:
                                            get_prop = _method(item, "GetProperty")
                                            if get_prop:
                                                prop_val = get_prop(prop_name)
                                                if prop_val is not None:
                                                    offset_frame = int(prop_val)
                                                    break
                                        except Exception:
                                            pass
                                    offset_sec = offset_frame / fps
                                    
                                    # Get volume
                                    volume = 1.0
                                    try:
                                        get_prop = _method(item, "GetProperty")
                                        if get_prop:
                                            vol_val = get_prop("AudioLevels") or get_prop("Volume")
                                            if vol_val is not None:
                                                if isinstance(vol_val, (list, tuple)) and len(vol_val) > 0:
                                                    vol_db = float(vol_val[0])
                                                    volume = max(0.0, min(1.0, 10 ** (vol_db / 20)))
                                                elif isinstance(vol_val, (int, float)):
                                                    volume = max(0.0, min(1.0, float(vol_val)))
                                    except Exception:
                                        pass
                                    
                                    # Get MediaPoolItem
                                    media_pool_item = None
                                    try:
                                        get_mp_item = _method(item, "GetMediaPoolItem")
                                        if get_mp_item:
                                            media_pool_item = item.GetMediaPoolItem()
                                    except Exception:
                                        pass
                                    
                                    if not media_pool_item:
                                        self._log(f"EXPORT SRT+VIDEO: Warning: Could not get MediaPoolItem for '{item_name}', skipping")
                                        continue
                                    
                                    # Get file path
                                    file_path = None
                                    try:
                                        get_file_path = _method(media_pool_item, "GetClipProperty")
                                        if get_file_path:
                                            props = media_pool_item.GetClipProperty(["File Path"])
                                            if props and isinstance(props, dict):
                                                file_path = props.get("File Path") or props.get("FilePath")
                                    except Exception:
                                        pass
                                    
                                    if not file_path or not os.path.exists(file_path):
                                        self._log(f"EXPORT SRT+VIDEO: Warning: Source file not found for '{item_name}', skipping")
                                        continue
                                    
                                    # Copy file to temp location
                                    file_ext = os.path.splitext(file_path)[1][1:] or 'mp3'
                                    export_filename = f"{_safe_slug(track_name)}_{item_idx+1}_{_safe_slug(item_name)}.{file_ext}"
                                    export_dir = Path(self.cfg.download_root) / "_temp_audio_export"
                                    export_dir.mkdir(parents=True, exist_ok=True)
                                    export_path = export_dir / export_filename
                                    
                                    import shutil
                                    shutil.copy2(file_path, export_path)
                                    temp_audio_files.append(str(export_path))
                                    
                                    # Upload to Concepto
                                    try:
                                        audio_url = self.client.upload_audio_clip(self.cfg.episode_id, str(export_path))
                                        
                                        # Get source duration
                                        source_duration_sec = 0.0
                                        try:
                                            src_dur_val = media_pool_item.GetClipProperty("Duration")
                                            if src_dur_val:
                                                if ":" in str(src_dur_val):
                                                    parts = str(src_dur_val).split(":")
                                                    if len(parts) == 4:
                                                        source_duration_sec = int(parts[0])*3600 + int(parts[1])*60 + int(parts[2]) + (int(parts[3])/fps)
                                                else:
                                                    source_duration_sec = float(src_dur_val) / fps
                                        except Exception:
                                            pass
                                        
                                        clips_data.append({
                                            "id": f"clip_{track_idx}_{item_idx}_{int(time.time())}",
                                            "name": item_name,
                                            "url": audio_url,
                                            "startTime": rel_start_sec,
                                            "duration": dur_sec,
                                            "offset": offset_sec,
                                            "volume": volume,
                                            "sourceDuration": source_duration_sec or dur_sec
                                        })
                                        self._log(f"EXPORT SRT+VIDEO: ✓ Uploaded audio clip '{item_name}' from track '{track_name}'")
                                    except Exception as e:
                                        self._log(f"EXPORT SRT+VIDEO: ✗ Failed to upload audio clip '{item_name}': {e}")
                                
                                except Exception as e:
                                    self._log(f"EXPORT SRT+VIDEO: Error processing audio clip: {e}")
                                    continue
                            
                            if clips_data:
                                audio_tracks_data.append({
                                    "id": f"track_{track_idx}",
                                    "name": track_name,
                                    "type": "audio",
                                    "clips": clips_data,
                                    "isMuted": False,
                                    "volume": 1.0
                                })
                        
                        if audio_tracks_data:
                            self._log(f"EXPORT SRT+VIDEO: Sending {len(audio_tracks_data)} audio track(s) to Concepto...")
                            self.client.update_audio_tracks(self.cfg.episode_id, audio_tracks_data)
                            self._log(f"EXPORT SRT+VIDEO: ✓ Successfully exported {len(audio_tracks_data)} audio track(s) to AV Preview")
                        else:
                            self._log("EXPORT SRT+VIDEO: No audio clips were successfully exported")
                        
                        # Cleanup temp files
                        for temp_file in temp_audio_files:
                            try:
                                if os.path.exists(temp_file):
                                    os.remove(temp_file)
                            except Exception:
                                pass
                        # Remove temp directory if empty
                        try:
                            export_dir = Path(self.cfg.download_root) / "_temp_audio_export"
                            if export_dir.exists():
                                try:
                                    export_dir.rmdir()
                                except Exception:
                                    pass
                        except Exception:
                            pass
                    else:
                        self._log("EXPORT SRT+VIDEO: No audio tracks found in timeline")
                except Exception as e:
                    self._log(f"EXPORT SRT+VIDEO: Error exporting audio tracks: {e}")
                    import traceback
                    self._log(f"Traceback: {traceback.format_exc()}")

                self._log("EXPORT SRT+VIDEO: Complete.")
            except Exception as e:
                self._log(f"EXPORT SRT+VIDEO ERROR: {e}")
                import traceback
                self._log(f"Traceback: {traceback.format_exc()}")

        threading.Thread(target=worker, daemon=True).start()

    def on_export_audio(self):
        """Export audio tracks from Resolve timeline to Concepto AV Preview"""
        def worker():
            try:
                if not self.client or not self.episode or not self.selected_segment_id:
                    raise RuntimeError("Load an episode and select a segment first.")

                self._log("EXPORT AUDIO: Connecting to Resolve...")
                _resolve, project, media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open.")

                # Get timeline settings
                fps_raw = timeline.GetSetting("timelineFrameRate")
                fps = float(fps_raw) if fps_raw else 24.0
                
                # Get timeline start timecode
                start_tc = timeline.GetStartTimecode()
                parts = start_tc.split(":")
                tl_start_sec = 0.0
                if len(parts) == 4:
                    tl_start_sec = int(parts[0])*3600 + int(parts[1])*60 + int(parts[2]) + (int(parts[3])/fps)
                
                self._log(f"EXPORT AUDIO: Timeline starts at {start_tc} ({tl_start_sec:.3f}s offset)")

                # Scan audio tracks
                get_track_count = _method(timeline, "GetTrackCount")
                get_items = _method(timeline, "GetItemListInTrack")
                
                if not get_track_count or not get_items:
                    raise RuntimeError("Cannot read timeline tracks (API missing).")
                
                a_tracks = int(timeline.GetTrackCount("audio") or 0)
                if a_tracks == 0:
                    raise RuntimeError("No audio tracks found in timeline.")
                
                self._log(f"EXPORT AUDIO: Found {a_tracks} audio track(s)")

                # Collect audio tracks data
                audio_tracks_data: List[Dict[str, Any]] = []
                temp_audio_files: List[str] = []  # Track temp files for cleanup

                try:
                    for track_idx in range(1, a_tracks + 1):
                        items = timeline.GetItemListInTrack("audio", track_idx) or []
                        if not items:
                            continue
                        
                        # Get track name (try various methods)
                        track_name = f"Audio {track_idx}"
                        try:
                            get_track_name = _method(timeline, "GetTrackName")
                            if get_track_name:
                                name_result = timeline.GetTrackName("audio", track_idx)
                                if name_result:
                                    track_name = name_result
                        except Exception:
                            pass
                        
                        self._log(f"EXPORT AUDIO: Processing track {track_idx}: '{track_name}' ({len(items)} clips)")

                        clips_data: List[Dict[str, Any]] = []
                        
                        for item_idx, item in enumerate(items):
                            try:
                                # Get clip properties
                                item_name = getattr(item, "GetName", lambda: "(unknown)")()
                                
                                # Get timeline position (start time)
                                start_frame = None
                                for m in ["GetStart", "GetStartFrame"]:
                                    fn = _method(item, m)
                                    if fn:
                                        try:
                                            start_frame = int(fn())
                                            break
                                        except Exception:
                                            pass
                                
                                # Get duration
                                dur_frame = None
                                for m in ["GetDuration", "GetDurationFrames"]:
                                    fn = _method(item, m)
                                    if fn:
                                        try:
                                            dur_frame = int(fn())
                                            break
                                        except Exception:
                                            pass
                                
                                if start_frame is None or dur_frame is None:
                                    self._log(f"EXPORT AUDIO: Skipping clip '{item_name}' - could not read timing")
                                    continue
                                
                                # Convert to relative seconds (subtract timeline start)
                                rel_start_sec = (start_frame - int(tl_start_sec * fps)) / fps
                                dur_sec = dur_frame / fps
                                
                                # Get source offset (trim in point)
                                offset_frame = 0
                                for prop_name in ["SourceStart", "In", "StartFrame"]:
                                    try:
                                        get_prop = _method(item, "GetProperty")
                                        if get_prop:
                                            prop_val = get_prop(prop_name)
                                            if prop_val is not None:
                                                offset_frame = int(prop_val)
                                                break
                                    except Exception:
                                        pass
                                offset_sec = offset_frame / fps
                                
                                # Get volume (0-1)
                                volume = 1.0
                                try:
                                    get_prop = _method(item, "GetProperty")
                                    if get_prop:
                                        vol_val = get_prop("AudioLevels") or get_prop("Volume")
                                        if vol_val is not None:
                                            # Resolve uses dB, convert to linear (approximate)
                                            if isinstance(vol_val, (list, tuple)) and len(vol_val) > 0:
                                                vol_db = float(vol_val[0])
                                                volume = max(0.0, min(1.0, 10 ** (vol_db / 20)))  # dB to linear
                                            elif isinstance(vol_val, (int, float)):
                                                volume = max(0.0, min(1.0, float(vol_val)))
                                except Exception:
                                    pass
                                
                                # Get MediaPoolItem to find source file
                                media_pool_item = None
                                try:
                                    get_mp_item = _method(item, "GetMediaPoolItem")
                                    if get_mp_item:
                                        media_pool_item = item.GetMediaPoolItem()
                                except Exception:
                                    pass
                                
                                if not media_pool_item:
                                    self._log(f"EXPORT AUDIO: Warning: Could not get MediaPoolItem for '{item_name}', skipping")
                                    continue
                                
                                # Get file path from MediaPoolItem
                                file_path = None
                                try:
                                    get_file_path = _method(media_pool_item, "GetClipProperty")
                                    if get_file_path:
                                        props = media_pool_item.GetClipProperty(["File Path"])
                                        if props and isinstance(props, dict):
                                            file_path = props.get("File Path") or props.get("FilePath")
                                except Exception:
                                    pass
                                
                                if not file_path or not os.path.exists(file_path):
                                    self._log(f"EXPORT AUDIO: Warning: Source file not found for '{item_name}', skipping")
                                    continue
                                
                                # Export audio clip (copy source file for now - could render trimmed version later)
                                file_ext = os.path.splitext(file_path)[1][1:] or 'mp3'
                                export_filename = f"{_safe_slug(track_name)}_{item_idx+1}_{_safe_slug(item_name)}.{file_ext}"
                                
                                # Create temp export directory
                                export_dir = Path(self.cfg.download_root) / "_temp_audio_export"
                                export_dir.mkdir(parents=True, exist_ok=True)
                                export_path = export_dir / export_filename
                                
                                # Copy file (or could render trimmed version here)
                                import shutil
                                shutil.copy2(file_path, export_path)
                                temp_audio_files.append(str(export_path))
                                
                                self._log(f"EXPORT AUDIO: Exporting '{item_name}' -> {export_filename} (start={rel_start_sec:.3f}s, dur={dur_sec:.3f}s, offset={offset_sec:.3f}s)")
                                
                                # Upload to Concepto
                                try:
                                    audio_url = self.client.upload_audio_clip(self.cfg.episode_id, str(export_path))
                                    self._log(f"EXPORT AUDIO: ✓ Uploaded '{item_name}' -> {audio_url}")
                                    
                                    # Get source duration
                                    source_duration_sec = 0.0
                                    try:
                                        src_dur_val = media_pool_item.GetClipProperty("Duration")
                                        if src_dur_val:
                                            if ":" in str(src_dur_val):
                                                parts = str(src_dur_val).split(":")
                                                if len(parts) == 4:
                                                    source_duration_sec = int(parts[0])*3600 + int(parts[1])*60 + int(parts[2]) + (int(parts[3])/fps)
                                            else:
                                                source_duration_sec = float(src_dur_val) / fps
                                    except:
                                        pass

                                    clips_data.append({
                                        "id": f"clip_{track_idx}_{item_idx}",
                                        "name": item_name,
                                        "url": audio_url,
                                        "startTime": rel_start_sec,
                                        "duration": dur_sec,
                                        "offset": offset_sec,
                                        "volume": volume,
                                        "sourceDuration": source_duration_sec or dur_sec
                                    })
                                except Exception as e:
                                    self._log(f"EXPORT AUDIO: ✗ Failed to upload '{item_name}': {e}")
                                
                            except Exception as e:
                                self._log(f"EXPORT AUDIO: Error processing clip: {e}")
                                import traceback
                                self._log(f"EXPORT AUDIO: Traceback: {traceback.format_exc()}")
                        
                        if clips_data:
                            audio_tracks_data.append({
                                "id": f"track_{track_idx}",
                                "name": track_name,
                                "type": "audio",
                                "clips": clips_data,
                                "isMuted": False,
                                "volume": 1.0
                            })
                    
                    if not audio_tracks_data:
                        raise RuntimeError("No audio clips were successfully exported.")
                    
                    # Send to Concepto
                    self._log(f"EXPORT AUDIO: Sending {len(audio_tracks_data)} track(s) with {sum(len(t['clips']) for t in audio_tracks_data)} clip(s) to Concepto...")
                    self.client.update_audio_tracks(self.cfg.episode_id, audio_tracks_data)
                    
                    self._log(f"✓ EXPORT AUDIO: Successfully exported {len(audio_tracks_data)} audio track(s) to AV Preview")
                    self._log(f"You can now see the audio tracks in Concepto AV Preview.")
                    
                finally:
                    # Cleanup temp files
                    for temp_file in temp_audio_files:
                        try:
                            if os.path.exists(temp_file):
                                os.remove(temp_file)
                        except Exception:
                            pass
                    # Remove temp directory if empty
                    try:
                        export_dir = Path(self.cfg.download_root) / "_temp_audio_export"
                        if export_dir.exists():
                            try:
                                export_dir.rmdir()
                            except Exception:
                                pass
                    except Exception:
                        pass
                
            except Exception as e:
                self._log(f"EXPORT AUDIO ERROR: {e}")
                import traceback
                self._log(f"Traceback: {traceback.format_exc()}")

        threading.Thread(target=worker, daemon=True).start()

    def on_import_to_timeline(self):
        """Import Concepto-generated videos into current timeline on NEW tracks (same logic as Download+Build but uses existing timeline)"""
        def worker():
            try:
                if not self.episode or not self.selected_segment_id or not self.client:
                    raise RuntimeError("Load an episode and select a segment first.")

                # Resolve context
                self._log("IMPORT: Connecting to Resolve...")
                _resolve, project, media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open. Please open a timeline first.")
                
                self._log(f"IMPORT: Using current timeline: {getattr(timeline,'GetName',lambda:'(unknown)')()}")

                # Determine show/episode folder
                show_name = _safe_slug((self.show or {}).get("name") or self.episode.get("showId") or "UnknownShow")
                episode_name = _safe_slug(self.episode.get("title") or self.cfg.episode_id)
                base_dir = Path(self.download_root_edit.text().strip() or DOWNLOAD_ROOT_DEFAULT)
                episode_dir = base_dir / show_name / episode_name
                episode_dir.mkdir(parents=True, exist_ok=True)
                self._log(f"IMPORT: Local episode folder: {episode_dir}")

                # Find selected segment
                segments = ((self.episode.get("avScript") or {}).get("segments") or [])
                seg = next((s for s in segments if s.get("id") == self.selected_segment_id), None)
                if not seg:
                    raise RuntimeError("Selected segment not found.")

                # Use RAW order for clipId + startTimes to match Concepto AVPreview indexing.
                shots_raw = seg.get("shots") or []
                start_times = self._compute_visual_start_times(seg, shots_raw)

                # Find highest existing video and audio track numbers
                get_track_count = _method(timeline, "GetTrackCount")
                if not get_track_count:
                    raise RuntimeError("Cannot read timeline tracks.")
                
                max_v_track = int(timeline.GetTrackCount("video") or 0)
                max_a_track = int(timeline.GetTrackCount("audio") or 0)
                
                # Create NEW tracks for imported content (to avoid overwriting existing)
                new_v_track = max_v_track + 1
                new_a_track_start = max_a_track + 1
                
                add_track = _method(timeline, "AddTrack")
                if add_track:
                    timeline.AddTrack("video")
                    self._log(f"IMPORT: Created new video track V{new_v_track} (to avoid overwriting existing tracks)")
                    
                    # Create audio tracks (will be used for AVPreview audio)
                    timeline.AddTrack("audio")
                    timeline.AddTrack("audio")
                    self._log(f"IMPORT: Created new audio tracks A{new_a_track_start}+ (for AVPreview audio)")

                # Collect audio track assets once for the entire segment
                audio_track_assets = _collect_audio_track_assets(
                    self.episode,
                    self.selected_segment_id,
                    api_endpoint=self.cfg.api_endpoint,
                    log_callback=self._log,
                )
                audio_local_files: List[str] = []
                
                if audio_track_assets:
                    audio_dir = episode_dir / "AVPreview_Audio"
                    audio_dir.mkdir(parents=True, exist_ok=True)
                    self._log(f"IMPORT: Downloading {len(audio_track_assets)} audio track assets from AV Preview...")
                    for url, filename in audio_track_assets:
                        ext = os.path.splitext(url.split("?")[0])[1]
                        if not os.path.splitext(filename)[1] and ext:
                            filename = filename + ext
                        dest = audio_dir / _safe_slug(filename)
                        if not dest.exists():
                            try:
                                _download_file(url, dest)
                                self._log(f"IMPORT: Downloaded audio track: {dest.name}")
                                audio_local_files.append(str(dest))
                            except Exception as e:
                                self._log(f"IMPORT: Failed to download audio track {filename}: {e}")
                                continue
                        else:
                            audio_local_files.append(str(dest))

                # Process takes - sort by order (row) to ensure proper sequencing
                sorted_shots = sorted(shots_raw, key=lambda s: (float(s.get("order", 0) or 0), float(s.get("shotNumber", 0) or 0)))
                self._log(f"IMPORT: Processing {len(sorted_shots)} shots in order (sorted by row/order field)")
                
                for idx, shot in enumerate(sorted_shots):
                    take = (shot.get("take") or f"TAKE_{idx+1:03d}").replace("_image", "")
                    take_dir = episode_dir / take
                    take_dir.mkdir(parents=True, exist_ok=True)

                    # Download assets (same as on_download_build)
                    assets = _collect_take_assets(shot, self.cfg.api_endpoint)
                    local_files: List[str] = []
                    for url, filename in assets:
                        ext = os.path.splitext(url.split("?")[0])[1]
                        if not os.path.splitext(filename)[1] and ext:
                            filename = filename + ext
                        dest = take_dir / _safe_slug(filename)
                        if not dest.exists():
                            try:
                                _download_file(url, dest)
                                self._log(f"IMPORT: [{take}] Downloaded: {dest.name}")
                            except Exception as e:
                                self._log(f"IMPORT: [{take}] Failed to download {filename}: {e}")
                                continue
                        local_files.append(str(dest))

                    # Create bins + import (using CONCEPTO_IMPORTED prefix to distinguish)
                    seg_label = f"SC{int(seg.get('segmentNumber',0)):02d}_{_safe_slug(seg.get('title',''))}"[:80]
                    take_folder = resolve_ensure_bins(media_pool, "CONCEPTO_IMPORTED", seg_label, take)
                    imported = resolve_import_files(media_pool, take_folder, local_files)
                    self._log(f"IMPORT: [{take}] Imported {len(imported)} items into bin.")

                    # Place main on timeline (same logic as on_download_build)
                    main_video_url = shot.get("videoUrl")
                    main_image_url = shot.get("imageUrl")
                    main_url = main_video_url or main_image_url
                    
                    if not main_url:
                        self._log(f"IMPORT: [{take}] No main video/image URL, skipping timeline placement")
                        continue

                    # Determine which type of main asset we have
                    has_video = bool(main_video_url)
                    has_image = bool(main_image_url)
                    self._log(f"IMPORT: [{take}] Main asset: video={has_video}, image={has_image}")

                    # Find matching local file for main
                    main_file = None
                    if has_video:
                        for f in local_files:
                            if f.endswith(".mp4") and "MAIN_video" in os.path.basename(f):
                                main_file = f
                                self._log(f"IMPORT: [{take}] Found main video file: {os.path.basename(f)}")
                                break
                    
                    if not main_file and has_image:
                        for f in local_files:
                            basename = os.path.basename(f).lower()
                            if "MAIN_image" in basename and any(basename.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
                                main_file = f
                                self._log(f"IMPORT: [{take}] Found main image file: {os.path.basename(f)}")
                                break
                    
                    # Fallback
                    if not main_file:
                        if has_video:
                            for f in local_files:
                                if f.endswith(".mp4"):
                                    main_file = f
                                    self._log(f"IMPORT: [{take}] Using fallback video file: {os.path.basename(f)}")
                                    break
                        elif has_image:
                            for f in local_files:
                                basename = os.path.basename(f).lower()
                                if any(basename.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
                                    main_file = f
                                    self._log(f"IMPORT: [{take}] Using fallback image file: {os.path.basename(f)}")
                                    break
                    
                    if not main_file and local_files:
                        main_file = local_files[0]
                        self._log(f"IMPORT: [{take}] Using first available file as main: {os.path.basename(main_file)}")
                    
                    if not main_file:
                        self._log(f"IMPORT: [{take}] WARNING: Could not find main file in downloaded assets!")
                        continue

                    # Find media pool item that matches the imported main file
                    main_item = imported[0] if imported else None
                    get_clips = _method(take_folder, "GetClipList")
                    if get_clips and main_file:
                        want = os.path.basename(main_file)
                        for it in take_folder.GetClipList() or []:
                            nm = getattr(it, "GetName", lambda: "")()
                            if nm == want or want in nm:
                                main_item = it
                                break

                    if not main_item:
                        self._log(f"IMPORT: [{take}] Could not find MediaPoolItem for main, skipping timeline.")
                        continue

                    clip_id = f"{seg.get('id')}-{shot.get('id')}-{idx}"
                    start_sec = float(start_times.get(clip_id, 0.0))
                    dur_sec = float(shot.get("duration") or 0)
                    if dur_sec <= 0:
                        dur_sec = 3.0
                    off_sec = float(shot.get("videoOffset") or 0) or 0.0

                    item_name = getattr(main_item, "GetName", lambda: "(unknown)")()
                    self._log(f"IMPORT: [{take}] Placing '{item_name}' on NEW track V{new_v_track}: start={start_sec}s dur={dur_sec}s offset={off_sec}s")
                    
                    # Ensure timeline is current
                    try:
                        project.SetCurrentTimeline(timeline)
                    except Exception:
                        pass
                    
                    # Place on NEW video track (not overwriting existing)
                    is_image = main_file and any(main_file.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"])
                    track_type = "video"
                    try:
                        resolve_place_on_timeline(project, media_pool, timeline, main_item, record_seconds=start_sec, duration_seconds=dur_sec, offset_seconds=off_sec, log_callback=self._log, track_index=new_v_track, track_type=track_type)
                        self._log(f"IMPORT: [{take}] ✓ Successfully placed on NEW track V{new_v_track}")
                    except Exception as e:
                        self._log(f"IMPORT: [{take}] ✗ Failed to place on timeline: {type(e).__name__}: {e}")
                        import traceback
                        self._log(f"IMPORT: [{take}] Traceback: {traceback.format_exc()}")

                # Handle AVPreview audio tracks (same as on_download_build)
                if audio_local_files:
                    self._log(f"IMPORT: Creating audio bin 'AVPreview_Audio' and importing {len(audio_local_files)} audio file(s)...")
                    audio_bin = resolve_ensure_bins(media_pool, "CONCEPTO_IMPORTED", "AVPreview_Audio")
                    audio_imported = resolve_import_files(media_pool, audio_bin, audio_local_files)
                    self._log(f"IMPORT: ✓ Imported {len(audio_imported)} audio file(s) into 'AVPreview_Audio' bin")
                    
                    # Place audio on NEW audio tracks
                    avp = self.episode.get("avPreviewData") or {}
                    audio_tracks = avp.get("audioTracks") or []
                    if audio_tracks:
                        self._log(f"IMPORT: Placing {len(audio_local_files)} AVPreview audio clip(s) onto NEW tracks A{new_a_track_start}+...")
                        target_audio_track = new_a_track_start
                        for track_idx, track_data in enumerate(audio_tracks):
                            clips = track_data.get("clips") or []
                            for clip_idx, clip_data in enumerate(clips):
                                audio_url = clip_data.get("url")
                                if not audio_url:
                                    continue
                                
                                # Find matching imported audio file
                                want_name = None
                                for local_file in audio_local_files:
                                    if audio_url.split("?")[0] in local_file or os.path.basename(local_file) in audio_url:
                                        want_name = os.path.basename(local_file)
                                        break
                                
                                if not want_name:
                                    self._log(f"IMPORT: AUDIO: Could not match URL to local file: {audio_url[:50]}...")
                                    continue
                                
                                # Find MediaPoolItem
                                audio_item = None
                                for it in audio_imported:
                                    nm = getattr(it, "GetName", lambda: "")()
                                    if want_name in nm or nm in want_name:
                                        audio_item = it
                                        break
                                
                                if not audio_item:
                                    self._log(f"IMPORT: AUDIO: Missing MediaPoolItem for {want_name}")
                                    continue
                                
                                # Get timing
                                st = float(clip_data.get("startTime", 0) or 0)
                                du = float(clip_data.get("duration", 0) or 0)
                                if du <= 0:
                                    continue
                                
                                try:
                                    self._log(f"IMPORT: AUDIO: Place '{want_name}' A{target_audio_track} (AVPreview track {track_idx+1}) start={st}s dur={du}s")
                                    resolve_place_on_timeline(
                                        project, media_pool, timeline, audio_item,
                                        record_seconds=st,
                                        duration_seconds=du,
                                        offset_seconds=0.0,
                                        log_callback=self._log,
                                        track_index=target_audio_track,
                                        track_type="audio",
                                    )
                                except Exception as e:
                                    self._log(f"IMPORT: AUDIO: Failed placing '{want_name}': {type(e).__name__}: {e}")
                            
                            target_audio_track += 1  # Next AVPreview track goes on next audio track
                
                self._log("✓ IMPORT: Completed importing to new tracks (existing tracks preserved)")

            except Exception as e:
                self._log(f"IMPORT ERROR: {e}")
                import traceback
                self._log(f"Traceback: {traceback.format_exc()}")

        threading.Thread(target=worker, daemon=True).start()

    def on_diagnose(self):
        try:
            self._log("Diagnose: Connecting to Resolve...")
            _resolve, project, _media_pool = resolve_get_context()
            timeline = project.GetCurrentTimeline()
            if not timeline:
                self._log("Diagnose: No current timeline.")
                return
            self._log(f"Diagnose: Timeline = {getattr(timeline,'GetName',lambda:'(unknown)')()}")

            def list_methods(obj: Any, label: str, keywords: List[str]):
                methods = []
                for m in dir(obj):
                    if m.startswith("_"):
                        continue
                    if any(k.lower() in m.lower() for k in keywords):
                        try:
                            if callable(getattr(obj, m)):
                                methods.append(m)
                        except Exception:
                            pass
                self._log(f"Diagnose: {label} methods ({', '.join(keywords)}): {', '.join(sorted(methods))}")

            list_methods(timeline, "Timeline", ["track", "item", "marker", "timecode", "start", "duration"])

            get_track_count = _method(timeline, "GetTrackCount")
            get_items = _method(timeline, "GetItemListInTrack")
            if get_track_count and get_items:
                try:
                    v_tracks = int(timeline.GetTrackCount("video") or 0)
                except Exception:
                    v_tracks = 1
                self._log(f"Diagnose: video track count = {v_tracks}")
                if v_tracks > 0:
                    items = timeline.GetItemListInTrack("video", 1) or []
                    self._log(f"Diagnose: track1 items = {len(items)}")
                    if items:
                        it = items[0]
                        self._log(f"Diagnose: sample item name = {getattr(it,'GetName',lambda:'(no GetName)')() if it else ''}")
                        list_methods(it, "TimelineItem", ["get", "set", "property", "start", "duration", "offset", "media"])
            else:
                self._log("Diagnose: Missing Timeline.GetTrackCount or Timeline.GetItemListInTrack (cannot read timeline items).")
        except Exception as e:
            self._log(f"Diagnose ERROR: {e}")


def _main_pyside():
    """Run PySide GUI version"""
    if QtWidgets is None:
        raise RuntimeError("PySide requested but not available")
    app = QtWidgets.QApplication.instance()
    if app is None:
        app = QtWidgets.QApplication(sys.argv)
    w = MainWindow()
    w.show()
    w.raise_()
    w.activateWindow()
    app.exec_()


class MainWindowTk:
    """Tkinter version of MainWindow"""
    def __init__(self):
        import tkinter as tk
        from tkinter import ttk, messagebox, scrolledtext, simpledialog
        
        self.tk = tk
        self.ttk = ttk
        self.messagebox = messagebox
        self.scrolledtext = scrolledtext
        self.simpledialog = simpledialog
        
        self.root = tk.Tk()
        self.root.title("Concepto Resolve Sync")
        self.root.geometry("900x700")
        
        self.cfg = PluginConfig.load()
        self.client: Optional[ConceptoClient] = None
        self.episode: Optional[Dict[str, Any]] = None
        self.show: Optional[Dict[str, Any]] = None
        self.selected_segment_id: Optional[str] = None
        
        self._build_ui()
        
    def _build_ui(self):
        tk = self.tk
        ttk = self.ttk
        
        # Main container
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Version timestamp (top right)
        version_frame = ttk.Frame(main_frame)
        version_frame.pack(fill=tk.X, pady=(0, 5))
        version_label = ttk.Label(version_frame, text=f"Latest version updated at: {PLUGIN_VERSION_TIMESTAMP}", 
                                  foreground="gray", font=("TkDefaultFont", 7))
        version_label.pack(side=tk.RIGHT)
        
        # Config frame
        cfg_frame = ttk.LabelFrame(main_frame, text="API Configuration", padding="5")
        cfg_frame.pack(fill=tk.X, pady=(0, 5))
        
        # API fields
        ttk.Label(cfg_frame, text="API Endpoint:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=2)
        self.endpoint_edit = ttk.Entry(cfg_frame, width=60)
        self.endpoint_edit.insert(0, self.cfg.api_endpoint)
        self.endpoint_edit.grid(row=0, column=1, padx=5, pady=2, sticky=tk.EW)
        
        ttk.Label(cfg_frame, text="API Key:").grid(row=1, column=0, sticky=tk.W, padx=5, pady=2)
        self.key_edit = ttk.Entry(cfg_frame, width=60, show="*")
        self.key_edit.insert(0, self.cfg.api_key)
        self.key_edit.grid(row=1, column=1, padx=5, pady=2, sticky=tk.EW)
        
        ttk.Label(cfg_frame, text="Show ID:").grid(row=2, column=0, sticky=tk.W, padx=5, pady=2)
        self.show_edit = ttk.Entry(cfg_frame, width=60)
        self.show_edit.insert(0, self.cfg.show_id)
        self.show_edit.grid(row=2, column=1, padx=5, pady=2, sticky=tk.EW)
        
        ttk.Label(cfg_frame, text="Episode ID:").grid(row=3, column=0, sticky=tk.W, padx=5, pady=2)
        self.episode_edit = ttk.Entry(cfg_frame, width=60)
        self.episode_edit.insert(0, self.cfg.episode_id)
        self.episode_edit.grid(row=3, column=1, padx=5, pady=2, sticky=tk.EW)
        
        ttk.Label(cfg_frame, text="Download Root:").grid(row=4, column=0, sticky=tk.W, padx=5, pady=2)
        self.download_root_edit = ttk.Entry(cfg_frame, width=60)
        self.download_root_edit.insert(0, self.cfg.download_root)
        self.download_root_edit.grid(row=4, column=1, padx=5, pady=2, sticky=tk.EW)
        
        cfg_frame.columnconfigure(1, weight=1)
        
        # Buttons row
        btn_frame = ttk.Frame(cfg_frame)
        btn_frame.grid(row=5, column=0, columnspan=2, pady=5, sticky=tk.EW)
        
        self.save_btn = ttk.Button(btn_frame, text="Save", command=self.on_save)
        self.save_btn.pack(side=tk.LEFT, padx=2)
        
        self.paste_btn = ttk.Button(btn_frame, text="Paste JSON Config", command=self.on_paste_json)
        self.paste_btn.pack(side=tk.LEFT, padx=2)
        
        self.test_btn = ttk.Button(btn_frame, text="Test & Load", command=self.on_test_load)
        self.test_btn.pack(side=tk.LEFT, padx=2)
        
        self.refresh_btn = ttk.Button(btn_frame, text="Refresh", command=self.on_refresh, state=tk.DISABLED)
        self.refresh_btn.pack(side=tk.LEFT, padx=2)
        
        # Episode/Segment frame
        info_frame = ttk.LabelFrame(main_frame, text="Episode / Segment", padding="5")
        info_frame.pack(fill=tk.X, pady=(0, 5))
        
        self.info_label = ttk.Label(info_frame, text="Not loaded.")
        self.info_label.pack(side=tk.LEFT, padx=5)
        
        ttk.Label(info_frame, text="Segment:").pack(side=tk.LEFT, padx=5)
        
        self.segment_combo = ttk.Combobox(info_frame, width=30, state="readonly")
        self.segment_combo.pack(side=tk.LEFT, padx=5)
        self.segment_combo.bind("<<ComboboxSelected>>", lambda e: self.on_segment_changed())
        
        # Shots table
        table_frame = ttk.LabelFrame(main_frame, text="Shots", padding="5")
        table_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 5))
        
        # Treeview as table
        scrollbar_y = ttk.Scrollbar(table_frame, orient=tk.VERTICAL)
        scrollbar_x = ttk.Scrollbar(table_frame, orient=tk.HORIZONTAL)
        
        self.table = ttk.Treeview(table_frame, columns=("Order", "Take", "ShotId", "Main", "Duration", "Offset"),
                                       show="headings", yscrollcommand=scrollbar_y.set, xscrollcommand=scrollbar_x.set)
        
        scrollbar_y.config(command=self.table.yview)
        scrollbar_x.config(command=self.table.xview)
        
        for col in ("Order", "Take", "ShotId", "Main", "Duration", "Offset"):
            self.table.heading(col, text=col)
            self.table.column(col, width=100, anchor=tk.W)
        
        self.table.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar_y.pack(side=tk.RIGHT, fill=tk.Y)
        scrollbar_x.pack(side=tk.BOTTOM, fill=tk.X)
        
        # Actions frame
        act_frame = ttk.LabelFrame(main_frame, text="Actions", padding="5")
        act_frame.pack(fill=tk.X, pady=(0, 5))
        
        # Row 1
        act_row1 = ttk.Frame(act_frame)
        act_row1.pack(fill=tk.X, pady=(0, 3))
        
        self.download_btn = ttk.Button(act_row1, text="Download + Create Bins + Build Timeline (Selected Segment)",
                                           command=self.on_download_build, state=tk.DISABLED)
        self.download_btn.pack(side=tk.LEFT, padx=2)
        
        self.sync_btn = ttk.Button(act_row1, text="SYNC (Resolve -> Concepto)", 
                                       command=self.on_sync, state=tk.DISABLED)
        self.sync_btn.pack(side=tk.LEFT, padx=2)
        
        self.sync_from_concepto_btn = ttk.Button(act_row1, text="SYNC (Concepto -> Resolve)",
                                                    command=self.on_sync_from_concepto, state=tk.DISABLED)
        self.sync_from_concepto_btn.pack(side=tk.LEFT, padx=2)
        
        # Row 2
        act_row2 = ttk.Frame(act_frame)
        act_row2.pack(fill=tk.X)
        
        self.export_av_script_btn = ttk.Button(act_row2, text="Export to AV Script (SRT)", 
                                                   command=self.on_export_av_script)
        self.export_av_script_btn.pack(side=tk.LEFT, padx=2)

        self.export_srt_video_btn = ttk.Button(act_row2, text="Export SRT + Video",
                                                  command=self.on_export_srt_video)
        self.export_srt_video_btn.pack(side=tk.LEFT, padx=2)
        
        self.export_audio_btn = ttk.Button(act_row2, text="Export Audio to AV Preview",
                                               command=self.on_export_audio, state=tk.DISABLED)
        self.export_audio_btn.pack(side=tk.LEFT, padx=2)
        
        self.import_to_timeline_btn = ttk.Button(act_row2, text="Import to Current Timeline",
                                                     command=self.on_import_to_timeline, state=tk.DISABLED)
        self.import_to_timeline_btn.pack(side=tk.LEFT, padx=2)
        
        self.diagnose_btn = ttk.Button(act_row2, text="Diagnose Resolve API", 
                                           command=self.on_diagnose)
        self.diagnose_btn.pack(side=tk.LEFT, padx=2)
        
        # Log frame
        log_frame = ttk.LabelFrame(main_frame, text="Log", padding="5")
        log_frame.pack(fill=tk.BOTH, expand=True)
        
        self.log = self.scrolledtext.ScrolledText(log_frame, height=8, wrap=tk.WORD)
        self.log.pack(fill=tk.BOTH, expand=True)
        
    def _log(self, msg: str):
        tk = self.tk
        self.log.insert(tk.END, msg + "\n")
        self.log.see(tk.END)
        self.root.update_idletasks()
        _log_to_file(f"GUI: {msg}")
        
    def on_save(self):
        self.cfg.api_endpoint = self.endpoint_edit.get().strip()
        self.cfg.api_key = self.key_edit.get().strip()
        self.cfg.show_id = self.show_edit.get().strip()
        self.cfg.episode_id = self.episode_edit.get().strip()
        self.cfg.download_root = self.download_root_edit.get().strip() or DOWNLOAD_ROOT_DEFAULT
        self.cfg.save()
        self._log(f"Saved config to: {self.cfg.path()}")
        
    def on_paste_json(self):
        text = self.simpledialog.askstring("Paste JSON Config", "Paste Concepto JSON config:")
        if not text or not text.strip():
            return
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                if data.get("apiEndpoint"):
                    self.endpoint_edit.delete(0, self.tk.END)
                    self.endpoint_edit.insert(0, str(data["apiEndpoint"]))
                if data.get("apiKey"):
                    self.key_edit.delete(0, self.tk.END)
                    self.key_edit.insert(0, str(data["apiKey"]))
                if data.get("showId"):
                    self.show_edit.delete(0, self.tk.END)
                    self.show_edit.insert(0, str(data["showId"]))
                if data.get("episodeId"):
                    self.episode_edit.delete(0, self.tk.END)
                    self.episode_edit.insert(0, str(data["episodeId"]))
            self.on_save()
            self._log("Pasted JSON config.")
        except Exception as e:
            self._log(f"Paste JSON ERROR: {e}")
            
    def _load_episode(self):
        endpoint = self.endpoint_edit.get().strip()
        key = self.key_edit.get().strip()
        show_id_input = self.show_edit.get().strip()
        episode_id = self.episode_edit.get().strip()
        if not endpoint or not key or not episode_id:
            raise RuntimeError("Please fill API Endpoint, API Key, and Episode ID (Show ID optional).")
            
        self.client = ConceptoClient(endpoint, key)
        ep = self.client.get_episode(episode_id)
        self.episode = ep
        show_id = ep.get("showId")
        if show_id_input and show_id and show_id_input != show_id:
            self._log(f"WARNING: Show ID mismatch. Config showId={show_id_input} but episode.showId={show_id}")
        if show_id_input and not show_id:
            show_id = show_id_input
        self.show = self.client.get_show(show_id) if show_id else None
        
        show_name = (self.show or {}).get("name", ep.get("showId", "UnknownShow"))
        episode_title = ep.get("title", episode_id)
        self.info_label.config(text=f"Show: {show_name} | Episode: {episode_title} ({episode_id})")
        
        segments = ((ep.get("avScript") or {}).get("segments") or [])
        segment_values = []
        segment_ids = []
        for seg in segments:
            segment_values.append(f"SC{int(seg.get('segmentNumber',0)):02d}: {seg.get('title','')}")
            segment_ids.append(seg.get("id"))
        self.segment_combo['values'] = segment_values
        self.segment_combo['state'] = 'readonly'
        self.segment_combo._segment_ids = segment_ids  # Store IDs as attribute
        self.refresh_btn.config(state=self.tk.NORMAL)
        
        if segments:
            self.segment_combo.current(0)
            self.selected_segment_id = segment_ids[0]
            self._render_segment()
            
        self.download_btn.config(state=self.tk.NORMAL)
        self.sync_btn.config(state=self.tk.NORMAL)
        self.sync_from_concepto_btn.config(state=self.tk.NORMAL)
        self.export_audio_btn.config(state=self.tk.NORMAL)
        self.import_to_timeline_btn.config(state=self.tk.NORMAL)
        
    def on_test_load(self):
        self._log("Loading episode...")
        try:
            self.on_save()
            self._load_episode()
            self._log("Loaded successfully.")
        except Exception as e:
            self._log(f"ERROR: {e}")
            
    def on_refresh(self):
        self._log("Refreshing...")
        try:
            selected = self.selected_segment_id
            self._load_episode()
            if selected and hasattr(self.segment_combo, '_segment_ids'):
                try:
                    idx = self.segment_combo._segment_ids.index(selected)
                    self.segment_combo.current(idx)
                    self.selected_segment_id = selected
                except (ValueError, AttributeError):
                    pass
            self._log("Refresh complete.")
        except Exception as e:
            self._log(f"ERROR: {e}")
            
    def on_segment_changed(self):
        idx = self.segment_combo.current()
        if hasattr(self.segment_combo, '_segment_ids') and 0 <= idx < len(self.segment_combo._segment_ids):
            self.selected_segment_id = self.segment_combo._segment_ids[idx]
        else:
            # Fallback: extract from episode data
            segments = ((self.episode.get("avScript") or {}).get("segments") or []) if self.episode else []
            if 0 <= idx < len(segments):
                self.selected_segment_id = segments[idx].get("id")
        self._render_segment()
        
    def _render_segment(self):
        tk = self.tk
        # Clear table
        for item in self.table.get_children():
            self.table.delete(item)
            
        if not self.episode or not self.selected_segment_id:
            return
            
        segments = ((self.episode.get("avScript") or {}).get("segments") or [])
        seg = next((s for s in segments if s.get("id") == self.selected_segment_id), None)
        if not seg:
            return
            
        shots = seg.get("shots") or []
        shots_display = sorted(shots, key=lambda s: (s.get("order", 0), float(s.get("shotNumber", 0) or 0)))
        
        for shot in shots_display:
            take = (shot.get("take") or "").replace("_image", "")
            main = "video" if shot.get("videoUrl") else ("image" if shot.get("imageUrl") else "none")
            dur = shot.get("duration", 0)
            off = shot.get("videoOffset", 0) or 0
            self.table.insert("", tk.END, values=(
                str(shot.get("shotNumber", "")),
                take,
                shot.get("id", ""),
                main,
                str(dur),
                str(off)
            ))
            
    def _compute_visual_start_times(self, seg: Dict[str, Any], shots: List[Dict[str, Any]]) -> Dict[str, float]:
        """Same as PySide version"""
        start_times: Dict[str, float] = {}
        avp = self.episode.get("avPreviewData") if self.episode else {}
        overrides = (avp or {}).get("videoClipStartTimes") or {}
        current = 0.0
        for idx, shot in enumerate(shots):
            clip_id = f"{seg.get('id')}-{shot.get('id')}-{idx}"
            if clip_id in overrides:
                start = float(overrides[clip_id])
            else:
                start = float(current)
            start_times[clip_id] = start
            current = max(current, start) + float(shot.get("duration") or 0)
        return start_times
        
    def on_download_build(self):
        # Same implementation as PySide version
        def worker():
            try:
                if not self.episode or not self.selected_segment_id or not self.client:
                    raise RuntimeError("Load an episode and select a segment first.")
                    
                self._log("Connecting to Resolve...")
                _resolve, project, media_pool = resolve_get_context()
                
                show_name = _safe_slug((self.show or {}).get("name") or self.episode.get("showId") or "UnknownShow")
                episode_name = _safe_slug(self.episode.get("title") or self.cfg.episode_id)
                base_dir = Path(self.download_root_edit.get().strip() or DOWNLOAD_ROOT_DEFAULT)
                episode_dir = base_dir / show_name / episode_name
                episode_dir.mkdir(parents=True, exist_ok=True)
                self._log(f"Local episode folder: {episode_dir}")
                
                segments = ((self.episode.get("avScript") or {}).get("segments") or [])
                seg = next((s for s in segments if s.get("id") == self.selected_segment_id), None)
                if not seg:
                    raise RuntimeError("Selected segment not found.")
                    
                shots_raw = seg.get("shots") or []
                start_times = self._compute_visual_start_times(seg, shots_raw)
                
                tl_name = f"CONCEPTO_{show_name}_{episode_name}"
                timeline = resolve_get_or_create_timeline(project, tl_name)
                self._log(f"Using timeline: {getattr(timeline,'GetName',lambda:tl_name)()}")
                
                # Collect audio track assets once for the entire segment (these go in episode folder, not take folders)
                audio_track_assets = _collect_audio_track_assets(
                    self.episode,
                    self.selected_segment_id,
                    api_endpoint=self.cfg.api_endpoint,
                    log_callback=self._log,
                )
                audio_local_files: List[str] = []  # Collect downloaded audio files for later bin import
                
                if audio_track_assets:
                    audio_dir = episode_dir / "AVPreview_Audio"
                    audio_dir.mkdir(parents=True, exist_ok=True)
                    self._log(f"Downloading {len(audio_track_assets)} audio track assets from AV Preview...")
                    for url, filename in audio_track_assets:
                        ext = os.path.splitext(url.split("?")[0])[1]
                        if not os.path.splitext(filename)[1] and ext:
                            filename = filename + ext
                        dest = audio_dir / _safe_slug(filename)
                        if not dest.exists():
                            try:
                                _download_file(url, dest)
                                self._log(f"Downloaded audio track: {dest.name}")
                                audio_local_files.append(str(dest))
                            except Exception as e:
                                self._log(f"Failed to download audio track {filename}: {e}")
                                continue
                        else:
                            # File already exists, add to list for import
                            audio_local_files.append(str(dest))
                else:
                    self._log("INFO: No audio tracks found in AV Preview for this segment.")
                
                # Process takes - sort by order (row) to ensure proper sequencing
                sorted_shots = sorted(shots_raw, key=lambda s: (float(s.get("order", 0) or 0), float(s.get("shotNumber", 0) or 0)))
                self._log(f"Processing {len(sorted_shots)} shots in order (sorted by row/order field)")
                
                # List to collect placeholders for SRT generation
                placeholders_to_create = []
                
                for idx, shot in enumerate(sorted_shots):
                    take = (shot.get("take") or f"TAKE_{idx+1:03d}").replace("_image", "")
                    take_dir = episode_dir / take
                    
                    assets = _collect_take_assets(shot, self.cfg.api_endpoint)
                    audio_count = sum(1 for _, fname in assets if "_audio_" in fname)
                    video_count = sum(1 for _, fname in assets if ".mp4" in fname or "video" in fname.lower())
                    image_count = sum(1 for _, fname in assets if ".jpg" in fname or ".png" in fname or "image" in fname.lower())
                    self._log(f"[{take}] Downloading {len(assets)} assets (audio: {audio_count}, video: {video_count}, images: {image_count})...")
                    local_files: List[str] = []
                    for url, filename in assets:
                        ext = os.path.splitext(url.split("?")[0])[1]
                        if not os.path.splitext(filename)[1] and ext:
                            filename = filename + ext
                        dest = take_dir / _safe_slug(filename)
                        if not dest.exists():
                            try:
                                _download_file(url, dest)
                                self._log(f"[{take}] Downloaded: {dest.name}")
                            except Exception as e:
                                self._log(f"[{take}] Failed to download {filename}: {e}")
                                continue
                        local_files.append(str(dest))
                        
                    seg_label = f"SC{int(seg.get('segmentNumber',0)):02d}_{_safe_slug(seg.get('title',''))}"[:80]
                    take_folder = resolve_ensure_bins(media_pool, "CONCEPTO", seg_label, take)
                    imported = resolve_import_files(media_pool, take_folder, local_files)
                    self._log(f"[{take}] Imported {len(imported)} items into bin.")
                    
                    # Place main on timeline (or create placeholder if no video/image)
                    main_video_url = shot.get("videoUrl")
                    main_image_url = shot.get("imageUrl")
                    main_url = main_video_url or main_image_url
                    visual_description = shot.get("visual", "")
                    
                    # Collect details for ALL takes into SRT (for full script overlay)
                    clip_id = f"{seg.get('id')}-{shot.get('id')}-{idx}"
                    start_sec = float(start_times.get(clip_id, 0.0))
                    dur_sec = float(shot.get("duration") or 0)
                    if dur_sec <= 0: dur_sec = 3.0
                    
                    subtitle_text = f"[{take}] {visual_description}" if visual_description else f"[{take}]"
                    placeholders_to_create.append({
                        'start': start_sec,
                        'duration': dur_sec,
                        'text': subtitle_text
                    })

                    if not main_url:
                        self._log(f"[{take}] Queued for subtitle placeholder (no video/image)")
                        continue

                    # Determine which type of main asset we have
                    has_video = bool(main_video_url)
                    has_image = bool(main_image_url)
                    self._log(f"[{take}] Main asset: video={has_video}, image={has_image}")

                    # Find matching local file for main - prioritize based on what's actually available
                    main_file = None
                    if has_video:
                        # Look for MAIN_video first
                        for f in local_files:
                            if f.endswith(".mp4") and "MAIN_video" in os.path.basename(f):
                                main_file = f
                                self._log(f"[{take}] Found main video file: {os.path.basename(f)}")
                                break
                    
                    if not main_file and has_image:
                        # Look for MAIN_image (check multiple extensions)
                        for f in local_files:
                            basename = os.path.basename(f).lower()
                            if "MAIN_image" in basename and any(basename.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
                                main_file = f
                                self._log(f"[{take}] Found main image file: {os.path.basename(f)}")
                                break
                    
                    # Fallback: if we still don't have a main file, try to find any video or image
                    if not main_file:
                        if has_video:
                            # Look for any .mp4 file
                            for f in local_files:
                                if f.endswith(".mp4"):
                                    main_file = f
                                    self._log(f"[{take}] Using fallback video file: {os.path.basename(f)}")
                                    break
                        elif has_image:
                            # Look for any image file
                            for f in local_files:
                                basename = os.path.basename(f).lower()
                                if any(basename.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
                                    main_file = f
                                    self._log(f"[{take}] Using fallback image file: {os.path.basename(f)}")
                                    break
                    
                    # Last resort: use first file
                    if not main_file and local_files:
                        main_file = local_files[0]
                        self._log(f"[{take}] Using first available file as main: {os.path.basename(main_file)}")
                    
                    if not main_file:
                        self._log(f"[{take}] WARNING: Could not find main file in downloaded assets!")
                        self._log(f"[{take}] Debug: local_files count={len(local_files)}")
                        for f in local_files[:5]:  # Show first 5 files
                            self._log(f"[{take}]   - {os.path.basename(f)}")
                        
                    main_item = imported[0] if imported else None
                    get_clips = _method(take_folder, "GetClipList")
                    if get_clips and main_file:
                        want = os.path.basename(main_file)
                        for it in take_folder.GetClipList() or []:
                            nm = getattr(it, "GetName", lambda: "")()
                            if nm == want or want in nm:
                                main_item = it
                                break
                                
                    if not main_item:
                        self._log(f"[{take}] Could not find MediaPoolItem for main, skipping timeline.")
                        self._log(f"[{take}] Debug: imported={len(imported)} items, main_file={main_file}")
                        if imported:
                            self._log(f"[{take}] Debug: first imported item name={getattr(imported[0], 'GetName', lambda: '(no GetName)')()}")
                        continue
                        
                    clip_id = f"{seg.get('id')}-{shot.get('id')}-{idx}"
                    start_sec = float(start_times.get(clip_id, 0.0))
                    dur_sec = float(shot.get("duration") or 0)
                    if dur_sec <= 0:
                        dur_sec = 3.0
                        self._log(f"[{take}] Warning: Duration was {shot.get('duration')}, using default 3.0s")
                    off_sec = float(shot.get("videoOffset") or 0) or 0.0
                    
                    item_name = getattr(main_item, "GetName", lambda: "(unknown)")()
                    self._log(f"[{take}] Placing '{item_name}' on timeline: start={start_sec}s dur={dur_sec}s offset={off_sec}s")
                    
                    # Ensure timeline is current and unlocked
                    try:
                        project.SetCurrentTimeline(timeline)
                    except Exception:
                        pass
                    
                    try:
                        # Video clips on V1; embedded audio will auto-link on A1
                        resolve_place_on_timeline(project, media_pool, timeline, main_item, record_seconds=start_sec, duration_seconds=dur_sec, offset_seconds=off_sec, log_callback=self._log, track_index=1, track_type="video")
                        self._log(f"[{take}] ✓ Successfully placed on timeline")
                    except Exception as e:
                        self._log(f"[{take}] ✗ Failed to place on timeline: {type(e).__name__}: {e}")
                        import traceback
                        self._log(f"[{take}] Traceback: {traceback.format_exc()}")
                    
                    try:
                        fps_raw = timeline.GetSetting("timelineFrameRate")
                        fps = float(fps_raw) if fps_raw else 24.0
                    except Exception:
                        fps = 24.0
                    add_marker = _method(timeline, "AddMarker")
                    if add_marker:
                        try:
                            frame = _seconds_to_frames(start_sec, fps)
                            note = json.dumps({
                                "concepto": True,
                                "episodeId": self.cfg.episode_id,
                                "segmentId": seg.get("id"),
                                "shotId": shot.get("id"),
                                "take": take,
                                "clipId": clip_id,
                            })
                            timeline.AddMarker(frame, "Blue", f"{take}", note, 1)
                        except Exception:
                            pass

                # After all takes are processed, create subtitle track from placeholders if any
                if placeholders_to_create:
                    self._log(f"Generating subtitle track for {len(placeholders_to_create)} placeholders...")
                    try:
                        # Convert to SRT time format: HH:MM:SS,mmm
                        def to_srt_time(secs):
                            h = int(secs // 3600)
                            m = int((secs % 3600) // 60)
                            s = int(secs % 60)
                            ms = int((secs % 1) * 1000)
                            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
                        
                        srt_lines = []
                        for i, p in enumerate(placeholders_to_create):
                            start_sec = p['start']
                            end_sec = p['start'] + p['duration']
                            # SRT likes single lines or explicit \n
                            text = p['text'].replace('\n', ' ')
                            
                            srt_lines.append(str(i + 1))
                            srt_lines.append(f"{to_srt_time(start_sec)} --> {to_srt_time(end_sec)}")
                            srt_lines.append(text)
                            srt_lines.append("")
                        
                        srt_content = "\n".join(srt_lines)
                        srt_path = os.path.join(episode_dir, "placeholders.srt")
                        with open(srt_path, "w", encoding="utf-8") as f:
                            f.write(srt_content)
                        
                        self._log(f"Importing subtitles from {srt_path}...")
                        # Resolve API: ImportIntoTimeline(path, importType="srt")
                        import_into = _method(timeline, "ImportIntoTimeline")
                        if import_into:
                            result = timeline.ImportIntoTimeline(srt_path, {"importType": "subtitle"})
                            if not result:
                                # Try alternate importType
                                result = timeline.ImportIntoTimeline(srt_path, "srt")
                            
                            if result:
                                self._log(f"✓ Subtitle track created successfully!")
                            else:
                                self._log(f"⚠ Automatic subtitle import returned False. You can manually import {srt_path}")
                        else:
                            self._log(f"⚠ Timeline.ImportIntoTimeline method not found. File is at: {srt_path}")
                    except Exception as e:
                        self._log(f"✗ Failed to create subtitle track: {e}")

                # After all takes are processed, create subtitle track from placeholders if any
                if placeholders_to_create:
                    self._log(f"Generating subtitle track for {len(placeholders_to_create)} placeholders...")
                    try:
                        # STEP 1: Get timeline start offset in seconds
                        # Most timelines start at 01:00:00:00 (3600 seconds)
                        tl_start_sec = 0.0
                        try:
                            fps_raw = timeline.GetSetting("timelineFrameRate")
                            fps = float(fps_raw) if fps_raw else 24.0
                            start_tc = timeline.GetStartTimecode() # e.g. "01:00:00:00"
                            parts = start_tc.split(":")
                            if len(parts) == 4:
                                tl_start_sec = int(parts[0])*3600 + int(parts[1])*60 + int(parts[2]) + (int(parts[3])/fps)
                                self._log(f"Timeline starts at {start_tc} ({tl_start_sec}s offset)")
                        except Exception as e:
                            self._log(f"Note: Using 0.0 as start offset: {e}")

                        # Convert to SRT time format: HH:MM:SS,mmm
                        def to_srt_time(secs):
                            # Add timeline start offset to make times absolute to timeline
                            absolute_secs = secs + tl_start_sec
                            h = int(absolute_secs // 3600)
                            m = int((absolute_secs % 3600) // 60)
                            s = int(absolute_secs % 60)
                            ms = int((absolute_secs % 1) * 1000)
                            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
                        
                        srt_lines = []
                        for i, p in enumerate(placeholders_to_create):
                            start_sec = p['start']
                            end_sec = p['start'] + p['duration']
                            text = p['text'].replace('\n', ' ')
                            
                            srt_lines.append(str(i + 1))
                            srt_lines.append(f"{to_srt_time(start_sec)} --> {to_srt_time(end_sec)}")
                            srt_lines.append(text)
                            srt_lines.append("")
                        
                        srt_content = "\n".join(srt_lines)
                        srt_path = os.path.join(episode_dir, "placeholders.srt")
                        with open(srt_path, "w", encoding="utf-8") as f:
                            f.write(srt_content)
                        
                        self._log(f"Importing subtitles from {srt_path}...")
                        
                        # STEP 2: Import SRT into Media Pool for visibility
                        srt_item = None
                        try:
                            srt_bin = resolve_ensure_bins(media_pool, "CONCEPTO", seg_label, "Subtitles")
                            media_pool.SetCurrentFolder(srt_bin)
                            imported_items = media_pool.ImportMedia([srt_path])
                            if imported_items:
                                srt_item = imported_items[0]
                                self._log(f"✓ SRT imported into bin: Subtitles")
                        except Exception:
                            pass

                        # STEP 3: Place on timeline using official ImportIntoTimeline
                        # Since we adjusted the times in SRT to match the timeline TC,
                        # we don't need any complex offsets here.
                        result = timeline.ImportIntoTimeline(srt_path, {"importType": "subtitle"})
                        if result:
                            self._log("✓ Subtitles successfully placed on timeline.")
                        else:
                            # Fallback
                            result = timeline.ImportIntoTimeline(srt_path, "subtitle")
                            if result:
                                self._log("✓ Subtitles placed via fallback.")
                            else:
                                self._log("⚠ Automatic placement failed. SRT is in your bin - drag it to start of timeline.")
                                
                    except Exception as e:
                        self._log(f"✗ Failed to create subtitle track: {e}")

                # After all takes are processed, create audio bin and import audio files
                if audio_local_files:
                    try:
                        seg_label = f"SC{int(seg.get('segmentNumber',0)):02d}_{_safe_slug(seg.get('title',''))}"[:80]
                        concepto_root = media_pool.GetRootFolder()
                        concepto_folder = None
                        # Find or create CONCEPTO folder
                        for f in concepto_root.GetSubFolderList() or []:
                            if getattr(f, "GetName", lambda: "")() == "CONCEPTO":
                                concepto_folder = f
                                break
                        if not concepto_folder:
                            concepto_folder = media_pool.AddSubFolder(concepto_root, "CONCEPTO")
                        
                        # Find or create segment folder
                        seg_folder = None
                        for f in concepto_folder.GetSubFolderList() or []:
                            if getattr(f, "GetName", lambda: "")() == seg_label:
                                seg_folder = f
                                break
                        if not seg_folder:
                            seg_folder = media_pool.AddSubFolder(concepto_folder, seg_label)
                        
                        # Create AVPreview_Audio bin (below all takes)
                        audio_bin_name = "AVPreview_Audio"
                        audio_bin = None
                        for f in seg_folder.GetSubFolderList() or []:
                            if getattr(f, "GetName", lambda: "")() == audio_bin_name:
                                audio_bin = f
                                break
                        if not audio_bin:
                            audio_bin = media_pool.AddSubFolder(seg_folder, audio_bin_name)
                        
                        self._log(f"Creating audio bin '{audio_bin_name}' and importing {len(audio_local_files)} audio file(s)...")
                        imported_audio = resolve_import_files(media_pool, audio_bin, audio_local_files)
                        self._log(f"✓ Imported {len(imported_audio)} audio file(s) into '{audio_bin_name}' bin")

                        # Place AVPreview audio clips onto timeline A-tracks (A1..)
                        try:
                            avp = (self.episode or {}).get("avPreviewData") or {}
                            audio_tracks = avp.get("audioTracks") or []
                            if not audio_tracks:
                                self._log("AUDIO: No avPreviewData.audioTracks to place on timeline.")
                            else:
                                # Build name -> MediaPoolItem map from audio bin
                                name_to_item: Dict[str, Any] = {}
                                get_clip_list = _method(audio_bin, "GetClipList")
                                if get_clip_list:
                                    for it in (audio_bin.GetClipList() or []):
                                        try:
                                            nm = getattr(it, "GetName", lambda: "")()
                                            if nm:
                                                name_to_item[nm] = it
                                        except Exception:
                                            pass

                                # Ensure enough audio tracks exist (best-effort)
                                get_track_count = _method(timeline, "GetTrackCount")
                                add_track = _method(timeline, "AddTrack")
                                desired = len(audio_tracks)
                                if get_track_count:
                                    try:
                                        current_a = int(timeline.GetTrackCount("audio") or 0)
                                    except Exception:
                                        current_a = 1
                                    if add_track and current_a < desired:
                                        for _ in range(desired - current_a):
                                            try:
                                                add_track("audio")
                                            except Exception:
                                                break

                                # Place AVPreview audio on A2+ (A1 is reserved for embedded video audio)
                                audio_track_offset = 2  # Start AVPreview audio on A2
                                self._log(f"AUDIO: Placing {sum(len(t.get('clips') or []) for t in audio_tracks)} AVPreview audio clip(s) onto timeline A{audio_track_offset}+...")
                                
                                # Ensure at least A2 exists for AVPreview audio
                                if get_track_count:
                                    try:
                                        current_a = int(timeline.GetTrackCount("audio") or 0)
                                    except Exception:
                                        current_a = 1
                                    if add_track and current_a < audio_track_offset:
                                        for _ in range(audio_track_offset - current_a):
                                            try:
                                                add_track("audio")
                                            except Exception:
                                                break
                                
                                for t_idx, tr in enumerate(audio_tracks):
                                    clips = tr.get("clips") or []
                                    # Use separate audio track per AVPreview track (A2, A3, etc.)
                                    target_audio_track = audio_track_offset + t_idx
                                    
                                    # Ensure track exists
                                    if get_track_count and add_track:
                                        try:
                                            current_a = int(timeline.GetTrackCount("audio") or 0)
                                            if current_a < target_audio_track:
                                                for _ in range(target_audio_track - current_a):
                                                    try:
                                                        add_track("audio")
                                                    except Exception:
                                                        break
                                        except Exception:
                                            pass
                                    
                                    for c_idx, cl in enumerate(clips):
                                        if not isinstance(cl, dict):
                                            continue
                                        fn = _audio_clip_filename(tr, cl)
                                        want_name = _safe_slug(fn)
                                        mp_item = name_to_item.get(want_name)
                                        if not mp_item and name_to_item:
                                            # fallback: contains match
                                            for k, v in name_to_item.items():
                                                if want_name in k:
                                                    mp_item = v
                                                    break
                                        if not mp_item:
                                            self._log(f"AUDIO: Missing MediaPoolItem for {want_name} (AVPreview track {t_idx+1} clip {c_idx+1})")
                                            continue
                                        st = float(cl.get("startTime") or 0)
                                        du = float(cl.get("duration") or 0)
                                        off = float(cl.get("offset") or 0)
                                        if du <= 0:
                                            du = 1.0
                                        self._log(f"AUDIO: Place '{want_name}' A{target_audio_track} (AVPreview track {t_idx+1}) start={st}s dur={du}s offset={off}s")
                                        try:
                                            resolve_place_on_timeline(
                                                project,
                                                media_pool,
                                                timeline,
                                                mp_item,
                                                record_seconds=st,
                                                duration_seconds=du,
                                                offset_seconds=off,
                                                log_callback=self._log,
                                                track_index=target_audio_track,
                                                track_type="audio",
                                            )
                                        except Exception as e:
                                            self._log(f"AUDIO: Failed placing '{want_name}': {type(e).__name__}: {e}")
                        except Exception as e:
                            self._log(f"AUDIO: Unexpected error while placing audio: {type(e).__name__}: {e}")
                    except Exception as e:
                        self._log(f"ERROR: Failed to create audio bin or import audio files: {e}")
                        import traceback
                        self._log(f"Traceback: {traceback.format_exc()}")
                            
                self._log("Done: Download + bins + timeline build completed.")
            except Exception as e:
                self._log(f"ERROR: {e}")
                
        threading.Thread(target=worker, daemon=True).start()
        
    def on_sync(self):
        # Same implementation as PySide version
        def worker():
            try:
                if not self.client or not self.episode or not self.selected_segment_id:
                    raise RuntimeError("Load an episode and select a segment first.")
                    
                self._log("SYNC: Connecting to Resolve...")
                _resolve, project, _media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open.")
                    
                segments = ((self.episode.get("avScript") or {}).get("segments") or [])
                seg = next((s for s in segments if s.get("id") == self.selected_segment_id), None)
                if not seg:
                    raise RuntimeError("Selected segment not found.")
                shots_raw = seg.get("shots") or []
                take_to_shot: Dict[str, Dict[str, Any]] = {}
                for idx, sh in enumerate(shots_raw):
                    take = (sh.get("take") or "").replace("_image", "")
                    if take:
                        take_to_shot[take] = {"shot": sh, "idx": idx}
                        
                try:
                    fps_raw = timeline.GetSetting("timelineFrameRate")
                    fps = float(fps_raw) if fps_raw else 24.0
                except Exception:
                    fps = 24.0
                
                # Get timeline start timecode (needed to convert absolute frame to relative seconds)
                timeline_start_frame = 0
                try:
                    get_start_tc = _method(timeline, "GetStartTimecode")
                    if get_start_tc:
                        start_tc_str = timeline.GetStartTimecode()
                        if start_tc_str and isinstance(start_tc_str, str) and ":" in start_tc_str:
                            try:
                                parts = start_tc_str.split(":")
                                if len(parts) == 4:
                                    h, m, s, f = map(int, parts)
                                    timeline_start_sec = h * 3600 + m * 60 + s + (f / fps)
                                    timeline_start_frame = int(round(timeline_start_sec * fps))
                                    self._log(f"SYNC: Timeline start timecode: {start_tc_str} ({timeline_start_frame} frames)")
                            except Exception:
                                pass
                except Exception:
                    pass
                        
                updated_start_times: Dict[str, float] = {}
                updated_shots: List[Tuple[str, Dict[str, Any]]] = []
                            
                get_track_count = _method(timeline, "GetTrackCount")
                get_items = _method(timeline, "GetItemListInTrack")
                if get_track_count and get_items:
                    try:
                        v_tracks = int(timeline.GetTrackCount("video") or 0)
                    except Exception:
                        v_tracks = 1
                    self._log(f"SYNC: Scanning {v_tracks} video tracks for Concepto takes...")
                    for t in range(1, v_tracks + 1):
                        try:
                            items = timeline.GetItemListInTrack("video", t) or []
                        except Exception:
                            continue
                        for it in items:
                            nm = ""
                            try:
                                nm = it.GetName()
                            except Exception:
                                try:
                                    mpit = it.GetMediaPoolItem()
                                    nm = mpit.GetName() if mpit else ""
                                except Exception:
                                    nm = ""
                            take_match = re.search(r"(SC\d{2}T\d{2})", nm)
                            if not take_match:
                                continue
                            take = take_match.group(1)
                            if take not in take_to_shot:
                                continue
                                
                            sh = take_to_shot[take]["shot"]
                            idx = take_to_shot[take]["idx"]
                            clip_id = f"{seg.get('id')}-{sh.get('id')}-{idx}"
                            
                            # Read timeline position (record start) - multiple methods to try
                            timeline_pos_frame = None
                            methods_tried = []
                            
                            # Try various methods to get timeline position
                            for m in ["GetStart", "GetStartFrame", "GetRecordFrame", "GetLeftOffset", "GetLeftOffsetFrames"]:
                                fn = _method(it, m)
                                if fn:
                                    try:
                                        val = fn()
                                        if val is not None:
                                            timeline_pos_frame = int(val)
                                            methods_tried.append(f"{m}={timeline_pos_frame}")
                                            self._log(f"SYNC: [{take}] {m}() returned {timeline_pos_frame} frames")
                                            break
                                    except Exception as e:
                                        methods_tried.append(f"{m}=ERROR({type(e).__name__})")
                                        pass
                            
                            if timeline_pos_frame is not None:
                                # Convert absolute frame to relative seconds (subtract timeline start)
                                relative_frame = timeline_pos_frame - timeline_start_frame
                                if relative_frame < 0:
                                    relative_frame = 0
                                start_sec = relative_frame / fps
                                updated_start_times[clip_id] = start_sec
                                self._log(f"SYNC: [{take}] Timeline pos {timeline_pos_frame} frames -> relative {relative_frame} frames -> {start_sec:.3f}s")
                            else:
                                self._log(f"SYNC: [{take}] WARNING: Could not read timeline position. Tried: {', '.join(methods_tried)}")
                                
                            dur_frames = None
                            for m in ["GetDuration", "GetDurationFrames"]:
                                fn = _method(it, m)
                                if fn:
                                    try:
                                        dur_frames = int(fn())
                                        break
                                    except Exception:
                                        pass
                            duration_sec = (dur_frames / fps) if dur_frames is not None else None
                            
                            offset_sec = None
                            get_props = _method(it, "GetProperty") or _method(it, "GetProperties") or _method(it, "GetClipProperty")
                            if get_props:
                                try:
                                    props = get_props()
                                    if isinstance(props, dict):
                                        in_frame = props.get("In") or props.get("Start") or props.get("StartFrame")
                                        if isinstance(in_frame, (int, float)):
                                            offset_sec = float(in_frame) / fps
                                except Exception:
                                    pass
                                    
                            updates: Dict[str, Any] = {}
                            if duration_sec is not None:
                                updates["duration"] = float(duration_sec)
                            if offset_sec is not None:
                                updates["videoOffset"] = float(offset_sec)
                            if updates:
                                updated_shots.append((sh.get("id"), updates))
                                
                if updated_start_times:
                    self._log(f"SYNC: Updating {len(updated_start_times)} startTimes -> Concepto...")
                    for clip_id, start_sec in updated_start_times.items():
                        self._log(f"SYNC:   clipId={clip_id} -> startTime={start_sec:.3f}s")
                    try:
                        self.client.update_video_clip_start_times(self.cfg.episode_id, updated_start_times)
                        self._log(f"SYNC: ✓ Successfully updated videoClipStartTimes in Concepto")
                    except Exception as e:
                        self._log(f"SYNC: ERROR updating Concepto: {type(e).__name__}: {e}")
                        import traceback
                        self._log(f"SYNC: Traceback: {traceback.format_exc()}")
                else:
                    self._log("SYNC: No startTime changes detected (or unable to read them).")
                    self._log("SYNC: Tip: Make sure clips are on the timeline and visible in the Edit page.")
                    
                if updated_shots:
                    self._log(f"SYNC: Updating {len(updated_shots)} shots (duration/videoOffset) -> Concepto...")
                    for shot_id, updates in updated_shots:
                        self.client.update_shot(shot_id, updates)
                else:
                    self._log("SYNC: No duration/videoOffset changes detected (or unable to read them).")
                    
                self._log("SYNC complete. Use Refresh to verify.")
            except Exception as e:
                self._log(f"SYNC ERROR: {e}")
                
        threading.Thread(target=worker, daemon=True).start()
    
    def on_sync_from_concepto(self):
        """Sync changes FROM Concepto TO Resolve timeline (Tkinter version)"""
        # Same implementation as PySide version - copy the worker function
        def worker():
            try:
                if not self.client or not self.episode or not self.selected_segment_id:
                    raise RuntimeError("Load an episode and select a segment first.")

                self._log("SYNC FROM CONCEPTO: Fetching latest data from Concepto...")
                ep = self.client.get_episode(self.cfg.episode_id)
                self.episode = ep
                
                segments = ((ep.get("avScript") or {}).get("segments") or [])
                seg = next((s for s in segments if s.get("id") == self.selected_segment_id), None)
                if not seg:
                    raise RuntimeError("Selected segment not found.")
                
                shots_raw = seg.get("shots") or []
                avp = ep.get("avPreviewData") or {}
                video_clip_start_times = avp.get("videoClipStartTimes") or {}
                
                self._log(f"SYNC FROM CONCEPTO: Found {len(video_clip_start_times)} videoClipStartTimes in Concepto")
                
                self._log("SYNC FROM CONCEPTO: Connecting to Resolve...")
                _resolve, project, _media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open.")
                
                try:
                    fps_raw = timeline.GetSetting("timelineFrameRate")
                    fps = float(fps_raw) if fps_raw else 24.0
                except Exception:
                    fps = 24.0
                
                timeline_start_frame = 0
                try:
                    get_start_tc = _method(timeline, "GetStartTimecode")
                    if get_start_tc:
                        start_tc_str = timeline.GetStartTimecode()
                        if start_tc_str and isinstance(start_tc_str, str) and ":" in start_tc_str:
                            try:
                                parts = start_tc_str.split(":")
                                if len(parts) == 4:
                                    h, m, s, f = map(int, parts)
                                    timeline_start_sec = h * 3600 + m * 60 + s + (f / fps)
                                    timeline_start_frame = int(round(timeline_start_sec * fps))
                                    self._log(f"SYNC FROM CONCEPTO: Timeline start: {start_tc_str} ({timeline_start_frame} frames)")
                            except Exception:
                                pass
                except Exception:
                    pass
                
                take_to_shot: Dict[str, Dict[str, Any]] = {}
                for idx, sh in enumerate(shots_raw):
                    take = (sh.get("take") or "").replace("_image", "")
                    if take:
                        take_to_shot[take] = {"shot": sh, "idx": idx}
                
                get_items = _method(timeline, "GetItemListInTrack")
                if not get_items:
                    raise RuntimeError("Cannot read timeline items (missing GetItemListInTrack).")
                
                updated_count = 0
                try:
                    v_tracks = int(timeline.GetTrackCount("video") or 0)
                except Exception:
                    v_tracks = 1
                
                self._log(f"SYNC FROM CONCEPTO: Scanning {v_tracks} video track(s)...")
                for t in range(1, v_tracks + 1):
                    try:
                        items = timeline.GetItemListInTrack("video", t) or []
                    except Exception:
                        continue
                    
                    for it in items:
                        nm = ""
                        try:
                            nm = it.GetName()
                        except Exception:
                            try:
                                mpit = it.GetMediaPoolItem()
                                nm = mpit.GetName() if mpit else ""
                            except Exception:
                                nm = ""
                        
                        take_match = re.search(r"(SC\d{2}T\d{2})", nm)
                        if not take_match:
                            continue
                        take = take_match.group(1)
                        if take not in take_to_shot:
                            continue
                        
                        sh = take_to_shot[take]["shot"]
                        idx = take_to_shot[take]["idx"]
                        clip_id = f"{seg.get('id')}-{sh.get('id')}-{idx}"
                        
                        concepto_start_sec = video_clip_start_times.get(clip_id)
                        concepto_duration = float(sh.get("duration") or 0)
                        concepto_offset = float(sh.get("videoOffset") or 0)
                        
                        if concepto_start_sec is None:
                            self._log(f"SYNC FROM CONCEPTO: [{take}] No startTime in Concepto, skipping")
                            continue
                        
                        # Get current timeline position for comparison
                        current_pos_frame = None
                        for m in ["GetStart", "GetStartFrame", "GetRecordFrame", "GetLeftOffset"]:
                            fn = _method(it, m)
                            if fn:
                                try:
                                    val = fn()
                                    if val is not None:
                                        current_pos_frame = int(val)
                                        break
                                except Exception:
                                    pass
                        
                        # Calculate target timeline frame (add timeline start offset)
                        target_frame = int(round(concepto_start_sec * fps)) + timeline_start_frame
                        target_tc = _frames_to_timecode(target_frame, fps)
                        
                        if current_pos_frame is not None:
                            current_pos_sec = (current_pos_frame - timeline_start_frame) / fps
                            self._log(f"SYNC FROM CONCEPTO: [{take}] Current pos={current_pos_sec:.3f}s (frame {current_pos_frame}), Target={concepto_start_sec:.3f}s (frame {target_frame})")
                            
                            # If already at correct position, skip
                            if abs(current_pos_frame - target_frame) <= 1:
                                self._log(f"SYNC FROM CONCEPTO: [{take}] Already at correct position, skipping move")
                                updated_count += 1
                                continue
                        else:
                            self._log(f"SYNC FROM CONCEPTO: [{take}] Could not read current position, attempting update anyway")
                        
                        self._log(f"SYNC FROM CONCEPTO: [{take}] Updating to start={concepto_start_sec:.3f}s ({target_tc}), dur={concepto_duration:.3f}s, offset={concepto_offset:.3f}s")
                        
                        # Try to move/update the clip - use multiple methods
                        moved = False
                        try:
                            # Method 1: Try DeleteClipAtTrack + InsertClipAtTrack (most reliable)
                            delete_at_track = _method(timeline, "DeleteClipAtTrack")
                            insert_at_track = _method(timeline, "InsertClipAtTrack")
                            if delete_at_track and insert_at_track and current_pos_frame is not None:
                                try:
                                    # Get media pool item
                                    mp_item = None
                                    get_mp_item = _method(it, "GetMediaPoolItem")
                                    if get_mp_item:
                                        mp_item = it.GetMediaPoolItem()
                                    
                                    if mp_item:
                                        # Get current track index and trim info
                                        current_track = t
                                        # Get source IN/OUT frames
                                        source_in = None
                                        source_out = None
                                        get_props = _method(it, "GetProperty") or _method(it, "GetProperties")
                                        if get_props:
                                            try:
                                                props = get_props(["Start", "End"]) or get_props()
                                                if isinstance(props, dict):
                                                    source_in = props.get("Start") or props.get("In")
                                                    source_out = props.get("End") or props.get("Out")
                                            except Exception:
                                                pass
                                        
                                        # Delete old clip
                                        try:
                                            timeline.DeleteClipAtTrack(current_track, current_pos_frame)
                                            self._log(f"  Deleted clip at track {current_track}, frame {current_pos_frame}")
                                        except Exception as e:
                                            self._log(f"  DeleteClipAtTrack failed: {e}")
                                        
                                        # Insert at new position
                                        try:
                                            result = timeline.InsertClipAtTrack(current_track, target_frame, mp_item)
                                            if result:
                                                self._log(f"  InsertClipAtTrack successful at frame {target_frame}")
                                                # Apply trim if we have source IN/OUT
                                                if source_in is not None or source_out is not None:
                                                    new_it = result
                                                    set_prop = _method(new_it, "SetProperty")
                                                    if set_prop:
                                                        try:
                                                            if source_in is not None:
                                                                new_it.SetProperty("Start", source_in)
                                                            if source_out is not None:
                                                                new_it.SetProperty("End", source_out)
                                                            self._log(f"  Applied trim: Start={source_in}, End={source_out}")
                                                        except Exception:
                                                            pass
                                                moved = True
                                        except Exception as e:
                                            self._log(f"  InsertClipAtTrack failed: {e}")
                                            # Try to restore old position if insert failed
                                            if current_pos_frame is not None and mp_item:
                                                try:
                                                    timeline.InsertClipAtTrack(current_track, current_pos_frame, mp_item)
                                                    self._log(f"  Restored clip to original position")
                                                except Exception:
                                                    pass
                                except Exception as e:
                                    self._log(f"  Delete+Insert method failed: {e}")
                            
                            # Method 2: Try SetProperty for timeline position (if delete+insert didn't work)
                            if not moved:
                                set_prop = _method(it, "SetProperty")
                                if set_prop:
                                    try:
                                        # Try common property names for timeline position
                                        for prop_name in ["RecordFrame", "StartFrame", "Start", "LeftOffset", "Position"]:
                                            try:
                                                it.SetProperty(prop_name, target_frame)
                                                self._log(f"  Set {prop_name}={target_frame}")
                                                moved = True
                                                break
                                            except Exception as e:
                                                self._log(f"    {prop_name} failed: {e}")
                                    except Exception as e:
                                        self._log(f"  SetProperty failed: {e}")
                            
                            # Method 3: Try SetStart/SetStartFrame methods
                            if not moved:
                                for m in ["SetStart", "SetStartFrame", "SetRecordFrame", "SetLeftOffset", "SetPosition"]:
                                    fn = _method(it, m)
                                    if fn:
                                        try:
                                            fn(target_frame)
                                            self._log(f"  Called {m}({target_frame})")
                                            moved = True
                                            break
                                        except Exception as e:
                                            self._log(f"    {m} failed: {e}")
                            
                            # If we successfully moved the clip, now update duration and offset
                            if moved:
                                # Get the timeline item again (it might be a new object after insert)
                                try:
                                    items_after = timeline.GetItemListInTrack("video", t) or []
                                    new_it = None
                                    for check_it in items_after:
                                        check_nm = ""
                                        try:
                                            check_nm = check_it.GetName()
                                        except Exception:
                                            try:
                                                mpit = check_it.GetMediaPoolItem()
                                                check_nm = mpit.GetName() if mpit else ""
                                            except Exception:
                                                pass
                                        if take in check_nm:
                                            # Verify position matches
                                            check_pos = None
                                            for pos_m in ["GetStart", "GetStartFrame"]:
                                                pos_fn = _method(check_it, pos_m)
                                                if pos_fn:
                                                    try:
                                                        check_pos = int(pos_fn())
                                                        break
                                                    except Exception:
                                                        pass
                                            if check_pos is not None and abs(check_pos - target_frame) <= 2:
                                                new_it = check_it
                                                break
                                    
                                    # Use new_it if found, otherwise use original it
                                    update_it = new_it if new_it else it
                                    
                                    # Update duration if different
                                    current_dur = None
                                    for m in ["GetDuration", "GetDurationFrames"]:
                                        fn = _method(update_it, m)
                                        if fn:
                                            try:
                                                current_dur = int(fn())
                                                break
                                            except Exception:
                                                pass
                                    
                                    if current_dur is not None:
                                        target_dur_frames = int(round(concepto_duration * fps))
                                        if abs(current_dur - target_dur_frames) > 1:
                                            # Try to set duration
                                            for m in ["SetDuration", "SetDurationFrames"]:
                                                fn = _method(update_it, m)
                                                if fn:
                                                    try:
                                                        fn(target_dur_frames)
                                                        self._log(f"  Set duration to {target_dur_frames} frames")
                                                        break
                                                    except Exception as e:
                                                        self._log(f"    {m} failed: {e}")
                                    
                                    # Update offset (source in point)
                                    if concepto_offset > 0:
                                        offset_frames = int(round(concepto_offset * fps))
                                        set_prop = _method(update_it, "SetProperty")
                                        if set_prop:
                                            try:
                                                for prop_name in ["In", "Start", "StartFrame", "SourceStart"]:
                                                    try:
                                                        update_it.SetProperty(prop_name, offset_frames)
                                                        self._log(f"  Set {prop_name}={offset_frames} (offset)")
                                                        break
                                                    except Exception as e:
                                                        self._log(f"    {prop_name} failed: {e}")
                                            except Exception as e:
                                                self._log(f"  SetProperty for offset failed: {e}")
                                except Exception as e:
                                    self._log(f"  Could not update duration/offset after move: {e}")
                            
                            if moved:
                                updated_count += 1
                                self._log(f"  ✓ Successfully updated [{take}]")
                            else:
                                self._log(f"  ✗ Could not move [{take}] - all methods failed")
                        except Exception as e:
                            self._log(f"  ✗ Failed to update [{take}]: {type(e).__name__}: {e}")
                            import traceback
                            self._log(f"    Traceback: {traceback.format_exc()}")
                
                self._log(f"SYNC FROM CONCEPTO: ✓ Updated {updated_count} clip(s) on timeline")
                self._log("SYNC FROM CONCEPTO complete. Check timeline to verify changes.")
            except Exception as e:
                self._log(f"SYNC FROM CONCEPTO ERROR: {e}")
                import traceback
                self._log(f"Traceback: {traceback.format_exc()}")

        threading.Thread(target=worker, daemon=True).start()
    
    def on_export_av_script(self):
        """Export current timeline subtitles as SRT file for AV Script import (Tkinter version)"""
        # Same implementation as PySide version
        def worker():
            try:
                self._log("EXPORT: Connecting to Resolve...")
                _resolve, project, _media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open.")

                # Get timeline settings
                fps_raw = timeline.GetSetting("timelineFrameRate")
                fps = float(fps_raw) if fps_raw else 24.0
                
                # Get timeline start timecode
                start_tc = timeline.GetStartTimecode()  # e.g. "01:00:00:00"
                parts = start_tc.split(":")
                tl_start_sec = 0.0
                if len(parts) == 4:
                    tl_start_sec = int(parts[0])*3600 + int(parts[1])*60 + int(parts[2]) + (int(parts[3])/fps)
                
                self._log(f"EXPORT: Timeline starts at {start_tc} ({tl_start_sec:.3f}s offset)")

                # Scan subtitle tracks
                get_track_count = _method(timeline, "GetTrackCount")
                get_items = _method(timeline, "GetItemListInTrack")
                
                if not get_track_count or not get_items:
                    raise RuntimeError("Cannot read timeline tracks (API missing).")
                
                s_tracks = int(timeline.GetTrackCount("subtitle") or 0)
                if s_tracks == 0:
                    raise RuntimeError("No subtitle tracks found. Create subtitles first in format: [SC01T01] - Visual description")
                
                self._log(f"EXPORT: Scanning {s_tracks} subtitle track(s)...")
                
                # Collect all subtitle entries
                subtitle_entries = []
                for t in range(1, s_tracks + 1):
                    items = timeline.GetItemListInTrack("subtitle", t) or []
                    for it in items:
                        try:
                            # Get text (try multiple methods)
                            content = ""
                            try: content = it.GetName()
                            except: pass
                            if not content:
                                try:
                                    fn = _method(it, "GetText")
                                    if fn: content = fn()
                                except: pass
                            if not content:
                                try:
                                    prop_fn = _method(it, "GetProperty")
                                    if prop_fn:
                                        content = prop_fn("Text") or prop_fn("Caption")
                                except: pass
                            
                            if not content:
                                continue
                            
                            # Get timing (start and duration)
                            start_frame = None
                            dur_frame = None
                            
                            for m in ["GetStart", "GetStartFrame"]:
                                fn = _method(it, m)
                                if fn:
                                    try:
                                        start_frame = int(fn())
                                        break
                                    except: pass
                            
                            for m in ["GetDuration", "GetDurationFrames"]:
                                fn = _method(it, m)
                                if fn:
                                    try:
                                        dur_frame = int(fn())
                                        break
                                    except: pass
                            
                            if start_frame is None or dur_frame is None:
                                self._log(f"EXPORT: Skipping subtitle - could not read timing")
                                continue
                            
                            # Convert to relative seconds (subtract timeline start)
                            rel_start_sec = (start_frame - int(tl_start_sec * fps)) / fps
                            dur_sec = dur_frame / fps
                            
                            # Look for [SCxxTxx] pattern
                            take_match = re.search(r"\[?\s*(SC\d{2}T\d{2})\s*\]?", content)
                            if not take_match:
                                # Try to extract visual description anyway (might be just text)
                                visual_desc = content.strip()
                            else:
                                take = take_match.group(1)
                                # Extract visual description after [SCxxTxx]
                                visual_desc = re.sub(r"\[?\s*SC\d{2}T\d{2}\s*\]?\s*-?\s*", "", content, flags=re.IGNORECASE).strip()
                            
                            if visual_desc:
                                subtitle_entries.append({
                                    'start': rel_start_sec,
                                    'duration': dur_sec,
                                    'text': content,  # Keep full text with [SCxxTxx]
                                    'visual': visual_desc
                                })
                                
                        except Exception as e:
                            self._log(f"EXPORT: Error reading subtitle item: {e}")
                            continue
                
                if not subtitle_entries:
                    raise RuntimeError("No valid subtitles found. Use format: [SC01T01] - Visual description")
                
                # Sort by start time
                subtitle_entries.sort(key=lambda x: x['start'])
                self._log(f"EXPORT: Found {len(subtitle_entries)} subtitle entries")
                
                # Generate SRT
                def to_srt_time(secs):
                    h = int(secs // 3600)
                    m = int((secs % 3600) // 60)
                    s = int(secs % 60)
                    ms = int((secs % 1) * 1000)
                    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
                
                srt_lines = []
                for i, entry in enumerate(subtitle_entries):
                    start_sec = entry['start']
                    end_sec = start_sec + entry['duration']
                    text = entry['text'].replace('\n', ' ')  # SRT format
                    
                    srt_lines.append(str(i + 1))
                    srt_lines.append(f"{to_srt_time(start_sec)} --> {to_srt_time(end_sec)}")
                    srt_lines.append(text)
                    srt_lines.append("")
                
                srt_content = "\n".join(srt_lines)
                
                # Save to Downloads folder or user-selected location
                from tkinter import filedialog
                from pathlib import Path
                
                default_name = f"av_script_export_{timeline.GetName() or 'timeline'}.srt"
                default_path = Path.home() / "Downloads" / default_name
                
                save_path = filedialog.asksaveasfilename(
                    defaultextension=".srt",
                    filetypes=[("SRT files", "*.srt"), ("All files", "*.*")],
                    initialfile=default_name,
                    initialdir=str(default_path.parent)
                )
                
                if not save_path:
                    self._log("EXPORT: Cancelled by user.")
                    return
                
                with open(save_path, "w", encoding="utf-8") as f:
                    f.write(srt_content)
                
                self._log(f"✓ EXPORT: Saved {len(subtitle_entries)} entries to {save_path}")
                self._log(f"You can now import this SRT file in Concepto AV Script page.")
                
            except Exception as e:
                self._log(f"EXPORT ERROR: {e}")
                import traceback
                self._log(f"Traceback: {traceback.format_exc()}")

        threading.Thread(target=worker, daemon=True).start()

    def on_export_srt_video(self):
        """Export SRT + MAIN track media and sync to Concepto AV Script/Preview (Tkinter version)"""
        def worker():
            try:
                if not self.client or not self.episode:
                    raise RuntimeError("Load an episode first.")

                self._log("EXPORT SRT+VIDEO: Connecting to Resolve...")
                _resolve, project, _media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open.")

                fps, tl_start_sec, start_tc = _get_timeline_settings(timeline)
                self._log(f"EXPORT SRT+VIDEO: Timeline starts at {start_tc} ({tl_start_sec:.3f}s offset)")

                subtitle_entries = _collect_subtitle_entries(timeline, fps, tl_start_sec, self._log)
                if not subtitle_entries:
                    raise RuntimeError("No valid subtitles found. Use format: [SC01T01] - Visual description")

                shots_payload: List[Dict[str, Any]] = []
                for idx, entry in enumerate(subtitle_entries):
                    take = entry.get("take")
                    if not take:
                        self._log("EXPORT SRT+VIDEO: Skipping subtitle without take code")
                        continue
                    seg_num = 1
                    take_match = re.search(r"SC(\d{2})T(\d{2})", take, re.IGNORECASE)
                    if take_match:
                        seg_num = int(take_match.group(1))
                    shots_payload.append({
                        "take": take,
                        "visual": entry.get("visual") or "",
                        "audio": "",
                        "duration": float(entry.get("duration") or 0),
                        "segmentNumber": seg_num,
                        "order": idx,
                    })

                if not shots_payload:
                    raise RuntimeError("No valid subtitles with SCxxTxx codes found.")

                self._log(f"EXPORT SRT+VIDEO: Importing {len(shots_payload)} shots to Concepto...")
                self.client.import_av_script(self.cfg.episode_id, shots_payload)

                # Refresh episode
                ep = self.client.get_episode(self.cfg.episode_id)
                self.episode = ep

                segments = ((ep.get("avScript") or {}).get("segments") or [])
                take_to_shot: Dict[str, Dict[str, Any]] = {}
                for seg in segments:
                    for shot in seg.get("shots") or []:
                        take_val = (shot.get("take") or "").upper()
                        if take_val:
                            take_to_shot[take_val] = {"shot": shot, "segment": seg}

                clips = _collect_main_track_clips(timeline, fps, tl_start_sec, self._log)
                if not clips:
                    self._log("EXPORT SRT+VIDEO: No MAIN track clips found.")
                else:
                    self._log(f"EXPORT SRT+VIDEO: Found {len(clips)} clip(s) on MAIN track:")
                    for clip in clips:
                        self._log(f"  - {clip.get('item_name')} -> take: {clip.get('take')}, file: {clip.get('file_path') or 'NOT FOUND'}")

                self._log(f"EXPORT SRT+VIDEO: Available shots in Concepto after import: {list(take_to_shot.keys())}")

                take_to_clip_id: Dict[str, str] = {}
                for seg in segments:
                    for idx, shot in enumerate(seg.get("shots") or []):
                        take_val = (shot.get("take") or "").upper()
                        if take_val:
                            take_to_clip_id[take_val] = f"{seg.get('id')}-{shot.get('id')}-{idx}"

                video_start_times: Dict[str, float] = {}
                for clip in clips:
                    clip_id = take_to_clip_id.get(clip["take"])
                    if clip_id:
                        video_start_times[clip_id] = float(clip["start"])
                    else:
                        self._log(f"EXPORT SRT+VIDEO: No clip_id mapping for take {clip['take']} (shot not in Concepto yet)")

                if video_start_times:
                    self.client.update_video_clip_start_times(self.cfg.episode_id, video_start_times)
                    self._log(f"EXPORT SRT+VIDEO: Updated {len(video_start_times)} clip start times")

                # Upload media + update duration/offset
                processed_takes = set()
                for clip in clips:
                    take = clip["take"]
                    self._log(f"EXPORT SRT+VIDEO: Processing clip: {clip.get('item_name')} (take: {take})")
                    if take in processed_takes:
                        self._log(f"EXPORT SRT+VIDEO: Duplicate take {take} on MAIN track, skipping")
                        continue
                    processed_takes.add(take)
                    mapping = take_to_shot.get(take)
                    if not mapping:
                        self._log(f"EXPORT SRT+VIDEO: No matching shot for take {take}, skipping upload")
                        self._log(f"EXPORT SRT+VIDEO: Available takes in Concepto: {list(take_to_shot.keys())}")
                        self._log(f"EXPORT SRT+VIDEO: This usually means the shot wasn't created from SRT import. Check if subtitle had [{take}] format.")
                        continue

                    shot = mapping["shot"]
                    seg = mapping["segment"]

                    # Always update duration and offset from timeline (this reflects current state)
                    try:
                        new_duration = float(clip["duration"])
                        new_offset = float(clip["offset"])
                        old_duration = float(shot.get("duration") or 0)
                        old_offset = float(shot.get("videoOffset") or 0)
                        
                        if abs(new_duration - old_duration) > 0.01 or abs(new_offset - old_offset) > 0.01:
                            self._log(f"[{take}] Updating duration: {old_duration:.2f}s -> {new_duration:.2f}s, offset: {old_offset:.2f}s -> {new_offset:.2f}s")
                            self.client.update_shot(shot.get("id"), {
                                "duration": new_duration,
                                "videoOffset": new_offset,
                            })
                        else:
                            self._log(f"[{take}] Duration/offset unchanged: {new_duration:.2f}s, offset: {new_offset:.2f}s")
                    except Exception as e:
                        self._log(f"[{take}] Warning: Could not update duration/offset: {e}")

                    file_path = clip.get("file_path")
                    if not file_path:
                        self._log(f"[{take}] Warning: No file path available for '{clip.get('item_name')}'. Cannot upload.")
                        self._log(f"[{take}] Tip: The clip is on the timeline but source file path could not be determined.")
                        continue
                    
                    if not os.path.exists(file_path):
                        self._log(f"[{take}] Warning: File not found at '{file_path}' for '{clip.get('item_name')}'. Cannot upload.")
                        continue
                    
                    # Check if file with same name already exists in Concepto
                    file_name = os.path.basename(file_path)
                    existing_url = shot.get("videoUrl") if clip["clip_type"] == "video" else shot.get("imageUrl")
                    should_upload = True
                    
                    if existing_url:
                        # Extract filename from URL (handle both full URLs and relative paths)
                        existing_filename = os.path.basename(existing_url.split("?")[0])  # Remove query params
                        if existing_filename.lower() == file_name.lower():
                            self._log(f"[{take}] File '{file_name}' already exists in Concepto with same name, skipping upload")
                            should_upload = False
                        else:
                            self._log(f"[{take}] Different file name: existing='{existing_filename}', new='{file_name}' - will upload")
                    
                    if should_upload:
                        if clip["clip_type"] == "video":
                            self._log(f"[{take}] Uploading video: {file_name}")
                            try:
                                url = self.client.upload_shot_video(
                                    shot.get("id"),
                                    file_path,
                                    self.cfg.episode_id,
                                    seg.get("id"),
                                    mode="replace",  # Use replace to update existing video
                                    set_main=True,
                                )
                                self._log(f"[{take}] ✓ Uploaded video -> {url}")
                            except Exception as e:
                                self._log(f"[{take}] ✗ Video upload failed: {e}")
                        else:
                            self._log(f"[{take}] Uploading image: {file_name}")
                            try:
                                url = self.client.upload_shot_image(
                                    shot.get("id"),
                                    file_path,
                                    self.cfg.episode_id,
                                    seg.get("id"),
                                    mode="replace",  # Use replace to update existing image
                                )
                                self._log(f"[{take}] ✓ Uploaded image -> {url}")
                            except Exception as e:
                                self._log(f"[{take}] ✗ Image upload failed: {e}")

                # Export audio tracks to AV Preview
                self._log("EXPORT SRT+VIDEO: Exporting audio tracks...")
                try:
                    a_tracks = int(timeline.GetTrackCount("audio") or 0)
                    if a_tracks > 0:
                        self._log(f"EXPORT SRT+VIDEO: Found {a_tracks} audio track(s)")
                        
                        audio_tracks_data: List[Dict[str, Any]] = []
                        temp_audio_files: List[str] = []
                        
                        for track_idx in range(1, a_tracks + 1):
                            items = timeline.GetItemListInTrack("audio", track_idx) or []
                            if not items:
                                continue
                            
                            # Get track name (try various methods)
                            track_name = f"Audio {track_idx}"
                            try:
                                get_track_name = _method(timeline, "GetTrackName")
                                if get_track_name:
                                    name_result = timeline.GetTrackName("audio", track_idx)
                                    if name_result:
                                        track_name = name_result
                            except Exception:
                                pass
                            
                            self._log(f"EXPORT SRT+VIDEO: Processing audio track {track_idx}: '{track_name}' ({len(items)} clips)")
                            
                            clips_data: List[Dict[str, Any]] = []
                            
                            for item_idx, item in enumerate(items):
                                try:
                                    item_name = getattr(item, "GetName", lambda: "(unknown)")()
                                    
                                    # Get timeline position
                                    start_frame = None
                                    for m in ["GetStart", "GetStartFrame"]:
                                        fn = _method(item, m)
                                        if fn:
                                            try:
                                                start_frame = int(fn())
                                                break
                                            except Exception:
                                                pass
                                    
                                    # Get duration
                                    dur_frame = None
                                    for m in ["GetDuration", "GetDurationFrames"]:
                                        fn = _method(item, m)
                                        if fn:
                                            try:
                                                dur_frame = int(fn())
                                                break
                                            except Exception:
                                                pass
                                    
                                    if start_frame is None or dur_frame is None:
                                        self._log(f"EXPORT SRT+VIDEO: Skipping audio clip '{item_name}' - could not read timing")
                                        continue
                                    
                                    # Convert to relative seconds
                                    rel_start_sec = (start_frame - int(tl_start_sec * fps)) / fps
                                    dur_sec = dur_frame / fps
                                    
                                    # Get source offset
                                    offset_frame = 0
                                    for prop_name in ["SourceStart", "In", "StartFrame"]:
                                        try:
                                            get_prop = _method(item, "GetProperty")
                                            if get_prop:
                                                prop_val = get_prop(prop_name)
                                                if prop_val is not None:
                                                    offset_frame = int(prop_val)
                                                    break
                                        except Exception:
                                            pass
                                    offset_sec = offset_frame / fps
                                    
                                    # Get volume
                                    volume = 1.0
                                    try:
                                        get_prop = _method(item, "GetProperty")
                                        if get_prop:
                                            vol_val = get_prop("AudioLevels") or get_prop("Volume")
                                            if vol_val is not None:
                                                if isinstance(vol_val, (list, tuple)) and len(vol_val) > 0:
                                                    vol_db = float(vol_val[0])
                                                    volume = max(0.0, min(1.0, 10 ** (vol_db / 20)))
                                                elif isinstance(vol_val, (int, float)):
                                                    volume = max(0.0, min(1.0, float(vol_val)))
                                    except Exception:
                                        pass
                                    
                                    # Get MediaPoolItem
                                    media_pool_item = None
                                    try:
                                        get_mp_item = _method(item, "GetMediaPoolItem")
                                        if get_mp_item:
                                            media_pool_item = item.GetMediaPoolItem()
                                    except Exception:
                                        pass
                                    
                                    if not media_pool_item:
                                        self._log(f"EXPORT SRT+VIDEO: Warning: Could not get MediaPoolItem for '{item_name}', skipping")
                                        continue
                                    
                                    # Get file path
                                    file_path = None
                                    try:
                                        get_file_path = _method(media_pool_item, "GetClipProperty")
                                        if get_file_path:
                                            props = media_pool_item.GetClipProperty(["File Path"])
                                            if props and isinstance(props, dict):
                                                file_path = props.get("File Path") or props.get("FilePath")
                                    except Exception:
                                        pass
                                    
                                    if not file_path or not os.path.exists(file_path):
                                        self._log(f"EXPORT SRT+VIDEO: Warning: Source file not found for '{item_name}', skipping")
                                        continue
                                    
                                    # Copy file to temp location
                                    file_ext = os.path.splitext(file_path)[1][1:] or 'mp3'
                                    export_filename = f"{_safe_slug(track_name)}_{item_idx+1}_{_safe_slug(item_name)}.{file_ext}"
                                    export_dir = Path(self.cfg.download_root) / "_temp_audio_export"
                                    export_dir.mkdir(parents=True, exist_ok=True)
                                    export_path = export_dir / export_filename
                                    
                                    import shutil
                                    shutil.copy2(file_path, export_path)
                                    temp_audio_files.append(str(export_path))
                                    
                                    # Upload to Concepto
                                    try:
                                        audio_url = self.client.upload_audio_clip(self.cfg.episode_id, str(export_path))
                                        
                                        # Get source duration
                                        source_duration_sec = 0.0
                                        try:
                                            src_dur_val = media_pool_item.GetClipProperty("Duration")
                                            if src_dur_val:
                                                if ":" in str(src_dur_val):
                                                    parts = str(src_dur_val).split(":")
                                                    if len(parts) == 4:
                                                        source_duration_sec = int(parts[0])*3600 + int(parts[1])*60 + int(parts[2]) + (int(parts[3])/fps)
                                                else:
                                                    source_duration_sec = float(src_dur_val) / fps
                                        except Exception:
                                            pass
                                        
                                        clips_data.append({
                                            "id": f"clip_{track_idx}_{item_idx}_{int(time.time())}",
                                            "name": item_name,
                                            "url": audio_url,
                                            "startTime": rel_start_sec,
                                            "duration": dur_sec,
                                            "offset": offset_sec,
                                            "volume": volume,
                                            "sourceDuration": source_duration_sec or dur_sec
                                        })
                                        self._log(f"EXPORT SRT+VIDEO: ✓ Uploaded audio clip '{item_name}' from track '{track_name}'")
                                    except Exception as e:
                                        self._log(f"EXPORT SRT+VIDEO: ✗ Failed to upload audio clip '{item_name}': {e}")
                                
                                except Exception as e:
                                    self._log(f"EXPORT SRT+VIDEO: Error processing audio clip: {e}")
                                    continue
                            
                            if clips_data:
                                audio_tracks_data.append({
                                    "id": f"track_{track_idx}",
                                    "name": track_name,
                                    "type": "audio",
                                    "clips": clips_data,
                                    "isMuted": False,
                                    "volume": 1.0
                                })
                        
                        if audio_tracks_data:
                            self._log(f"EXPORT SRT+VIDEO: Sending {len(audio_tracks_data)} audio track(s) to Concepto...")
                            self.client.update_audio_tracks(self.cfg.episode_id, audio_tracks_data)
                            self._log(f"EXPORT SRT+VIDEO: ✓ Successfully exported {len(audio_tracks_data)} audio track(s) to AV Preview")
                        else:
                            self._log("EXPORT SRT+VIDEO: No audio clips were successfully exported")
                        
                        # Cleanup temp files
                        for temp_file in temp_audio_files:
                            try:
                                if os.path.exists(temp_file):
                                    os.remove(temp_file)
                            except Exception:
                                pass
                        # Remove temp directory if empty
                        try:
                            export_dir = Path(self.cfg.download_root) / "_temp_audio_export"
                            if export_dir.exists():
                                try:
                                    export_dir.rmdir()
                                except Exception:
                                    pass
                        except Exception:
                            pass
                    else:
                        self._log("EXPORT SRT+VIDEO: No audio tracks found in timeline")
                except Exception as e:
                    self._log(f"EXPORT SRT+VIDEO: Error exporting audio tracks: {e}")
                    import traceback
                    self._log(f"Traceback: {traceback.format_exc()}")

                self._log("EXPORT SRT+VIDEO: Complete.")
            except Exception as e:
                self._log(f"EXPORT SRT+VIDEO ERROR: {e}")
                import traceback
                self._log(f"Traceback: {traceback.format_exc()}")

        threading.Thread(target=worker, daemon=True).start()

    def on_export_audio(self):
        """Export audio tracks from Resolve timeline to Concepto AV Preview (Tkinter version)"""
        def worker():
            try:
                # Disable button and show loading state
                self.export_audio_btn.config(text="⌛ Exporting Audio...", state=self.tk.DISABLED)
                
                if not self.client or not self.episode or not self.selected_segment_id:
                    raise RuntimeError("Load an episode and select a segment first.")

                self._log("EXPORT AUDIO: Starting connection to DaVinci Resolve...")
                _resolve, project, media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open.")

                # Get timeline settings
                fps_raw = timeline.GetSetting("timelineFrameRate")
                fps = float(fps_raw) if fps_raw else 24.0
                
                # Get timeline start timecode
                start_tc = timeline.GetStartTimecode()
                parts = start_tc.split(":")
                tl_start_sec = 0.0
                if len(parts) == 4:
                    tl_start_sec = int(parts[0])*3600 + int(parts[1])*60 + int(parts[2]) + (int(parts[3])/fps)
                
                self._log(f"EXPORT AUDIO: Timeline starts at {start_tc}")

                # Scan audio tracks
                a_tracks = int(timeline.GetTrackCount("audio") or 0)
                if a_tracks == 0:
                    raise RuntimeError("No audio tracks found in timeline.")
                
                self._log(f"EXPORT AUDIO: Scanning {a_tracks} audio track(s)...")

                audio_tracks_data = []
                temp_audio_files = []
                
                # Determine download root for temp files
                try:
                    download_root = self.download_root_edit.get().strip()
                except:
                    download_root = self.cfg.download_root
                if not download_root: download_root = DOWNLOAD_ROOT_DEFAULT
                
                export_dir = Path(download_root) / "_temp_audio_export"
                export_dir.mkdir(parents=True, exist_ok=True)

                total_clips_count = 0

                for track_idx in range(1, a_tracks + 1):
                    items = timeline.GetItemListInTrack("audio", track_idx) or []
                    if not items: continue
                    
                    track_name = f"Audio {track_idx}"
                    try:
                        name_result = timeline.GetTrackName("audio", track_idx)
                        if name_result: track_name = name_result
                    except: pass
                    
                    self._log(f"EXPORT AUDIO: Processing Track {track_idx}: '{track_name}'...")
                    clips_data = []
                    
                    for item_idx, item in enumerate(items):
                        try:
                            item_name = getattr(item, "GetName", lambda: f"Clip {item_idx+1}")()
                            
                            # Timing
                            start_frame = None
                            for m in ["GetStart", "GetStartFrame"]:
                                fn = _method(item, m)
                                if fn:
                                    try: start_frame = int(fn()); break
                                    except: pass
                            
                            dur_frame = None
                            for m in ["GetDuration", "GetDurationFrames"]:
                                fn = _method(item, m)
                                if fn:
                                    try: dur_frame = int(fn()); break
                                    except: pass
                            
                            if start_frame is None or dur_frame is None: continue
                            
                            rel_start_sec = (start_frame - int(tl_start_sec * fps)) / fps
                            dur_sec = dur_frame / fps
                            
                            # Offset (trim)
                            offset_frame = 0
                            for prop_name in ["SourceStart", "In", "StartFrame"]:
                                try:
                                    val = item.GetProperty(prop_name)
                                    if val is not None: offset_frame = int(val); break
                                except: pass
                            offset_sec = offset_frame / fps
                            
                            # Media Info
                            mp_item = item.GetMediaPoolItem()
                            if not mp_item: continue
                            
                            file_path = mp_item.GetClipProperty("File Path")
                            if not file_path or not os.path.exists(file_path): continue
                            
                            # Export & Upload
                            file_ext = os.path.splitext(file_path)[1][1:] or "mp3"
                            export_filename = f"{_safe_slug(track_name)}_{item_idx+1}.{file_ext}"
                            export_path = export_dir / export_filename
                            
                            import shutil
                            shutil.copy2(file_path, export_path)
                            temp_audio_files.append(str(export_path))
                            
                            self._log(f"  -> Uploading: {item_name} ({dur_sec:.1f}s)")
                            audio_url = self.client.upload_audio_clip(self.cfg.episode_id, str(export_path))
                            
                            # Get source duration for AV Preview to avoid metadata loading timeout
                            source_duration_sec = 0.0
                            try:
                                # Get full source duration from MediaPoolItem properties
                                src_dur_val = media_pool_item.GetClipProperty("Duration")
                                if src_dur_val:
                                    # Parse duration string "HH:MM:SS:FF" or frame count
                                    if ":" in str(src_dur_val):
                                        parts = str(src_dur_val).split(":")
                                        if len(parts) == 4:
                                            source_duration_sec = int(parts[0])*3600 + int(parts[1])*60 + int(parts[2]) + (int(parts[3])/fps)
                                    else:
                                        source_duration_sec = float(src_dur_val) / fps
                            except:
                                pass

                            clips_data.append({
                                "id": f"clip_{track_idx}_{item_idx}_{int(time.time())}",
                                "name": item_name,
                                "url": audio_url,
                                "startTime": rel_start_sec,
                                "duration": dur_sec,
                                "offset": offset_sec,
                                "volume": 1.0,
                                "sourceDuration": source_duration_sec or dur_sec # Fallback to clip duration if source fails
                            })
                            total_clips_count += 1
                        except Exception as e:
                            self._log(f"  ✗ Error on clip {item_idx}: {e}")
                    
                    if clips_data:
                        audio_tracks_data.append({
                            "id": f"track_{track_idx}_{int(time.time())}",
                            "name": track_name,
                            "type": "audio",
                            "clips": clips_data
                        })

                if audio_tracks_data:
                    self._log(f"EXPORT AUDIO: Fetching current tracks from Concepto...")
                    try:
                        ep = self.client.get_episode(self.cfg.episode_id)
                        existing_tracks = (ep.get("avPreviewData") or {}).get("audioTracks") or []
                        
                        # Merge strategy: 
                        # 1. Keep all existing tracks that are NOT in the new Resolve export
                        # 2. Add/Replace tracks from Resolve
                        
                        new_track_names = {t["name"] for t in audio_tracks_data}
                        merged_tracks = []
                        
                        # Add existing tracks that we aren't re-exporting
                        for et in existing_tracks:
                            if et["name"] not in new_track_names:
                                merged_tracks.append(et)
                        
                        # Add all new tracks from Resolve
                        merged_tracks.extend(audio_tracks_data)
                        
                        self._log(f"EXPORT AUDIO: Merged {len(audio_tracks_data)} new track(s) with {len(merged_tracks) - len(audio_tracks_data)} existing track(s).")
                        
                        self._log(f"EXPORT AUDIO: Sending {len(merged_tracks)} total tracks to Concepto...")
                        self.client.update_audio_tracks(self.cfg.episode_id, merged_tracks)
                    except Exception as e:
                        self._log(f"EXPORT AUDIO: Failed to merge with existing tracks, sending as new: {e}")
                        self.client.update_audio_tracks(self.cfg.episode_id, audio_tracks_data)
                    
                    self._log(f"✓ SUCCESS: {total_clips_count} clips exported to AV Preview!")
                else:
                    self._log("⚠ No audio clips were found to export.")

            except Exception as e:
                self._log(f"EXPORT AUDIO ERROR: {e}")
                import traceback
                print(traceback.format_exc())
            finally:
                # Cleanup and Restore Button
                for f in temp_audio_files:
                    try: os.remove(f)
                    except: pass
                self.export_audio_btn.config(text="Export Audio to AV Preview", state=self.tk.NORMAL)

        threading.Thread(target=worker, daemon=True).start()

    def on_import_to_timeline(self):
        """Import Concepto-generated videos into current timeline on NEW tracks (Tkinter version - same as PySide)"""
        # Same implementation as PySide version (reuse the PySide code)
        # Access download_root_edit from Tkinter widget
        def worker():
            try:
                if not self.episode or not self.selected_segment_id or not self.client:
                    raise RuntimeError("Load an episode and select a segment first.")

                # Resolve context
                self._log("IMPORT: Connecting to Resolve...")
                _resolve, project, media_pool = resolve_get_context()
                timeline = project.GetCurrentTimeline()
                if not timeline:
                    raise RuntimeError("No current timeline open. Please open a timeline first.")
                
                self._log(f"IMPORT: Using current timeline: {getattr(timeline,'GetName',lambda:'(unknown)')()}")

                # Determine show/episode folder (use download_root_edit value if available, otherwise cfg)
                try:
                    download_root = self.download_root_edit.get().strip() if hasattr(self, 'download_root_edit') else self.cfg.download_root
                except:
                    download_root = self.cfg.download_root
                
                show_name = _safe_slug((self.show or {}).get("name") or self.episode.get("showId") or "UnknownShow")
                episode_name = _safe_slug(self.episode.get("title") or self.cfg.episode_id)
                base_dir = Path(download_root or DOWNLOAD_ROOT_DEFAULT)
                episode_dir = base_dir / show_name / episode_name
                episode_dir.mkdir(parents=True, exist_ok=True)
                self._log(f"IMPORT: Local episode folder: {episode_dir}")

                # Find selected segment
                segments = ((self.episode.get("avScript") or {}).get("segments") or [])
                seg = next((s for s in segments if s.get("id") == self.selected_segment_id), None)
                if not seg:
                    raise RuntimeError("Selected segment not found.")

                # Use RAW order for clipId + startTimes to match Concepto AVPreview indexing.
                shots_raw = seg.get("shots") or []
                start_times = self._compute_visual_start_times(seg, shots_raw)

                # Find highest existing video and audio track numbers
                get_track_count = _method(timeline, "GetTrackCount")
                if not get_track_count:
                    raise RuntimeError("Cannot read timeline tracks.")
                
                max_v_track = int(timeline.GetTrackCount("video") or 0)
                max_a_track = int(timeline.GetTrackCount("audio") or 0)
                
                # Create NEW tracks for imported content (to avoid overwriting existing)
                new_v_track = max_v_track + 1
                new_a_track_start = max_a_track + 1
                
                add_track = _method(timeline, "AddTrack")
                if add_track:
                    timeline.AddTrack("video")
                    self._log(f"IMPORT: Created new video track V{new_v_track} (to avoid overwriting existing tracks)")
                    
                    # Create audio tracks (will be used for AVPreview audio)
                    timeline.AddTrack("audio")
                    timeline.AddTrack("audio")
                    self._log(f"IMPORT: Created new audio tracks A{new_a_track_start}+ (for AVPreview audio)")

                # Collect audio track assets once for the entire segment
                audio_track_assets = _collect_audio_track_assets(
                    self.episode,
                    self.selected_segment_id,
                    api_endpoint=self.cfg.api_endpoint,
                    log_callback=self._log,
                )
                audio_local_files: List[str] = []
                
                if audio_track_assets:
                    audio_dir = episode_dir / "AVPreview_Audio"
                    audio_dir.mkdir(parents=True, exist_ok=True)
                    self._log(f"IMPORT: Downloading {len(audio_track_assets)} audio track assets from AV Preview...")
                    for url, filename in audio_track_assets:
                        ext = os.path.splitext(url.split("?")[0])[1]
                        if not os.path.splitext(filename)[1] and ext:
                            filename = filename + ext
                        dest = audio_dir / _safe_slug(filename)
                        if not dest.exists():
                            try:
                                _download_file(url, dest)
                                self._log(f"IMPORT: Downloaded audio track: {dest.name}")
                                audio_local_files.append(str(dest))
                            except Exception as e:
                                self._log(f"IMPORT: Failed to download audio track {filename}: {e}")
                                continue
                        else:
                            audio_local_files.append(str(dest))

                # Process takes - sort by order (row) to ensure proper sequencing
                sorted_shots = sorted(shots_raw, key=lambda s: (float(s.get("order", 0) or 0), float(s.get("shotNumber", 0) or 0)))
                self._log(f"IMPORT: Processing {len(sorted_shots)} shots in order (sorted by row/order field)")
                
                for idx, shot in enumerate(sorted_shots):
                    take = (shot.get("take") or f"TAKE_{idx+1:03d}").replace("_image", "")
                    take_dir = episode_dir / take
                    take_dir.mkdir(parents=True, exist_ok=True)

                    # Download assets (same as on_download_build)
                    assets = _collect_take_assets(shot, self.cfg.api_endpoint)
                    local_files: List[str] = []
                    for url, filename in assets:
                        ext = os.path.splitext(url.split("?")[0])[1]
                        if not os.path.splitext(filename)[1] and ext:
                            filename = filename + ext
                        dest = take_dir / _safe_slug(filename)
                        if not dest.exists():
                            try:
                                _download_file(url, dest)
                                self._log(f"IMPORT: [{take}] Downloaded: {dest.name}")
                            except Exception as e:
                                self._log(f"IMPORT: [{take}] Failed to download {filename}: {e}")
                                continue
                        local_files.append(str(dest))

                    # Create bins + import (using CONCEPTO_IMPORTED prefix to distinguish)
                    seg_label = f"SC{int(seg.get('segmentNumber',0)):02d}_{_safe_slug(seg.get('title',''))}"[:80]
                    take_folder = resolve_ensure_bins(media_pool, "CONCEPTO_IMPORTED", seg_label, take)
                    imported = resolve_import_files(media_pool, take_folder, local_files)
                    self._log(f"IMPORT: [{take}] Imported {len(imported)} items into bin.")

                    # Place main on timeline (same logic as on_download_build)
                    main_video_url = shot.get("videoUrl")
                    main_image_url = shot.get("imageUrl")
                    main_url = main_video_url or main_image_url
                    
                    if not main_url:
                        self._log(f"IMPORT: [{take}] No main video/image URL, skipping timeline placement")
                        continue

                    # Determine which type of main asset we have
                    has_video = bool(main_video_url)
                    has_image = bool(main_image_url)
                    self._log(f"IMPORT: [{take}] Main asset: video={has_video}, image={has_image}")

                    # Find matching local file for main (same as PySide version)
                    main_file = None
                    if has_video:
                        for f in local_files:
                            if f.endswith(".mp4") and "MAIN_video" in os.path.basename(f):
                                main_file = f
                                self._log(f"IMPORT: [{take}] Found main video file: {os.path.basename(f)}")
                                break
                    
                    if not main_file and has_image:
                        for f in local_files:
                            basename = os.path.basename(f).lower()
                            if "MAIN_image" in basename and any(basename.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
                                main_file = f
                                self._log(f"IMPORT: [{take}] Found main image file: {os.path.basename(f)}")
                                break
                    
                    # Fallback
                    if not main_file:
                        if has_video:
                            for f in local_files:
                                if f.endswith(".mp4"):
                                    main_file = f
                                    self._log(f"IMPORT: [{take}] Using fallback video file: {os.path.basename(f)}")
                                    break
                        elif has_image:
                            for f in local_files:
                                basename = os.path.basename(f).lower()
                                if any(basename.endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
                                    main_file = f
                                    self._log(f"IMPORT: [{take}] Using fallback image file: {os.path.basename(f)}")
                                    break
                    
                    if not main_file and local_files:
                        main_file = local_files[0]
                        self._log(f"IMPORT: [{take}] Using first available file as main: {os.path.basename(main_file)}")
                    
                    if not main_file:
                        self._log(f"IMPORT: [{take}] WARNING: Could not find main file in downloaded assets!")
                        continue

                    # Find media pool item that matches the imported main file
                    main_item = imported[0] if imported else None
                    get_clips = _method(take_folder, "GetClipList")
                    if get_clips and main_file:
                        want = os.path.basename(main_file)
                        for it in take_folder.GetClipList() or []:
                            nm = getattr(it, "GetName", lambda: "")()
                            if nm == want or want in nm:
                                main_item = it
                                break

                    if not main_item:
                        self._log(f"IMPORT: [{take}] Could not find MediaPoolItem for main, skipping timeline.")
                        continue

                    clip_id = f"{seg.get('id')}-{shot.get('id')}-{idx}"
                    start_sec = float(start_times.get(clip_id, 0.0))
                    dur_sec = float(shot.get("duration") or 0)
                    if dur_sec <= 0:
                        dur_sec = 3.0
                    off_sec = float(shot.get("videoOffset") or 0) or 0.0

                    item_name = getattr(main_item, "GetName", lambda: "(unknown)")()
                    self._log(f"IMPORT: [{take}] Placing '{item_name}' on NEW track V{new_v_track}: start={start_sec}s dur={dur_sec}s offset={off_sec}s")
                    
                    # Ensure timeline is current
                    try:
                        project.SetCurrentTimeline(timeline)
                    except Exception:
                        pass
                    
                    # Place on NEW video track (not overwriting existing)
                    is_image = main_file and any(main_file.lower().endswith(ext) for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"])
                    track_type = "video"
                    try:
                        resolve_place_on_timeline(project, media_pool, timeline, main_item, record_seconds=start_sec, duration_seconds=dur_sec, offset_seconds=off_sec, log_callback=self._log, track_index=new_v_track, track_type=track_type)
                        self._log(f"IMPORT: [{take}] ✓ Successfully placed on NEW track V{new_v_track}")
                    except Exception as e:
                        self._log(f"IMPORT: [{take}] ✗ Failed to place on timeline: {type(e).__name__}: {e}")
                        import traceback
                        self._log(f"IMPORT: [{take}] Traceback: {traceback.format_exc()}")

                # Handle AVPreview audio tracks (same as on_download_build)
                if audio_local_files:
                    self._log(f"IMPORT: Creating audio bin 'AVPreview_Audio' and importing {len(audio_local_files)} audio file(s)...")
                    audio_bin = resolve_ensure_bins(media_pool, "CONCEPTO_IMPORTED", "AVPreview_Audio")
                    audio_imported = resolve_import_files(media_pool, audio_bin, audio_local_files)
                    self._log(f"IMPORT: ✓ Imported {len(audio_imported)} audio file(s) into 'AVPreview_Audio' bin")
                    
                    # Place audio on NEW audio tracks
                    avp = self.episode.get("avPreviewData") or {}
                    audio_tracks = avp.get("audioTracks") or []
                    if audio_tracks:
                        self._log(f"IMPORT: Placing {len(audio_local_files)} AVPreview audio clip(s) onto NEW tracks A{new_a_track_start}+...")
                        target_audio_track = new_a_track_start
                        for track_idx, track_data in enumerate(audio_tracks):
                            clips = track_data.get("clips") or []
                            for clip_idx, clip_data in enumerate(clips):
                                audio_url = clip_data.get("url")
                                if not audio_url:
                                    continue
                                
                                # Find matching imported audio file
                                want_name = None
                                for local_file in audio_local_files:
                                    if audio_url.split("?")[0] in local_file or os.path.basename(local_file) in audio_url:
                                        want_name = os.path.basename(local_file)
                                        break
                                
                                if not want_name:
                                    self._log(f"IMPORT: AUDIO: Could not match URL to local file: {audio_url[:50]}...")
                                    continue
                                
                                # Find MediaPoolItem
                                audio_item = None
                                for it in audio_imported:
                                    nm = getattr(it, "GetName", lambda: "")()
                                    if want_name in nm or nm in want_name:
                                        audio_item = it
                                        break
                                
                                if not audio_item:
                                    self._log(f"IMPORT: AUDIO: Missing MediaPoolItem for {want_name}")
                                    continue
                                
                                # Get timing
                                st = float(clip_data.get("startTime", 0) or 0)
                                du = float(clip_data.get("duration", 0) or 0)
                                if du <= 0:
                                    continue
                                
                                try:
                                    self._log(f"IMPORT: AUDIO: Place '{want_name}' A{target_audio_track} (AVPreview track {track_idx+1}) start={st}s dur={du}s")
                                    resolve_place_on_timeline(
                                        project, media_pool, timeline, audio_item,
                                        record_seconds=st,
                                        duration_seconds=du,
                                        offset_seconds=0.0,
                                        log_callback=self._log,
                                        track_index=target_audio_track,
                                        track_type="audio",
                                    )
                                except Exception as e:
                                    self._log(f"IMPORT: AUDIO: Failed placing '{want_name}': {type(e).__name__}: {e}")
                            
                            target_audio_track += 1  # Next AVPreview track goes on next audio track
                
                self._log("✓ IMPORT: Completed importing to new tracks (existing tracks preserved)")

            except Exception as e:
                self._log(f"IMPORT ERROR: {e}")
                import traceback
                self._log(f"Traceback: {traceback.format_exc()}")

        threading.Thread(target=worker, daemon=True).start()
        
    def on_diagnose(self):
        try:
            self._log("Diagnose: Connecting to Resolve...")
            _resolve, project, _media_pool = resolve_get_context()
            timeline = project.GetCurrentTimeline()
            if not timeline:
                self._log("Diagnose: No current timeline.")
                return
            self._log(f"Diagnose: Timeline = {getattr(timeline,'GetName',lambda:'(unknown)')()}")
            
            def list_methods(obj: Any, label: str, keywords: List[str]):
                methods = []
                for m in dir(obj):
                    if m.startswith("_"):
                        continue
                    if any(k.lower() in m.lower() for k in keywords):
                        try:
                            if callable(getattr(obj, m)):
                                methods.append(m)
                        except Exception:
                            pass
                self._log(f"Diagnose: {label} methods ({', '.join(keywords)}): {', '.join(sorted(methods))}")
                
            list_methods(timeline, "Timeline", ["track", "item", "marker", "timecode", "start", "duration"])
            
            get_track_count = _method(timeline, "GetTrackCount")
            get_items = _method(timeline, "GetItemListInTrack")
            if get_track_count and get_items:
                try:
                    v_tracks = int(timeline.GetTrackCount("video") or 0)
                except Exception:
                    v_tracks = 1
                self._log(f"Diagnose: video track count = {v_tracks}")
                if v_tracks > 0:
                    items = timeline.GetItemListInTrack("video", 1) or []
                    self._log(f"Diagnose: track1 items = {len(items)}")
                    if items:
                        it = items[0]
                        self._log(f"Diagnose: sample item name = {getattr(it,'GetName',lambda:'(no GetName)')() if it else ''}")
                        list_methods(it, "TimelineItem", ["get", "set", "property", "start", "duration", "offset", "media"])
            else:
                self._log("Diagnose: Missing Timeline.GetTrackCount or Timeline.GetItemListInTrack (cannot read timeline items).")
        except Exception as e:
            self._log(f"Diagnose ERROR: {e}")
            
    def run(self):
        self.root.mainloop()


def _main_tkinter():
    """Run tkinter GUI version"""
    _log_to_file("Starting tkinter GUI version")
    w = MainWindowTk()
    w.run()


def main():
    if USE_PYSIDE:
        _main_pyside()
    elif USE_TKINTER:
        _main_tkinter()
    else:
        error_msg = (
            "No GUI library available.\n\n"
            "Neither PySide2/PySide6 nor tkinter is available.\n\n"
            f"Python: {sys.executable}\n"
            f"sys.path: {sys.path[:5]}...\n\n"
            "Check log: " + LOG_PATH_DEFAULT
        )
        _log_to_file(f"FATAL: {error_msg}")
        raise RuntimeError(error_msg)


if __name__ == "__main__":
    try:
        _log_to_file("=== concepto_resolve_sync_gui start ===")
        main()
    except Exception as e:
        _log_to_file("FATAL: " + str(e))
        _log_to_file(traceback.format_exc())
        # If Qt is available, show a popup so it doesn't fail silently.
        try:
            if QtWidgets is not None:
                app = QtWidgets.QApplication.instance() or QtWidgets.QApplication(sys.argv)
                QtWidgets.QMessageBox.critical(None, "Concepto Resolve Sync - Error", f"{e}\n\nSee log:\n{LOG_PATH_DEFAULT}")
        except Exception:
            pass


