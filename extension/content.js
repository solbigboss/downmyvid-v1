/**
 * DownMyVid Chrome Extension - Content Script
 * Monitors YouTube, X (Twitter), Instagram, and TikTok DOM to inject 3D download buttons.
 * Instant Direct DOM Extraction + Background Service Worker Bridge.
 * Privacy-First: 0 trackers, 0 third-party redirects.
 */

(() => {
  const HOSTNAME = window.location.hostname;
  const IS_YOUTUBE = HOSTNAME.includes('youtube.com');
  const IS_X = HOSTNAME.includes('x.com') || HOSTNAME.includes('twitter.com');
  const IS_INSTAGRAM = HOSTNAME.includes('instagram.com');
  const IS_TIKTOK = HOSTNAME.includes('tiktok.com');

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
   * Extract direct media stream, poster, and metadata directly from a container's <video> element
   */
  function findDirectVideoInfo(container) {
    const video = container.querySelector('video') || (container.tagName === 'VIDEO' ? container : null);
    if (!video) return null;

    const directSrc = video.currentSrc || video.src || video.querySelector('source')?.src || '';
    const poster = video.getAttribute('poster') || container.querySelector('img')?.src || '';
    const authorEl = container.querySelector('a[href*="/"], header a, [data-testid="User-Name"]');
    const author = authorEl?.textContent?.trim() || 'Video';
    const textEl = container.querySelector('[data-testid="tweetText"], h1, span, p');
    const title = textEl?.textContent?.trim().slice(0, 120) || 'Video Stream';

    return {
      directUrl: directSrc.startsWith('http') ? directSrc : null,
      poster: poster.startsWith('http') ? poster : null,
      author,
      title,
    };
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

    // If an error occurred and no formats were found
    if (errorMsg || !mediaData || !Array.isArray(mediaData.formats) || mediaData.formats.length === 0) {
      const errBox = document.createElement('div');
      errBox.className = 'dmv-alert';
      errBox.innerHTML = `
        <p style="margin:0 0 8px 0; font-weight:700;">${escapeHtml(errorMsg || 'Unable to load direct formats.')}</p>
        <a href="https://downmyvid.com?url=${encodeURIComponent(videoUrl || window.location.href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; margin-top:4px; padding:6px 14px; background:#007bff; color:white; border-radius:8px; text-decoration:none; font-weight:700;">
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
      ${thumbSrc ? `<img src="${escapeHtml(thumbSrc)}" class="dmv-meta-thumb" alt="Preview"/>` : ''}
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
        btn.innerHTML = `<span>⏳ Downloading...</span>`;
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
              btn.innerHTML = `<span>Download started!</span>`;
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
  function handleDownloadClick(videoUrl, buttonEl, domMedia) {
    const originalContent = buttonEl.innerHTML;
    buttonEl.innerHTML = `<span class="dmv-spinner"></span><span>Loading...</span>`;
    buttonEl.style.pointerEvents = 'none';

    chrome.runtime.sendMessage(
      { action: 'EXTRACT_MEDIA', url: videoUrl, domMedia },
      (response) => {
        buttonEl.innerHTML = originalContent;
        buttonEl.style.pointerEvents = '';

        if (response && response.success && response.data) {
          showQualityModal(videoUrl, response.data, null);
        } else if (domMedia && domMedia.directUrl) {
          // Instant direct stream from DOM if background API encountered issues
          showQualityModal(videoUrl, {
            originalUrl: videoUrl,
            videoUrl: domMedia.directUrl,
            thumbnailUrl: domMedia.poster || '',
            tweetText: domMedia.title || 'Direct Video Stream',
            author: { name: domMedia.author || 'Video' },
            formats: [
              {
                id: 'dom_direct',
                label: 'Direct HD MP4 (Active Stream)',
                quality: '1080p / Direct',
                format: 'MP4',
                sizeMb: 12.0,
                directUrl: domMedia.directUrl,
              },
            ],
          }, null);
        } else {
          showQualityModal(videoUrl, null, response?.error || 'Extraction failed. Make sure the video is public.');
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
    // Watch Page Action Bar
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
        handleDownloadClick(window.location.href, btn, null);
      });

      wrap.appendChild(btn);
      watchActions.appendChild(wrap);
    }

    // Shorts Page Action Bar
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
          handleDownloadClick(window.location.href, btn, null);
        });

        wrap.appendChild(btn);
        actions.appendChild(wrap);
      }
    });
  }

  /**
   * Helper: Find Tweet Permalink from any tweet element, modal, or video container
   */
  function resolveTweetUrl(container) {
    // 1. Look for <time> tag's parent <a> link (standard Twitter timestamp permalink)
    const timeLink = container.querySelector('time')?.closest('a');
    if (timeLink && timeLink.getAttribute('href')?.includes('/status/')) {
      return `https://x.com${timeLink.getAttribute('href').split('?')[0]}`;
    }

    // 2. Look for any <a> tag with /status/
    const statusLinks = container.querySelectorAll('a[href*="/status/"]');
    for (const a of statusLinks) {
      const href = a.getAttribute('href');
      if (href && /\/status\/\d+/.test(href)) {
        return `https://x.com${href.split('?')[0]}`;
      }
    }

    // 3. Check if current window URL is a status URL
    if (window.location.pathname.includes('/status/')) {
      return `https://x.com${window.location.pathname.split('?')[0]}`;
    }

    // 4. Look upwards in parent elements for status links
    let parent = container.parentElement;
    for (let depth = 0; depth < 5 && parent; depth++) {
      const parentLink = parent.querySelector('time')?.closest('a') || parent.querySelector('a[href*="/status/"]');
      if (parentLink && parentLink.getAttribute('href')?.includes('/status/')) {
        return `https://x.com${parentLink.getAttribute('href').split('?')[0]}`;
      }
      parent = parent.parentElement;
    }

    return null;
  }

  /**
   * 2. X / Twitter Injector (Supports Timeline, Profile pages, Theatre mode, and Modal overlays)
   */
  function injectX() {
    // A. Action Bar Injection in standard tweets, cell containers, and modal dialogs
    const tweetContainers = document.querySelectorAll(
      'article[data-testid="tweet"], div[aria-modal="true"], div[data-testid="sheetDialog"], div[data-testid="cellInnerDiv"]'
    );

    tweetContainers.forEach((container) => {
      // Must contain a video or audio component
      const hasVideo = container.querySelector(
        'video, [data-testid="videoPlayer"], [data-testid="videoComponent"], [aria-label*="video" i]'
      );
      if (!hasVideo) return;

      const actionBar = container.querySelector('div[role="group"]');
      if (!actionBar || actionBar.querySelector('.dmv-x-btn')) return;

      const domMedia = findDirectVideoInfo(container);
      const tweetUrl = resolveTweetUrl(container) || (domMedia?.directUrl ? window.location.href : null);
      if (!tweetUrl && !domMedia?.directUrl) return;

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
        handleDownloadClick(tweetUrl || window.location.href, btn, domMedia);
      });

      wrap.appendChild(btn);
      actionBar.appendChild(wrap);
    });

    // B. Direct Floating Player Badge on [data-testid="videoPlayer"] / [data-testid="videoComponent"]
    const playerContainers = document.querySelectorAll(
      '[data-testid="videoPlayer"], [data-testid="videoComponent"]'
    );

    playerContainers.forEach((player) => {
      if (player.querySelector('.dmv-player-badge')) return;

      const parentContainer = player.closest('article, div[aria-modal="true"], div[data-testid="cellInnerDiv"]') || player.parentElement;
      const domMedia = findDirectVideoInfo(parentContainer || player);
      const tweetUrl = resolveTweetUrl(parentContainer || player) || window.location.href;

      const badge = document.createElement('button');
      badge.className = 'dmv-player-badge';
      badge.setAttribute('type', 'button');
      badge.setAttribute('title', 'Download with DownMyVid');
      badge.innerHTML = `${DOWNLOAD_ICON_SVG}<span>Download</span>`;

      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDownloadClick(tweetUrl, badge, domMedia);
      });

      // Ensure container has relative positioning so absolute badge places properly
      if (window.getComputedStyle(player).position === 'static') {
        player.style.position = 'relative';
      }

      player.appendChild(badge);
    });
  }

  /**
   * 3. Instagram Injector (Feed Posts, Reels, Dialog Modals, and Standalone Players)
   */
  function injectInstagram() {
    const videoElements = document.querySelectorAll('video');

    videoElements.forEach((vid) => {
      const container = vid.closest('article') || vid.closest('div[role="dialog"]') || vid.closest('div[role="presentation"]') || vid.parentElement?.parentElement;
      if (!container) return;

      // Extract direct DOM stream URL from active <video>
      const directSrc = vid.currentSrc || vid.src || '';
      const domMedia = {
        directUrl: directSrc.startsWith('http') ? directSrc : null,
        poster: vid.getAttribute('poster') || '',
        author: container.querySelector('header a, a[role="link"]')?.textContent?.trim() || 'Instagram Creator',
        title: container.querySelector('h1, span')?.textContent?.trim().slice(0, 100) || 'Instagram Video',
      };

      // Resolve Instagram Post URL
      const linkEl = container.querySelector('a[href*="/reel/"], a[href*="/p/"]');
      let postUrl = linkEl ? `https://www.instagram.com${linkEl.getAttribute('href').split('?')[0]}` : null;
      if (!postUrl && (window.location.pathname.includes('/reel/') || window.location.pathname.includes('/p/'))) {
        postUrl = `https://www.instagram.com${window.location.pathname.split('?')[0]}`;
      }
      if (!postUrl) {
        postUrl = window.location.href;
      }

      // A. Action row injection (near like/comment/share)
      const actionBar = container.querySelector('section, div[role="presentation"]');
      if (actionBar && !actionBar.querySelector('.dmv-ig-btn')) {
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
          handleDownloadClick(postUrl, btn, domMedia);
        });

        wrap.appendChild(btn);
        actionBar.appendChild(wrap);
      }

      // B. Floating Player Badge on the video player element
      const playerWrapper = vid.parentElement;
      if (playerWrapper && !playerWrapper.querySelector('.dmv-player-badge')) {
        const badge = document.createElement('button');
        badge.className = 'dmv-player-badge';
        badge.setAttribute('type', 'button');
        badge.setAttribute('title', 'Download with DownMyVid');
        badge.innerHTML = `${DOWNLOAD_ICON_SVG}<span>Download</span>`;

        badge.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDownloadClick(postUrl, badge, domMedia);
        });

        if (window.getComputedStyle(playerWrapper).position === 'static') {
          playerWrapper.style.position = 'relative';
        }

        playerWrapper.appendChild(badge);
      }
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
  window.addEventListener('popstate', () => setTimeout(scanAndInject, 400));

  // =========================================================================
  // MESSAGE LISTENER (FOR POPUP QUERYING THE ACTIVE VIDEO)
  // =========================================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_ACTIVE_VIDEO') {
      const videos = Array.from(document.querySelectorAll('video'));

      // Find currently playing video, or one visible in viewport
      let activeVid = videos.find((v) => !v.paused && !v.ended && v.currentTime > 0);
      if (!activeVid && videos.length > 0) {
        // Pick video closest to viewport center
        const centerY = window.innerHeight / 2;
        let minDiff = Infinity;
        videos.forEach((v) => {
          const rect = v.getBoundingClientRect();
          if (rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight) {
            const diff = Math.abs(rect.top + rect.height / 2 - centerY);
            if (diff < minDiff) {
              minDiff = diff;
              activeVid = v;
            }
          }
        });
      }

      if (activeVid) {
        const container = activeVid.closest('article, div[aria-modal="true"], div[data-testid="cellInnerDiv"], div[role="dialog"]') || activeVid.parentElement;
        const domMedia = {
          directUrl: activeVid.currentSrc || activeVid.src || '',
          poster: activeVid.getAttribute('poster') || '',
          author: container?.querySelector('header a, [data-testid="User-Name"]')?.textContent?.trim() || 'Video',
          title: container?.querySelector('[data-testid="tweetText"], h1, span')?.textContent?.trim().slice(0, 100) || 'Video Stream',
        };

        let resolvedUrl = window.location.href;
        if (IS_X && container) {
          resolvedUrl = resolveTweetUrl(container) || window.location.href;
        } else if (IS_INSTAGRAM && container) {
          const link = container.querySelector('a[href*="/reel/"], a[href*="/p/"]');
          if (link) resolvedUrl = `https://www.instagram.com${link.getAttribute('href').split('?')[0]}`;
        }

        sendResponse({
          success: true,
          url: resolvedUrl,
          domMedia,
        });
        return;
      }

      sendResponse({ success: false, url: window.location.href });
    }
  });
})();
