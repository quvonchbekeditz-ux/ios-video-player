# 🎬 iOS 18 Glass Video Player Pro & System-Wide File Explorer

![Version](https://img.shields.io/badge/version-2.5.0-blue.svg)
![Backend](https://img.shields.io/badge/backend-Python%203.10%2B%20%7C%20aiohttp-yellow.svg)
![Frontend](https://img.shields.io/badge/frontend-HTML5%20%7C%20CSS3%20%7C%20Vanilla%20JS-orange.svg)
![Design](https://img.shields.io/badge/design-Apple%20iOS%2018%20%2F%20visionOS-purple.svg)
![License](https://img.shields.io/badge/license-Proprietary-red.svg)

An ultra-modern, high-performance video player and full-system file explorer crafted in accordance with Apple **iOS 18** and **visionOS** design aesthetics.

---

## 🌟 Key Capabilities & Features

### 1. 🗂️ System-Wide File Explorer
* **Complete Disk Access**: Native browsing across C:\, D:\, E:\, and all connected external USB storage devices with live storage capacity indicators.
* **Quick-Access Folders**: Instant one-click shortcuts to Desktop, Downloads, Videos, and Documents.
* **Deep Video Scanner**: Instantly indexes all video files within nested subdirectories in seconds.
* **Automated Thumbnail Generation**: Real-time 4K/HD video frame capture and caching powered by OpenCV.
* **Broad Format Support**: Seamless playback of .mp4, .mkv, .webm, .mov, .avi, .m4v, .flv, and more.

### 2. 📱 Apple iOS 18 & visionOS Interface
* **Dynamic Island HUD**: Live interactive notch notifications for volume, brightness, theme changes, and bookmarks.
* **Frosted Glassmorphism**: Ultra-smooth ackdrop-filter: blur(24px) glass interface.
* **6 Premium Themes**:
  1. *iOS Dark Glass* (Default dark)
  2. *iOS Light Frosted* (Crisp Cupertino light)
  3. *OLED Pure Black* (True deep blacks)
  4. *Midnight Nebula* (Cosmic purple gradient)
  5. *Titanium Gold* (Apple Pro luxury)
  6. *Cyber Neon* (Futuristic vibrant)

### 3. 🎥 High-Performance Video Engine
* **Zero-Lag Byte-Range Streaming**: Powered by Python iohttp HTTP 206 Partial Content for ultra-fast scrubbing of 4K/8K media.
* **Smart Touch & Mouse Gestures**:
  * Left-side vertical swipe: **Brightness adjustment**
  * Right-side vertical swipe: **Volume control**
  * Double-click/tap: **10s Skip Forward / Backward** with wave animations
  * Mouse wheel: **50% to 300% Optical Zoom**
* **Frame-by-Frame Stepping**: Precision millisecond playback inspection with , and . keys.
* **A-B Loop Repeat**: Define custom timestamp ranges for continuous looping.
* **Smart Resume**: Remembers and restores last playback position automatically.

### 4. 🎚️ Web Audio Studio & 10-Band Equalizer
* **10-Band Studio Equalizer (32Hz – 16kHz)**.
* **300% Volume Boost**: Boosts quiet audio streams up to 3x via Web Audio GainNode.
* **Audio Delay Synchronization**: Fine-tune audio-video offset from -5.0s to +5.0s.

### 5. 💬 Subtitles Studio & Live Transcript
* Automatic parsing of local .srt and .vtt subtitle files.
* **Interactive Live Transcript**: Click any subtitle line to seek directly to that exact timestamp.

---

## 📂 Project Structure

`	ext
ios_video_player/
├── server.py              # Asynchronous aiohttp backend & disk API
├── run.py                 # Application launcher
├── start.bat              # One-click Windows runner
├── static/                # Frontend assets (HTML, CSS, JS, icons)
├── screenshots/           # Application preview screenshots
├── .gitignore             # Git exclusion rules
└── README.md              # Project documentation
`

---

## 🚀 Getting Started

1. Install required dependencies:
   `ash
   pip install aiohttp opencv-python
   `
2. Launch the server:
   `ash
   python server.py
   `
   *(Or double-click start.bat on Windows)*
3. Navigate to: http://localhost:8080

---

## 📄 License & Rights

© All Rights Reserved. Proprietary software.
