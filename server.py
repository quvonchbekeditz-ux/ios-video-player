import os
import sys
import json
import string
import hashlib
import mimetypes
import asyncio
import tempfile
import ctypes
from pathlib import Path
from typing import Dict, List, Optional
import aiohttp
from aiohttp import web
import aiofiles

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

PORT = 8765
HOST = "127.0.0.1"

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
CACHE_DIR = BASE_DIR / ".cache"
THUMB_CACHE = CACHE_DIR / "thumbnails"
SCREENSHOTS_DIR = BASE_DIR / "screenshots"

THUMB_CACHE.mkdir(parents=True, exist_ok=True)
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)

VIDEO_EXTENSIONS = {
    ".mp4", ".mkv", ".webm", ".avi", ".mov", ".flv", ".ts", ".m4v", 
    ".3gp", ".wmv", ".ogv", ".vob", ".m2ts", ".divx", ".asf", ".f4v"
}

SUBTITLE_EXTENSIONS = {
    ".srt", ".vtt", ".ass", ".ssa", ".sub"
}

def get_windows_drives() -> List[Dict[str, str]]:
    """Returns a list of available Windows drives with labels and total/free space."""
    drives = []
    bitmask = ctypes.windll.kernel32.GetLogicalDrives()
    for letter in string.ascii_uppercase:
        if bitmask & 1:
            drive_path = f"{letter}:\\"
            label = f"Local Disk ({letter}:)"
            drive_type = ctypes.windll.kernel32.GetDriveTypeW(drive_path)
            type_str = "fixed"
            if drive_type == 2:
                type_str = "removable"
                label = f"USB Drive ({letter}:)"
            elif drive_type == 4:
                type_str = "network"
                label = f"Network Drive ({letter}:)"
            elif drive_type == 5:
                type_str = "cdrom"
                label = f"Optical Drive ({letter}:)"

            try:
                free_bytes = ctypes.c_ulonglong(0)
                total_bytes = ctypes.c_ulonglong(0)
                ctypes.windll.kernel32.GetDiskFreeSpaceExW(
                    drive_path, None, ctypes.byref(total_bytes), ctypes.byref(free_bytes)
                )
                total_gb = round(total_bytes.value / (1024**3), 1)
                free_gb = round(free_bytes.value / (1024**3), 1)
                used_gb = round(total_gb - free_gb, 1)
                percent_used = round((used_gb / total_gb * 100), 1) if total_gb > 0 else 0
            except Exception:
                total_gb, free_gb, used_gb, percent_used = 0, 0, 0, 0

            drives.append({
                "path": drive_path,
                "letter": letter,
                "label": label,
                "type": type_str,
                "total_gb": total_gb,
                "free_gb": free_gb,
                "used_gb": used_gb,
                "percent_used": percent_used
            })
        bitmask >>= 1
    return drives

def get_system_folders() -> List[Dict[str, str]]:
    """Returns special user folders like Desktop, Downloads, Videos, Documents."""
    user_home = Path.home()
    folders = [
        {"name": "Videos", "path": str(user_home / "Videos"), "icon": "video"},
        {"name": "Downloads", "path": str(user_home / "Downloads"), "icon": "download"},
        {"name": "Desktop", "path": str(user_home / "Desktop"), "icon": "monitor"},
        {"name": "Documents", "path": str(user_home / "Documents"), "icon": "folder"},
        {"name": "Music", "path": str(user_home / "Music"), "icon": "music"},
        {"name": "Pictures", "path": str(user_home / "Pictures"), "icon": "image"},
    ]
    return [f for f in folders if os.path.exists(f["path"])]

def get_file_hash(path: str) -> str:
    return hashlib.md5(path.encode('utf-8')).hexdigest()

