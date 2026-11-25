# DownMyVid Chrome Extension (Manifest V3)

A high-performance, privacy-first Manifest V3 Chrome Extension that injects 3D-styled DownMyVid download buttons directly into **YouTube**, **X (Twitter)**, and **Instagram**, with a 1-click popup downloader.

---

## 🚀 Features

* **3D Glassmorphism UI**: Buttons feature the signature DownMyVid cyber-blue gradient, inset specular highlights, and reactive hover/press animations.
* **MutationObserver SPA Support**: Automatically detects newly loaded video elements on YouTube (Watch & Shorts), X/Twitter timeline tweets, and Instagram Reels without page reloads.
* **Direct Format Picker**: Clicking the injected 3D button opens a floating modal with available resolutions (1080p Full HD, 720p HD, and MP3 audio) and file sizes.
* **CORS-Free Background Service Worker**: Uses `background.js` as an API bridge to resolve video streams directly from the DownMyVid API.
* **100% Privacy-First & Zero-Tracking**: No analytics, no third-party telemetry, and no shady redirects. Direct downloads triggered cleanly.

---

## 🛠️ How to Install in Chrome / Brave / Edge

1. Open your Chromium browser (Google Chrome, Brave, Microsoft Edge, or Arc).
2. Navigate to the extensions page:
   * Chrome: `chrome://extensions`
   * Brave: `brave://extensions`
   * Edge: `edge://extensions`
3. In the top-right corner, toggle **Developer mode** to **ON**.
4. Click the **Load unpacked** button.
5. Select the `extension/` folder inside this repository:
   ```
   D:\New folder\downmyvid-v1\extension
   ```
6. The extension is now active! You will see the DownMyVid 3D icon in your browser toolbar.

---

## 🎬 How It Works

* **YouTube**: Browse to any video on `youtube.com/watch` or `youtube.com/shorts`. A glowing blue **DownMyVid** button will appear in the action bar next to Like/Share.
* **X (Twitter)**: Scroll through your timeline. Any tweet containing video or audio will have a compact 3D **Save** button injected right inside its tweet action bar.
* **Instagram**: Open any Reel or post with video. An action button will appear next to the Share/Bookmark buttons.
* **Toolbar Popup**: Click the extension icon in your browser toolbar to paste any link directly or auto-extract media from the active tab.

---

## 📂 Architecture Overview

```
extension/
├── manifest.json      # Manifest V3 configuration & host permissions
├── background.js      # Background service worker & secure API bridge
├── content.js         # MutationObserver DOM injector & 3D quality modal
├── styles.css         # 3D Glassmorphism, cyber neon accents, & animations
├── popup.html         # Toolbar quick-downloader popup interface
├── popup.js           # Active tab auto-detection & clipboard paste logic
├── icons/             # 16px, 32px, 48px, 128px high-DPI extension icons
└── README.md          # Installation guide and documentation
```
