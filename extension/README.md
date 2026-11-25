# DownMyVid Chrome Extension (Manifest V3)

A high-performance, privacy-first Manifest V3 Chrome Extension that injects 3D-styled DownMyVid download buttons directly into **YouTube**, **X (Twitter)**, **Instagram**, and **TikTok**, with instant DOM extraction and 1-click popup downloader.

---

## 🚀 Features

* **Instant DOM-Direct Media Extraction**: Reads the direct, unencrypted CDN video stream (`video.currentSrc`) straight from your active browser session on Instagram, X, and TikTok, completely eliminating "Failed to fetch" errors.
* **Dual Injection on X (Twitter)**:
  - Injects into timeline action bars (`div[role="group"]`).
  - Injects a floating 3D **[⬇ Download]** badge directly onto the video player in theatre mode, modal previews (`div[aria-modal="true"]`), and profile video overlays.
  - Automatically resolves real tweet status permalinks (`x.com/.../status/...`) even on profile pages like `x.com/Tesla`.
* **Smart Active Video Detection in Popup**: Opening the toolbar popup automatically asks the page for the playing video's real status link and direct stream, avoiding generic profile URLs.
* **Multi-Tier Background Bridge**: Fallback cascade using FxTwitter, VxTwitter, TikWM, and DownMyVid's Cloudflare Worker API without CORS restrictions.
* **3D Glassmorphism UI**: Buttons feature the signature DownMyVid cyber-blue gradient, inset specular highlights, and reactive hover/press animations.
* **100% Privacy-First & Zero-Tracking**: No analytics, no third-party telemetry, and no redirects. Direct downloads triggered cleanly via `chrome.downloads`.

---

## 🛠️ How to Install or Update in Chrome / Brave / Edge

1. Open your Chromium browser (Google Chrome, Brave, Microsoft Edge, or Arc).
2. Navigate to `chrome://extensions` (or `brave://extensions` / `edge://extensions`).
3. Toggle **Developer mode** to **ON** in the top-right corner.
4. If you have already loaded the extension:
   * Click the 🔄 **Reload** icon on the DownMyVid extension card.
5. If installing for the first time:
   * Click **Load unpacked**.
   * Select the `extension/` folder inside this repository:
     ```
     D:\New folder\downmyvid-v1\extension
     ```
6. The extension is now active! Refresh any open tabs of X, Instagram, or YouTube to apply the latest content scripts.

---

## 🎬 How It Works

* **X (Twitter)**:
  - On tweets in your timeline, a 3D **Save** button appears next to Like/Bookmark in the action bar.
  - In theatre mode / modal view or on profile pages (e.g. `x.com/Tesla`), a 3D **Download** pill floats on the video player itself.
* **Instagram**:
  - A 3D **DownMyVid** button is injected into the action bar below Reels and feed posts.
  - A floating 3D badge appears on video players, enabling instant 1-click direct MP4 downloads from Instagram's CDN.
* **YouTube**:
  - Browse to any video on `youtube.com/watch` or `youtube.com/shorts`. A glowing blue **DownMyVid** button appears in the action bar.
* **Toolbar Popup**:
  - Click the extension icon in your browser toolbar to automatically detect the playing video or paste any video link.

---

## 📂 Architecture Overview

```
extension/
├── manifest.json      # Manifest V3 configuration, host permissions, & content scripts
├── background.js      # Background service worker, multi-tier API bridge, & chrome.downloads
├── content.js         # MutationObserver DOM injector, direct video extractor, & 3D modal
├── styles.css         # 3D Glassmorphism, cyber neon accents, floating badge, & animations
├── popup.html         # Toolbar quick-downloader popup interface
├── popup.js           # Active player query, status link resolution, & formats downloader
├── icons/             # 16px, 32px, 48px, 128px high-DPI extension icons
└── README.md          # Installation and update guide
```
