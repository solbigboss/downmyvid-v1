# DownMyVid Chrome Extension (Manifest V3)

A high-performance, privacy-first Manifest V3 Chrome Extension that injects 3D-styled DownMyVid download buttons directly **UNDER** video players on **YouTube**, **X (Twitter)**, **Instagram**, **Facebook**, and **TikTok**, with instant DOM extraction and 1-click popup downloader.

---

## 🚀 Features

* **Sub-Video Placement (Never Obstructs or Pauses Videos)**:
  - Download buttons are placed directly beneath video players in the native action bar (Like/Comment/Share/Bookmark) or in a dedicated sub-video bar.
  - Zero overlay buttons inside video players: clicking the button will never accidentally pause, mute, or interfere with playback.
* **Instant DOM-Direct Media Extraction**: Reads the direct, unencrypted CDN video stream (`video.currentSrc`) straight from your active browser session on Instagram, Facebook, X, and TikTok, completely eliminating "Failed to fetch" errors.
* **Full Multi-Platform Support**:
  - **X (Twitter)**: Directly in the action bar under timeline tweets, profile videos, and modal previews.
  - **Facebook**: Directly in the post toolbar under feed videos, Reels, and Facebook Watch players.
  - **Instagram**: Directly in the action bar row under feed posts and Reels.
  - **YouTube**: In the watch page actions bar and Shorts action column.
* **Smart Active Video Detection in Popup**: Opening the toolbar popup automatically asks the page for the playing video's real status link and direct stream, avoiding generic profile URLs.
* **Multi-Tier Background Bridge**: Fallback cascade using FxTwitter, VxTwitter, TikWM, Tioo Facebook, and DownMyVid's Cloudflare Worker API without CORS restrictions.
* **3D Glassmorphism UI**: Buttons feature the signature DownMyVid cyber-blue gradient, inset specular highlights, and reactive hover/press animations with the official website logo.
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
6. The extension is now active! Refresh any open tabs of X, Instagram, Facebook, or YouTube to apply the latest content scripts.

---

## 🎬 How It Works

* **X (Twitter)**:
  - Directly beneath any video in your timeline or profile, a 3D **Save** button is cleanly placed next to Bookmark/Share in the action bar.
* **Instagram**:
  - A 3D **DownMyVid** button is injected directly into the action bar below Reels and feed posts. It never covers the video or causes it to pause when clicked.
* **Facebook**:
  - On feed posts, Watch videos, and Reels, a 3D **DownMyVid** button appears in the action toolbar directly under the video.
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
├── styles.css         # 3D Glassmorphism, cyber neon accents, action bars, & animations
├── popup.html         # Toolbar quick-downloader popup interface
├── popup.js           # Active player query, status link resolution, & formats downloader
├── icons/             # 16px, 32px, 48px, 128px high-DPI extension icons & logo
└── README.md          # Installation and update guide
```
