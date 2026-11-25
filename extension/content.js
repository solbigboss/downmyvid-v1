/**
 * DownMyVid Chrome Extension - Content Script
 * Monitors YouTube, X (Twitter), and Instagram DOM to inject 3D download buttons.
 * Privacy-First: 0 trackers, 0 third-party redirects.
 */

(() => {
  const HOSTNAME = window.location.hostname;
  const IS_YOUTUBE = HOSTNAME.includes('youtube.com');
  const IS_X = HOSTNAME.includes('x.com') || HOSTNAME.includes('twitter.com');
  const IS_INSTAGRAM = HOSTNAME.includes('instagram.com');

  const DOWNLOAD_ICON_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.586l-4.293-4.293-1.414 1.414L12 18.414l5.707-5.707-1.414-1.414L12 15.586zM11 4h2v10h-2V4zM4 19h16v2H4v-2z"/>
    </svg>
  `;

  // Active popup overlay reference
  let currentPopupEl = null;

  function closePopup() {
    if (currentPopupEl) {
      currentPopupEl.remove();
      currentPopupEl = null;
    }
  }

  /**
   * Render 3D Floating Quality Picker Modal
   */
  function showQualityModal(videoUrl, mediaData, errorMsg) {
    closePopup();

    const overlay = document.createElement('div');
    overlay.className = 'dmv-popup-overlay';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePopup();
    });

    const popup = document.createElement('div');
    popup.className = 'dmv-popup';

    // Header
    const header = document.createElement('div');
    header.className = 'dmv-popup-header';
    header.innerHTML = `
      <div class="dmv-popup-title">
        ${DOWNLOAD_ICON_SVG}
        <span>DownMyVid 3D Downloader</span>
      </div>
      <button class="dmv-popup-close" title="Close">✕</button>
    `;
    header.querySelector('.dmv-popup-close').addEventListener('click', closePopup);
    popup.appendChild(header);

    // If an error occurred or no formats were found
    if (errorMsg || !mediaData || !Array.isArray(mediaData.formats) || mediaData.formats.length === 0) {
      const errBox = document.createElement('div');
      errBox.className = 'dmv-alert';
      errBox.innerHTML = `
        <p style="margin:0 0 8px 0; font-weight:700;">${errorMsg || 'Unable to load direct formats.'}</p>
        <a href="https://downmyvid.com?url=${encodeURIComponent(videoUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:4px; padding:6px 12px; background:#007bff; color:white; border-radius:8px; text-decoration:none; font-weight:700;">
          Open on DownMyVid.com ↗
        </a>
      `;
      popup.appendChild(errBox);
      overlay.appendChild(popup);
      document.body.appendChild(overlay);
      currentPopupEl = overlay;
      return;
    }

    // Video Meta Card
    const metaCard = document.createElement('div');
    metaCard.className = 'dmv-meta-card';

    const thumbSrc = mediaData.thumbnailUrl || mediaData.coverUrl || '';
    const authorName = mediaData.author?.name || mediaData.author?.handle || 'Video';
    const textDesc = mediaData.tweetText || mediaData.title || mediaData.originalUrl || 'Ready to download';

    metaCard.innerHTML = `
      ${thumbSrc ? `<img src="${thumbSrc}" class="dmv-meta-thumb" alt="Preview"/>` : ''}
      <div class="dmv-meta-text">
        <div class="dmv-meta-author">${escapeHtml(authorName)}</div>
        <div class="dmv-meta-desc">${escapeHtml(textDesc)}</div>
      </div>
    `;
    popup.appendChild(metaCard);

    // Format Cards List
    const formatsList = document.createElement('div');
    formatsList.className = 'dmv-formats-list';

    mediaData.formats.forEach((fmt) => {
      const btn = document.createElement('button');
      btn.className = 'dmv-format-btn';

      const label = fmt.label || fmt.quality || `${fmt.format || 'MP4'} Video`;
      const sizeStr = fmt.sizeMb ? `${fmt.sizeMb} MB` : (fmt.type === 'audio' ? 'MP3 Audio' : 'HD');
      const badgeText = fmt.type === 'audio' ? 'AUDIO' : (fmt.resolution || fmt.quality || 'MP4');

      btn.innerHTML = `
        <div class="dmv-format-left">
          <span class="dmv-format-label">${escapeHtml(label)}</span>
          <span class="dmv-format-sub">${escapeHtml(sizeStr)}</span>
        </div>
        <span class="dmv-format-badge">${escapeHtml(badgeText)}</span>
      `;

      btn.addEventListener('click', () => {
        btn.innerHTML = `<span>⏳ Preparing download...</span>`;
        btn.style.opacity = '0.7';

        const downloadUrl = fmt.directUrl || fmt.url || mediaData.videoUrl;
        const filename = `DownMyVid_${authorName}_${Date.now()}.${fmt.type === 'audio' ? 'mp3' : 'mp4'}`;

        chrome.runtime.sendMessage(
          { action: 'DOWNLOAD_MEDIA', url: downloadUrl, filename },
          (resp) => {
            if (resp && resp.success) {
              btn.innerHTML = `<span>✓ Download Started!</span>`;
              btn.style.borderColor = '#10b981';
              btn.style.color = '#10b981';
              setTimeout(closePopup, 1600);
            } else if (resp?.fallbackUrl) {
              window.open(resp.fallbackUrl, '_blank');
              closePopup();
            } else {
              btn.innerHTML = `<span>Download triggered!</span>`;
              setTimeout(closePopup, 1600);
            }
          }
        );
      });

      formatsList.appendChild(btn);
    });

    popup.appendChild(formatsList);
    overlay.appendChild(popup);
    document.body.appendChild(overlay);
    currentPopupEl = overlay;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Trigger media extraction when a 3D button is pressed
   */
  function handleDownloadClick(videoUrl, buttonEl) {
    const originalContent = buttonEl.innerHTML;
    buttonEl.innerHTML = `<span class="dmv-spinner"></span><span>Extracting...</span>`;
    buttonEl.style.pointerEvents = 'none';

    chrome.runtime.sendMessage(
      { action: 'EXTRACT_MEDIA', url: videoUrl },
      (response) => {
        buttonEl.innerHTML = originalContent;
        buttonEl.style.pointerEvents = '';

        if (response && response.success && response.data) {
          showQualityModal(videoUrl, response.data, null);
        } else {
          showQualityModal(videoUrl, null, response?.error || 'Extraction failed.');
        }
      }
    );
  }

  // =========================================================================
  // PLATFORM INJECTORS
  // =========================================================================

  /**
   * 1. YouTube Injector
   */
  function injectYouTube() {
    // Watch Page
    const watchActions = document.querySelector(
      'ytd-watch-metadata #actions #top-level-buttons-computed, #menu-container #top-level-buttons-computed'
    );
    if (watchActions && !watchActions.querySelector('.dmv-yt-btn')) {
      const wrap = document.createElement('div');
      wrap.className = 'dmv-yt-wrapper';

      const btn = document.createElement('button');
      btn.className = 'dmv-btn dmv-yt-btn';
      btn.setAttribute('type', 'button');
      btn.setAttribute('title', 'Download video with DownMyVid');
      btn.innerHTML = `${DOWNLOAD_ICON_SVG}<span>DownMyVid</span>`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDownloadClick(window.location.href, btn);
      });

      wrap.appendChild(btn);
      watchActions.appendChild(wrap);
    }

    // Shorts Page
    const shortsActions = document.querySelectorAll(
      'ytd-reel-player-overlay-renderer #actions, ytd-reel-video-renderer[is-active] #actions'
    );
    shortsActions.forEach((actions) => {
      if (actions && !actions.querySelector('.dmv-yt-btn')) {
        const wrap = document.createElement('div');
        wrap.className = 'dmv-yt-wrapper';

        const btn = document.createElement('button');
        btn.className = 'dmv-btn dmv-btn-compact dmv-yt-btn';
        btn.setAttribute('type', 'button');
        btn.setAttribute('title', 'Download Short with DownMyVid');
        btn.innerHTML = `${DOWNLOAD_ICON_SVG}<span>Save</span>`;

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDownloadClick(window.location.href, btn);
        });

        wrap.appendChild(btn);
        actions.appendChild(wrap);
      }
    });
  }

  /**
   * 2. X / Twitter Injector
   */
  function injectX() {
    const tweets = document.querySelectorAll('article[data-testid="tweet"]');

    tweets.forEach((tweet) => {
      // Check if tweet contains any video or audio component
      const hasVideo = tweet.querySelector(
        'video, [data-testid="videoPlayer"], [data-testid="videoComponent"], [aria-label*="video" i], [data-testid="playButton"]'
      );
      if (!hasVideo) return;

      const actionBar = tweet.querySelector('div[role="group"]');
      if (!actionBar || actionBar.querySelector('.dmv-x-btn')) return;

      // Extract status URL
      const linkEl = tweet.querySelector('a[href*="/status/"]');
      const tweetUrl = linkEl
        ? `https://x.com${linkEl.getAttribute('href').split('?')[0]}`
        : window.location.href;

      const wrap = document.createElement('div');
      wrap.className = 'dmv-x-wrapper';

      const btn = document.createElement('button');
      btn.className = 'dmv-btn dmv-btn-compact dmv-x-btn';
      btn.setAttribute('type', 'button');
      btn.setAttribute('title', 'Download video with DownMyVid');
      btn.innerHTML = `${DOWNLOAD_ICON_SVG}<span>Save</span>`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDownloadClick(tweetUrl, btn);
      });

      wrap.appendChild(btn);
      actionBar.appendChild(wrap);
    });
  }

  /**
   * 3. Instagram Injector
   */
  function injectInstagram() {
    // Reels & Feed posts with videos
    const videos = document.querySelectorAll('article video, div[role="dialog"] video, main video');

    videos.forEach((vid) => {
      const container = vid.closest('article') || vid.closest('div[role="dialog"]') || vid.closest('section') || vid.parentElement;
      if (!container || container.querySelector('.dmv-ig-btn')) return;

      // Action row with like/comment/share
      const actionBar = container.querySelector('section, div[role="presentation"]');
      if (!actionBar) return;

      // Find post permalink
      const linkEl = container.querySelector('a[href*="/reel/"], a[href*="/p/"]');
      const postUrl = linkEl
        ? `https://www.instagram.com${linkEl.getAttribute('href').split('?')[0]}`
        : window.location.href;

      const wrap = document.createElement('div');
      wrap.className = 'dmv-ig-wrapper';

      const btn = document.createElement('button');
      btn.className = 'dmv-btn dmv-btn-compact dmv-ig-btn';
      btn.setAttribute('type', 'button');
      btn.setAttribute('title', 'Download video with DownMyVid');
      btn.innerHTML = `${DOWNLOAD_ICON_SVG}<span>DownMyVid</span>`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDownloadClick(postUrl, btn);
      });

      wrap.appendChild(btn);
      actionBar.appendChild(wrap);
    });
  }

  /**
   * Main scan loop
   */
  function scanAndInject() {
    if (IS_YOUTUBE) injectYouTube();
    if (IS_X) injectX();
    if (IS_INSTAGRAM) injectInstagram();
  }

  // Initial scan
  scanAndInject();

  // MutationObserver with 250ms debounce for Single Page Applications
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanAndInject, 250);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  // Re-check on URL pushState / history changes
  window.addEventListener('popstate', () => setTimeout(scanAndInject, 500));
})();
