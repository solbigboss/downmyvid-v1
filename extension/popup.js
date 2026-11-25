/**
 * DownMyVid Chrome Extension - Popup Controller
 * Connects to active tab content script and background extractor.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const extractBtn = document.getElementById('extractBtn');
  const statusEl = document.getElementById('status');
  const formatsBox = document.getElementById('formatsBox');

  let cachedDomMedia = null;

  function isBareProfileUrl(u) {
    if (!u) return true;
    try {
      const parsed = new URL(u);
      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname;

      if (host.includes('x.com') || host.includes('twitter.com')) {
        return !path.includes('/status/');
      }
      if (host.includes('instagram.com')) {
        return !path.includes('/reel/') && !path.includes('/p/');
      }
      if (host.includes('tiktok.com')) {
        return !path.includes('/video/');
      }
      if (host.includes('facebook.com') || host.includes('fb.watch') || host.includes('fb.com')) {
        return !path.includes('/videos/') && !path.includes('/watch') && !path.includes('/reel/') && !path.includes('/posts/');
      }
      if (host.includes('youtube.com')) {
        return !path.includes('/watch') && !path.includes('/shorts');
      }
      return false;
    } catch {
      return false;
    }
  }

  function handleTabFallback(tab) {
    if (!tab?.url) return;
    const u = tab.url;

    if (!isBareProfileUrl(u)) {
      urlInput.value = u;
      statusEl.textContent = 'Detected video URL from current tab.';
    } else if (u.includes('x.com') || u.includes('twitter.com') || u.includes('instagram.com')) {
      statusEl.textContent = 'Play a video or click its Download button on the page.';
    }
  }

  // 1. Auto-detect current active tab and query active video in DOM
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, { action: 'GET_ACTIVE_VIDEO' }, (res) => {
      if (chrome.runtime.lastError || !res || !res.success) {
        handleTabFallback(tab);
        return;
      }

      if (res.url && !isBareProfileUrl(res.url)) {
        urlInput.value = res.url;
        statusEl.textContent = '⚡ Detected active video from page player!';
        if (res.domMedia) {
          cachedDomMedia = res.domMedia;
        }
      } else {
        handleTabFallback(tab);
      }
    });
  });

  // 2. Paste from clipboard
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        urlInput.value = text.trim();
        statusEl.textContent = 'URL pasted!';
        cachedDomMedia = null; // reset DOM cache on manual paste
      }
    } catch {
      statusEl.textContent = 'Please paste manually into the input box.';
    }
  });

  // 3. Extract formats
  extractBtn.addEventListener('click', () => {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
      statusEl.textContent = 'Please paste or select a video URL first.';
      return;
    }

    if (isBareProfileUrl(rawUrl)) {
      statusEl.textContent = 'Please paste a direct video post link, not a profile page.';
      return;
    }

    extractBtn.disabled = true;
    extractBtn.textContent = '⏳ Extracting media...';
    statusEl.textContent = 'Connecting to DownMyVid engine...';
    formatsBox.style.display = 'none';
    formatsBox.innerHTML = '';

    chrome.runtime.sendMessage(
      { action: 'EXTRACT_MEDIA', url: rawUrl, domMedia: cachedDomMedia },
      (res) => {
        extractBtn.disabled = false;
        extractBtn.textContent = '⚡ Fetch Formats';

        if (!res || !res.success || !res.data) {
          statusEl.textContent = res?.error || 'Extraction failed. Make sure post is public.';
          return;
        }

        const media = res.data;
        const formats = Array.isArray(media.formats) ? media.formats : [];
        statusEl.textContent = `Found ${formats.length} downloadable format(s)!`;

        if (formats.length > 0) {
          formatsBox.style.display = 'block';

          formats.forEach((fmt) => {
            const item = document.createElement('div');
            item.className = 'format-item';

            const label = fmt.label || fmt.quality || `${fmt.format || 'MP4'} Video`;
            const size = fmt.sizeMb ? `${fmt.sizeMb} MB` : (fmt.type === 'audio' ? 'MP3 Audio' : 'HD');

            item.innerHTML = `
              <div>
                <strong style="font-size:12px;">${label}</strong>
                <div style="font-size:10px; color:#64748b;">${size}</div>
              </div>
              <span style="font-size:11px; color:#00f2fe; font-weight:700;">Download ⬇</span>
            `;

            item.addEventListener('click', () => {
              item.innerHTML = '<span>⏳ Downloading...</span>';
              const dlUrl = fmt.directUrl || fmt.url || media.videoUrl;
              const fname = `DownMyVid_${Date.now()}.${fmt.type === 'audio' ? 'mp3' : 'mp4'}`;

              chrome.runtime.sendMessage(
                { action: 'DOWNLOAD_MEDIA', url: dlUrl, filename: fname },
                (dlRes) => {
                  if (dlRes?.success) {
                    item.innerHTML = '<span style="color:#10b981; font-weight:700;">✓ Download Started!</span>';
                  } else if (dlRes?.fallbackUrl) {
                    window.open(dlRes.fallbackUrl, '_blank');
                  } else {
                    item.innerHTML = '<span>Download triggered!</span>';
                  }
                }
              );
            });

            formatsBox.appendChild(item);
          });
        }
      }
    );
  });
});
