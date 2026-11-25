/**
 * DownMyVid Chrome Extension - Popup Controller
 */

document.addEventListener('DOMContentLoaded', async () => {
  const urlInput = document.getElementById('urlInput');
  const pasteBtn = document.getElementById('pasteBtn');
  const extractBtn = document.getElementById('extractBtn');
  const statusEl = document.getElementById('status');
  const formatsBox = document.getElementById('formatsBox');

  // Auto-detect current active tab URL
  chrome.runtime.sendMessage({ action: 'GET_CURRENT_TAB' }, (tab) => {
    if (tab?.url) {
      const u = tab.url;
      if (u.includes('youtube.com') || u.includes('x.com') || u.includes('twitter.com') || u.includes('instagram.com') || u.includes('tiktok.com')) {
        urlInput.value = u;
        statusEl.textContent = 'Detected video URL from current tab.';
      }
    }
  });

  // Paste from clipboard
  pasteBtn.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        urlInput.value = text.trim();
        statusEl.textContent = 'URL pasted!';
      }
    } catch {
      statusEl.textContent = 'Please paste manually into the input box.';
    }
  });

  // Extract formats
  extractBtn.addEventListener('click', () => {
    const rawUrl = urlInput.value.trim();
    if (!rawUrl) {
      statusEl.textContent = 'Please enter a video URL first.';
      return;
    }

    extractBtn.disabled = true;
    extractBtn.textContent = '⏳ Extracting media...';
    statusEl.textContent = 'Contacting DownMyVid API...';
    formatsBox.style.display = 'none';
    formatsBox.innerHTML = '';

    chrome.runtime.sendMessage({ action: 'EXTRACT_MEDIA', url: rawUrl }, (res) => {
      extractBtn.disabled = false;
      extractBtn.textContent = '⚡ Fetch Formats';

      if (!res || !res.success || !res.data) {
        statusEl.textContent = res?.error || 'Extraction failed. Try another link.';
        return;
      }

      const media = res.data;
      statusEl.textContent = `Found ${media.formats?.length || 0} downloadable format(s)!`;

      if (Array.isArray(media.formats) && media.formats.length > 0) {
        formatsBox.style.display = 'block';

        media.formats.forEach((fmt) => {
          const item = document.createElement('div');
          item.className = 'format-item';

          const label = fmt.label || fmt.quality || `${fmt.format || 'MP4'} Video`;
          const size = fmt.sizeMb ? `${fmt.sizeMb} MB` : (fmt.type === 'audio' ? 'MP3' : 'HD');

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

            chrome.runtime.sendMessage({ action: 'DOWNLOAD_MEDIA', url: dlUrl, filename: fname }, (dlRes) => {
              if (dlRes?.success) {
                item.innerHTML = '<span style="color:#10b981; font-weight:700;">✓ Download Started!</span>';
              } else if (dlRes?.fallbackUrl) {
                window.open(dlRes.fallbackUrl, '_blank');
              }
            });
          });

          formatsBox.appendChild(item);
        });
      }
    });
  });
});