def extract_video_thumbnail(video_path: str, timestamp_sec: float = 5.0) -> Optional[str]:
    """Extracts a thumbnail from a video at timestamp and returns the cached image path."""
    if not HAS_CV2 or not os.path.isfile(video_path):
        return None

    path_hash = get_file_hash(f"{video_path}_{timestamp_sec}")
    cache_path = THUMB_CACHE / f"{path_hash}.jpg"

    if cache_path.exists() and cache_path.stat().st_size > 0:
        return str(cache_path)

    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return None

        fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
        frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 100
        duration = frame_count / fps

        target_time = timestamp_sec if timestamp_sec < duration else (duration * 0.1)
        target_frame = int(target_time * fps)

        cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
        ret, frame = cap.read()

        if not ret or frame is None:
            cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            ret, frame = cap.read()

        cap.release()

        if ret and frame is not None:
            h, w = frame.shape[:2]
            if w > 640:
                new_w = 640
                new_h = int(h * (640 / w))
                frame = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_AREA)

            cv2.imwrite(str(cache_path), frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
            return str(cache_path)
    except Exception as e:
        print(f"Error extracting thumbnail for {video_path}: {e}")
    return None

def get_video_metadata(video_path: str) -> Dict:
    """Extracts resolution, duration, FPS, codec for a video file."""
    meta = {
        "duration": 0.0,
        "width": 0,
        "height": 0,
        "fps": 0.0,
        "resolution_label": "SD",
        "codec": "Unknown"
    }

    if not HAS_CV2 or not os.path.isfile(video_path):
        return meta

    try:
        cap = cv2.VideoCapture(video_path)
        if cap.isOpened():
            fps = cap.get(cv2.CAP_PROP_FPS) or 0.0
            frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0.0
            w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
            h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
            duration = (frame_count / fps) if fps > 0 else 0.0
            fourcc = int(cap.get(cv2.CAP_PROP_FOURCC) or 0)
            codec_str = "".join([chr((fourcc >> 8 * i) & 0xFF) for i in range(4)]) if fourcc > 0 else "Unknown"

            res_label = "SD"
            if w >= 3800 or h >= 2100:
                res_label = "4K UHD"
            elif w >= 1900 or h >= 1000:
                res_label = "1080p FHD"
            elif w >= 1200 or h >= 700:
                res_label = "720p HD"

            meta.update({
                "duration": round(duration, 2),
                "width": w,
                "height": h,
                "fps": round(fps, 2),
                "resolution_label": res_label,
                "codec": codec_str.strip()
            })
            cap.release()
    except Exception as e:
        print(f"Metadata extract error for {video_path}: {e}")
    return meta

def parse_srt_to_vtt(srt_content: str) -> str:
    """Converts SubRip (.srt) string to WebVTT format."""
    lines = srt_content.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    vtt_lines = ["WEBVTT\n"]
    for line in lines:
        if "-->" in line:
            line = line.replace(",", ".")
        vtt_lines.append(line)
    return "\n".join(vtt_lines)

# --- Aiohttp Request Handlers ---

async def handle_drives(request: web.Request) -> web.Response:
    """Returns drives list and system folders."""
    drives = get_windows_drives()
    system_folders = get_system_folders()
    return web.json_response({
        "drives": drives,
        "system_folders": system_folders
    })

async def handle_browse(request: web.Request) -> web.Response:
    """Browse a given directory path or default to user home."""
    target_path = request.query.get("path", "").strip()
    if not target_path or not os.path.exists(target_path):
        target_path = str(Path.home() / "Videos")
        if not os.path.exists(target_path):
            target_path = str(Path.home())

    target_path = os.path.abspath(target_path)
    folders = []
    videos = []
    others = []

    try:
        with os.scandir(target_path) as entries:
            for entry in entries:
                try:
                    name = entry.name
                    if name.startswith(".") or name.startswith("$") or name.lower() in ("system volume information", "recycler", "$recycle.bin"):
                        continue

                    full_path = entry.path
                    stat = entry.stat()
                    modified_time = int(stat.st_mtime)
                    size_bytes = stat.st_size if entry.is_file() else 0

                    if entry.is_dir():
                        folders.append({
                            "name": name,
                            "path": full_path,
                            "modified": modified_time,
                            "is_dir": True
                        })
                    elif entry.is_file():
                        ext = os.path.splitext(name)[1].lower()
                        if ext in VIDEO_EXTENSIONS:
                            videos.append({
                                "name": name,
                                "path": full_path,
                                "ext": ext,
                                "size": size_bytes,
                                "modified": modified_time,
                                "is_video": True
                            })
                        else:
                            others.append({
                                "name": name,
                                "path": full_path,
                                "ext": ext,
                                "size": size_bytes,
                                "modified": modified_time,
                                "is_other": True
                            })
                except (PermissionError, OSError):
                    continue
    except (PermissionError, OSError) as e:
        return web.json_response({"error": str(e), "path": target_path}, status=403)

    folders.sort(key=lambda x: x["name"].lower())
    videos.sort(key=lambda x: x["name"].lower())

    parent_path = os.path.dirname(target_path)
    if parent_path == target_path:
        parent_path = None

    return web.json_response({
        "current_path": target_path,
        "parent_path": parent_path,
        "folders": folders,
        "videos": videos,
        "other_files_count": len(others),
        "total_items": len(folders) + len(videos)
    })

async def handle_search(request: web.Request) -> web.Response:
    """Deep search for videos in a folder."""
    root_path = request.query.get("path", "").strip()
    query = request.query.get("query", "").strip().lower()
    deep = request.query.get("deep", "0") == "1"
    format_filter = request.query.get("format", "all").lower()

    if not root_path or not os.path.exists(root_path):
        return web.json_response({"videos": []})

    results = []
    max_results = 300

    def match_file(name: str, ext: str) -> bool:
        if ext not in VIDEO_EXTENSIONS:
            return False
        if format_filter != "all" and ext != f".{format_filter}":
            return False
        if query and query not in name.lower():
            return False
        return True

    try:
        if not deep:
            with os.scandir(root_path) as entries:
                for entry in entries:
                    if entry.is_file():
                        ext = os.path.splitext(entry.name)[1].lower()
                        if match_file(entry.name, ext):
                            stat = entry.stat()
                            results.append({
                                "name": entry.name,
                                "path": entry.path,
                                "ext": ext,
                                "size": stat.st_size,
                                "modified": int(stat.st_mtime),
                                "is_video": True
                            })
        else:
            for root, dirs, files in os.walk(root_path):
                dirs[:] = [d for d in dirs if not d.startswith(".") and not d.startswith("$") and d.lower() not in ("node_modules", "$recycle.bin", "system volume information")]
                for f in files:
                    ext = os.path.splitext(f)[1].lower()
                    if match_file(f, ext):
                        full_p = os.path.join(root, f)
                        try:
                            stat = os.stat(full_p)
                            results.append({
                                "name": f,
                                "path": full_p,
                                "ext": ext,
                                "size": stat.st_size,
                                "modified": int(stat.st_mtime),
                                "is_video": True
                            })
                            if len(results) >= max_results:
                                break
                        except OSError:
                            continue
                if len(results) >= max_results:
                    break
    except Exception as e:
        print(f"Search error: {e}")

    return web.json_response({"videos": results, "count": len(results)})

async def handle_thumbnail(request: web.Request) -> web.Response:
    """Returns a JPEG thumbnail for a video."""
    video_path = request.query.get("path", "").strip()
    t_str = request.query.get("t", "5.0")
    try:
        t = float(t_str)
    except ValueError:
        t = 5.0

    if not video_path or not os.path.isfile(video_path):
        return web.Response(status=404)

    loop = asyncio.get_event_loop()
    thumb_path = await loop.run_in_executor(None, extract_video_thumbnail, video_path, t)

    if thumb_path and os.path.isfile(thumb_path):
        return web.FileResponse(thumb_path, headers={"Cache-Control": "public, max-age=86400"})
    
    return web.Response(status=404)

async def handle_metadata(request: web.Request) -> web.Response:
    """Returns detailed metadata for a video."""
    video_path = request.query.get("path", "").strip()
    if not video_path or not os.path.isfile(video_path):
        return web.json_response({"error": "File not found"}, status=404)

    loop = asyncio.get_event_loop()
    meta = await loop.run_in_executor(None, get_video_metadata, video_path)
    stat = os.stat(video_path)
    meta.update({
        "size": stat.st_size,
        "modified": int(stat.st_mtime),
        "filename": os.path.basename(video_path),
        "path": video_path
    })
    return web.json_response(meta)

async def handle_subtitles(request: web.Request) -> web.Response:
    """Finds matching subtitle files in the same folder or serves converted VTT."""
    video_path = request.query.get("path", "").strip()
    sub_path = request.query.get("sub_path", "").strip()

    if sub_path and os.path.isfile(sub_path):
        try:
            async with aiofiles.open(sub_path, mode='r', encoding='utf-8', errors='ignore') as f:
                content = await f.read()
            ext = os.path.splitext(sub_path)[1].lower()
            if ext == ".srt":
                content = parse_srt_to_vtt(content)
            elif ext == ".vtt":
                if not content.startswith("WEBVTT"):
                    content = "WEBVTT\n\n" + content
            return web.Response(text=content, content_type="text/vtt; charset=utf-8")
        except Exception as e:
            return web.Response(text=f"WEBVTT\n\n1\n00:00:00.000 --> 00:00:05.000\nSubtitle load error: {e}", content_type="text/vtt")

    if not video_path or not os.path.isfile(video_path):
        return web.json_response({"subtitles": []})

    folder = os.path.dirname(video_path)
    base_name = os.path.splitext(os.path.basename(video_path))[0]
    matched_subs = []

    try:
        with os.scandir(folder) as entries:
            for entry in entries:
                if entry.is_file():
                    ext = os.path.splitext(entry.name)[1].lower()
                    if ext in SUBTITLE_EXTENSIONS:
                        sub_base = os.path.splitext(entry.name)[0]
                        is_match = base_name.lower() in sub_base.lower() or sub_base.lower() in base_name.lower()
                        matched_subs.append({
                            "name": entry.name,
                            "path": entry.path,
                            "ext": ext,
                            "is_primary": is_match
                        })
    except Exception as e:
        print(f"Subtitle scan error: {e}")

    matched_subs.sort(key=lambda x: (not x["is_primary"], x["name"].lower()))
    return web.json_response({"subtitles": matched_subs})

async def handle_video_stream(request: web.Request) -> web.StreamResponse:
    """High performance video streaming with HTTP 206 Partial Content / Range support."""
    video_path = request.query.get("path", "").strip()
    if not video_path or not os.path.isfile(video_path):
        return web.Response(status=404, text="Video file not found")

    file_size = os.path.getsize(video_path)
    mime_type, _ = mimetypes.guess_type(video_path)
    if not mime_type:
        mime_type = "video/mp4"

    range_header = request.headers.get("Range")

    if not range_header:
        headers = {
            "Content-Type": mime_type,
            "Content-Length": str(file_size),
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*"
        }
        response = web.StreamResponse(status=200, headers=headers)
        await response.prepare(request)
        async with aiofiles.open(video_path, "rb") as f:
            while True:
                chunk = await f.read(256 * 1024)
                if not chunk:
                    break
                await response.write(chunk)
        return response

    try:
        range_val = range_header.strip().replace("bytes=", "")
        start_str, end_str = range_val.split("-")
        start = int(start_str) if start_str else 0
        end = int(end_str) if end_str else file_size - 1

        if start >= file_size or end >= file_size or start > end:
            return web.Response(status=416, headers={"Content-Range": f"bytes */{file_size}"})

        chunk_len = end - start + 1
        headers = {
            "Content-Type": mime_type,
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(chunk_len),
            "Accept-Ranges": "bytes",
            "Access-Control-Allow-Origin": "*"
        }
        response = web.StreamResponse(status=206, headers=headers)
        await response.prepare(request)

        async with aiofiles.open(video_path, "rb") as f:
            await f.seek(start)
            bytes_left = chunk_len
            while bytes_left > 0:
                read_size = min(256 * 1024, bytes_left)
                chunk = await f.read(read_size)
                if not chunk:
                    break
                await response.write(chunk)
                bytes_left -= len(chunk)

        return response
    except Exception as e:
        print(f"Streaming error: {e}")
        return web.Response(status=500, text=str(e))

async def handle_save_screenshot(request: web.Request) -> web.Response:
    """Saves base64 screenshot data to disk."""
    try:
        data = await request.json()
        image_b64 = data.get("image", "")
        filename = data.get("filename", "screenshot.png")
        if not image_b64:
            return web.json_response({"error": "No image data"}, status=400)

        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]

        import base64
        image_bytes = base64.b64decode(image_b64)
        
        save_path = SCREENSHOTS_DIR / filename
        async with aiofiles.open(save_path, "wb") as f:
            await f.write(image_bytes)

        return web.json_response({
            "success": True,
            "path": str(save_path),
            "filename": filename
        })
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def handle_open_in_explorer(request: web.Request) -> web.Response:
    """Reveals the file or folder in native Windows Explorer."""
    try:
        data = await request.json()
        target_path = data.get("path", "").strip()
        if target_path and os.path.exists(target_path):
            if os.path.isfile(target_path):
                os.system(f'explorer /select,"{os.path.normpath(target_path)}"')
            else:
                os.system(f'explorer "{os.path.normpath(target_path)}"')
            return web.json_response({"success": True})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
    return web.json_response({"error": "Invalid path"}, status=400)

def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/api/drives", handle_drives)
    app.router.add_get("/api/browse", handle_browse)
    app.router.add_get("/api/search", handle_search)
    app.router.add_get("/api/thumbnail", handle_thumbnail)
    app.router.add_get("/api/metadata", handle_metadata)
    app.router.add_get("/api/subtitles", handle_subtitles)
    app.router.add_get("/api/video", handle_video_stream)
    app.router.add_post("/api/save_screenshot", handle_save_screenshot)
    app.router.add_post("/api/open_explorer", handle_open_in_explorer)

    app.router.add_static("/static/", path=str(STATIC_DIR), name="static")
    
    async def index_handler(request):
        return web.FileResponse(str(STATIC_DIR / "index.html"))
    
    app.router.add_get("/", index_handler)
    return app

if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    app = create_app()
    print(f"[*] iOS Super Video Player server running at http://{HOST}:{PORT}")
    web.run_app(app, host=HOST, port=PORT, print=None)
