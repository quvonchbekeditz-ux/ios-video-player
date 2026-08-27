#!/usr/bin/env python3
"""
iOS Super Video Player - Desktop Launcher
Launches the asynchronous Python media server and opens the iOS Super Video Player 
in a frameless, native hardware-accelerated desktop window (Edge or Chrome App Mode).
"""

import os
import sys
import time
import subprocess
import webbrowser
import urllib.request
from pathlib import Path

PORT = 8765
URL = f"http://127.0.0.1:{PORT}"

def wait_for_server(timeout=10.0):
    start = time.time()
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(f"{URL}/api/drives", timeout=1.0) as resp:
                if resp.status == 200:
                    return True
        except Exception:
            time.sleep(0.2)
    return False

def find_browser_executable():
    possible_paths = [
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"),
    ]
    for p in possible_paths:
        if os.path.isfile(p):
            return p
    return None

def main():
    if hasattr(sys.stdout, "reconfigure"):
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass
    base_dir = Path(__file__).resolve().parent
    server_script = base_dir / "server.py"

    print("=" * 60)
    print("      [+] iOS SUPER VIDEO PLAYER & FILE EXPLORER")
    print("=" * 60)
    print(f"[*] Server starting on {URL}...")

    # Start server in subprocess
    server_proc = subprocess.Popen(
        [sys.executable, str(server_script)],
        cwd=str(base_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    if not wait_for_server():
        print("[!] Server startup timed out. Launching browser anyway...")

    browser_bin = find_browser_executable()
    if browser_bin:
        print(f"[*] Launching in Native Desktop Window: {browser_bin}")
        # Launch in native App Mode (frameless iOS experience)
        app_proc = subprocess.Popen(
            [browser_bin, f"--app={URL}", "--window-size=1280,800"]
        )
    else:
        print("[*] Browser not found in default paths. Opening default browser...")
        webbrowser.open(URL)
        app_proc = None

    print("\n[+] Player is active and running!")
    print("    - Press Ctrl+C in this terminal to stop the player.")
    print("=" * 60)

    try:
        if app_proc:
            app_proc.wait()
        else:
            while True:
                time.sleep(1)
    except KeyboardInterrupt:
        print("\n[*] Stopping player...")
    finally:
        server_proc.terminate()
        print("[+] Player stopped. Goodbye!")

if __name__ == "__main__":
    main()
