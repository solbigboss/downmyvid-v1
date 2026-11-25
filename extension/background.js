/**
 * DownMyVid Chrome Extension - Background Service Worker (Manifest V3)
 * Acts as the secure API bridge between content scripts and the DownMyVid backend API.
 * Privacy First: 100% Zero-Tracking & Zero-Redirect.
 */

const API_ENDPOINTS = [
  'https://downmyvid-meta-api.saddikos97.workers.dev/api/extract',
  'https://downmyvid.com/api/extract',
  'http://localhost:3000/api/extract',
];

/**
 * Fetch video metadata and download formats with automatic endpoint fallback
 */
async function extractMediaWithFallback(videoUrl) {
  let lastError = null;

  for (const endpoint of API_ENDPOINTS) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ url: videoUrl }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));

      if (response.ok) {
        const json = await response.json();
        if (json && (json.success || json.data)) {
          return { success: true, data: json.data || json };
        }
      }

      const errText = await response.text().catch(() => '');
      let parsed = null;
      try {
        parsed = JSON.parse(errText);
      } catch {
        // ignore
      }

      if (response.status === 429) {
        return {
          success: false,
          error: parsed?.message || 'Rate limit reached. Please wait a moment before trying again.',
          isRateLimited: true,
        };
      }

      lastError = parsed?.error || `Server responded with status ${response.status}`;
    } catch (err) {
      lastError = err?.message || 'Network request failed';
    }
  }

  return {
    success: false,
    error: lastError || 'Unable to extract media from this video. Please try again.',
  };
}

/**
 * Trigger file download via chrome.downloads API
 */
async function downloadFile(url, suggestedFilename) {
  try {
    const filename = suggestedFilename
      ? suggestedFilename.replace(/[^a-zA-Z0-9._-]/g, '_')
      : `DownMyVid_${Date.now()}.mp4`;

    const downloadId = await chrome.downloads.download({
      url,
      filename,
      saveAs: false,
      conflictAction: 'uniquify',
    });

    return { success: true, downloadId };
  } catch (err) {
    console.warn('chrome.downloads failed, falling back:', err);
    return { success: false, error: err.message, fallbackUrl: url };
  }
}

// Runtime message dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'EXTRACT_MEDIA') {
    extractMediaWithFallback(message.url)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (message.action === 'DOWNLOAD_MEDIA') {
    downloadFile(message.url, message.filename)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'GET_CURRENT_TAB') {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      sendResponse({ url: tab?.url || '', title: tab?.title || '' });
    });
    return true;
  }
});
