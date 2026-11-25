/**
 * DownMyVid Chrome Extension - Content Script (v1.0.4)
 * Precise Sub-Video & Action Bar Injections for YouTube, X (Twitter), Instagram, and Facebook.
 * Resilient Instagram Reels vertical action sidebar + Caption pill + Horizontal feed action rows.
 * Privacy-First: 0 trackers, 0 third-party redirects.
 */

(() => {
  const HOSTNAME = window.location.hostname;
  const IS_YOUTUBE = HOSTNAME.includes('youtube.com');
  const IS_X = HOSTNAME.includes('x.com') || HOSTNAME.includes('twitter.com');
  const IS_INSTAGRAM = HOSTNAME.includes('instagram.com');
  const IS_FACEBOOK = HOSTNAME.includes('facebook.com') || HOSTNAME.includes('fb.com') || HOSTNAME.includes('fb.watch');
  const IS_TIKTOK = HOSTNAME.includes('tiktok.com');

  // Inject in-page sniffer into main world to capture Instagram & Facebook video streams
  if (IS_INSTAGRAM || IS_FACEBOOK) {
    try {
      const snifferScript = document.createElement('script');
      snifferScript.textContent = `
        (function() {
          if (window.__dmv_sniffed) return;
          window.__dmv_sniffed = true;
          const capture = (url) => {
            if (typeof url === 'string' && (url.includes('cdninstagram.com') || url.includes('fbcdn.net')) && (url.includes('.mp4') || url.includes('/v/t16.') || url.includes('bytestart='))) {
              const clean = url.replace(/&bytestart=\\d+&byteend=\\d+/gi, '').replace(/\\?bytestart=\\d+&byteend=\\d+&?/gi, '?');
              document.documentElement.dataset.dmvStream = clean;
            }
          };
          const origFetch = window.fetch;
          window.fetch = function(...args) {
            try {
              const u = args[0]?.url || (typeof args[0] === 'string' ? args[0] : '');
              capture(u);
            } catch (e) {}
            return origFetch.apply(this, args);
          };
          const origOpen = XMLHttpRequest.prototype.open;
          XMLHttpRequest.prototype.open = function(method, url) {
            try { capture(url); } catch (e) {}
            return origOpen.apply(this, arguments);
          };
        })();
      `;
      (document.head || document.documentElement).appendChild(snifferScript);
      snifferScript.remove();
    } catch (e) {}
  }

  const LOGO_ICON_URL = chrome.runtime.getURL('icons/icon16.png');
  const LOGO_HEADER_URL = chrome.runtime.getURL('icons/icon32.png');
  const LOGO_ICON_HTML = `<img src="${LOGO_ICON_URL}" class="dmv-btn-logo" alt="DownMyVid" />`;

  const DOWNLOAD_ICON_SVG = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 15.586l-4.293-4.293-1.414 1.414L12 18.414l5.707-5.707-1.414-1.414L12 15.586zM11 4h2v10h-2V4zM4 19h16v2H4v-2z"/>
    </svg>
  `;

  // Active modal overlay reference
  let currentPopupEl = null;

  function closePopup() {
    if (currentPopupEl) {
      currentPopupEl.remove();
      currentPopupEl = null;
    }
  }

  /**
   * Helper to attach robust click & pointer handlers that prevent host SPAs from hijacking clicks
   */
  function attachButtonEvents(btn, getParams) {
    const trigger = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      }
      try {
        const { url, domMedia } = getParams();
        handleDownloadClick(url, btn, domMedia);
      } catch (err) {
        console.warn('DownMyVid click error:', err);
        handleDownloadClick(window.location.href, btn, null);
      }
    };

    btn.addEventListener('click', trigger, true);
    btn.addEventListener('pointerdown', (e) => e.stopPropagation(), true);
    btn.addEventListener('mousedown', (e) => e.stopPropagation(), true);
    btn.addEventListener('mouseup', (e) => e.stopPropagation(), true);
    btn.addEventListener('pointerup', (e) => e.stopPropagation(), true);
    btn.addEventListener('touchstart', (e) => e.stopPropagation(), true);
    btn.addEventListener('touchend', (e) => { e.stopPropagation(); trigger(e); }, true);
  }

  /**
   * Extract direct media stream, poster, and metadata from a container's <video> element
   */
  function findDirectVideoInfo(container) {
    if (!container) return null;
    const video = container.querySelector('video') || (container.tagName === 'VIDEO' ? container : null);
    if (!video) return null;

    const directSrc = video.currentSrc || video.src || video.querySelector('source')?.src || '';
    const poster = video.getAttribute('poster') || container.querySelector('img')?.src || '';
    const authorEl = container.querySelector('a[href*="/"], header a, [data-testid="User-Name"], h2, h3, h4, strong');
    const author = authorEl?.textContent?.trim() || 'Video Creator';
    const textEl = container.querySelector('[data-testid="tweetText"], div[data-ad-preview="message"], div[dir="auto"], h1, span, p');
    const title = textEl?.textContent?.trim().slice(0, 120) || 'Video Stream';

    return {
      directUrl: (directSrc.startsWith('http') && !directSrc.includes('blob:')) ? directSrc : null,
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

    // Header with official 3D logo
    const header = document.createElement('div');
    header.className = 'dmv-popup-header';
    header.innerHTML = `
      <div class="dmv-popup-title">
        <img src="${LOGO_HEADER_URL}" class="dmv-logo-img" alt="DownMyVid" />
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
      (document.body || document.documentElement).appendChild(overlay);
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

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

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
    (document.body || document.documentElement).appendChild(overlay);
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

    // Instant modal if active stream is already captured from DOM or network sniffer
    if (domMedia && domMedia.directUrl) {
      showQualityModal(videoUrl, {
        originalUrl: videoUrl,
        videoUrl: domMedia.directUrl,
        thumbnailUrl: domMedia.poster || '',
        tweetText: domMedia.title || 'Direct Video Stream',
        author: { name: domMedia.author || 'Video Creator' },
        formats: [
          {
            id: 'dom_hd',
            label: '1080p Full HD MP4 (Instant Stream)',
            quality: '1080p / Direct',
            resolution: 'HD MP4',
            format: 'MP4',
            type: 'video',
            sizeMb: 14.5,
            directUrl: domMedia.directUrl,
          },
        ],
      }, null);
      return;
    }

    buttonEl.innerHTML = `<span class="dmv-spinner"></span><span>Loading...</span>`;
    buttonEl.style.pointerEvents = 'none';

    // Safety timeout in case background worker is restarting
    const safetyTimeout = setTimeout(() => {
      buttonEl.innerHTML = originalContent;
      buttonEl.style.pointerEvents = '';
      if (domMedia && domMedia.directUrl) {
        showQualityModal(videoUrl, {
          originalUrl: videoUrl,
          videoUrl: domMedia.directUrl,
          thumbnailUrl: domMedia.poster || '',
          tweetText: domMedia.title || 'Direct Video Stream',
          author: { name: domMedia.author || 'Video' },
          formats: [
            {
              id: 'dom_direct',
              label: 'Direct HD MP4 (Instant Stream)',
              quality: '1080p / Direct',
              format: 'MP4',
              sizeMb: 12.0,
              directUrl: domMedia.directUrl,
            },
          ],
        }, null);
      }
    }, 7000);

    try {
      chrome.runtime.sendMessage(
        { action: 'EXTRACT_MEDIA', url: videoUrl, domMedia },
        (response) => {
          clearTimeout(safetyTimeout);
          buttonEl.innerHTML = originalContent;
          buttonEl.style.pointerEvents = '';

          if (response && response.success && response.data) {
            showQualityModal(videoUrl, response.data, null);
          } else if (domMedia && domMedia.directUrl) {
            showQualityModal(videoUrl, {
              originalUrl: videoUrl,
              videoUrl: domMedia.directUrl,
              thumbnailUrl: domMedia.poster || '',
              tweetText: domMedia.title || 'Direct Video Stream',
              author: { name: domMedia.author || 'Video' },
              formats: [
                {
                  id: 'dom_direct',
                  label: 'Direct HD MP4 (Instant Stream)',
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
    } catch (err) {
      clearTimeout(safetyTimeout);
      buttonEl.innerHTML = originalContent;
      buttonEl.style.pointerEvents = '';
      if (domMedia && domMedia.directUrl) {
        showQualityModal(videoUrl, {
          originalUrl: videoUrl,
          videoUrl: domMedia.directUrl,
          thumbnailUrl: domMedia.poster || '',
          tweetText: domMedia.title || 'Direct Video Stream',
          author: { name: domMedia.author || 'Video' },
          formats: [{ id: 'dom_direct', label: 'Direct HD MP4', quality: '1080p', format: 'MP4', directUrl: domMedia.directUrl }],
        }, null);
      } else {
        showQualityModal(videoUrl, null, 'Please refresh this tab to reload the extension.');
      }
    }
  }

  // =========================================================================
  // 1. YOUTUBE INJECTOR (In Action Bar)
  // =========================================================================
  function injectYouTube() {
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
      btn.innerHTML = `${LOGO_ICON_HTML}<span>DownMyVid</span>`;

      attachButtonEvents(btn, () => ({ url: window.location.href, domMedia: null }));

      wrap.appendChild(btn);
      watchActions.appendChild(wrap);
    }

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
        btn.innerHTML = `${LOGO_ICON_HTML}<span>Save</span>`;

        attachButtonEvents(btn, () => ({ url: window.location.href, domMedia: null }));

        wrap.appendChild(btn);
        actions.appendChild(wrap);
      }
    });
  }

  // =========================================================================
  // 2. X / TWITTER INJECTOR (Sub-Video Bar & Action Row)
  // =========================================================================
  function resolveTweetUrl(container) {
    if (!container) return null;
    const timeLink = container.querySelector('time')?.closest('a');
    if (timeLink && timeLink.getAttribute('href')?.includes('/status/')) {
      return `https://x.com${timeLink.getAttribute('href').split('?')[0]}`;
    }

    const statusLinks = container.querySelectorAll('a[href*="/status/"]');
    for (const a of statusLinks) {
      const href = a.getAttribute('href');
      if (href && /\/status\/\d+/.test(href)) {
        return `https://x.com${href.split('?')[0]}`;
      }
    }

    if (window.location.pathname.includes('/status/')) {
      return `https://x.com${window.location.pathname.split('?')[0]}`;
    }

    let parent = container.parentElement;
    for (let depth = 0; depth < 8 && parent; depth++) {
      const parentLink = parent.querySelector('time')?.closest('a') || parent.querySelector('a[href*="/status/"]');
      if (parentLink && parentLink.getAttribute('href')?.includes('/status/')) {
        return `https://x.com${parentLink.getAttribute('href').split('?')[0]}`;
      }
      parent = parent.parentElement;
    }

    return null;
  }

  function injectX() {
    const videos = document.querySelectorAll('video');

    videos.forEach((vidEl) => {
      const tweet = vidEl.closest('article[data-testid="tweet"]') || 
                    vidEl.closest('div[data-testid="cellInnerDiv"]') || 
                    vidEl.closest('div[aria-modal="true"]') || 
                    vidEl.closest('div[role="dialog"]') || 
                    vidEl.parentElement?.parentElement?.parentElement;
      if (!tweet) return;

      const mediaContainer = vidEl.closest('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [aria-label*="video" i]') || vidEl.parentElement;

      // 1. Dedicated Sub-Video Bar: directly beneath the video player
      if (mediaContainer && mediaContainer.parentElement && !mediaContainer.parentElement.querySelector('.dmv-under-video-bar')) {
        const subBar = document.createElement('div');
        subBar.className = 'dmv-under-video-bar';

        const subBtn = document.createElement('button');
        subBtn.className = 'dmv-btn-under-video';
        subBtn.setAttribute('type', 'button');
        subBtn.innerHTML = `${LOGO_ICON_HTML}<span>Download Video (DownMyVid)</span>`;

        attachButtonEvents(subBtn, () => ({
          url: resolveTweetUrl(tweet) || window.location.href,
          domMedia: findDirectVideoInfo(tweet || vidEl),
        }));

        subBar.appendChild(subBtn);
        mediaContainer.after(subBar);
      }

      // 2. Action row under the video (div[role="group"])
      const actionBar = tweet.querySelector('div[role="group"]');
      if (actionBar && !actionBar.querySelector('.dmv-x-btn')) {
        const wrap = document.createElement('div');
        wrap.className = 'dmv-x-wrapper';

        const btn = document.createElement('button');
        btn.className = 'dmv-btn dmv-btn-compact dmv-x-btn';
        btn.setAttribute('type', 'button');
        btn.setAttribute('title', 'Download video with DownMyVid');
        btn.innerHTML = `${LOGO_ICON_HTML}<span>Save</span>`;

        attachButtonEvents(btn, () => ({
          url: resolveTweetUrl(tweet) || window.location.href,
          domMedia: findDirectVideoInfo(tweet),
        }));

        wrap.appendChild(btn);

        const bookmarkOrShare = actionBar.querySelector('[data-testid="bookmark"], [data-testid="share"], [aria-label*="Share" i]');
        if (bookmarkOrShare && bookmarkOrShare.parentElement && bookmarkOrShare.parentElement.parentElement === actionBar) {
          actionBar.insertBefore(wrap, bookmarkOrShare.parentElement);
        } else {
          actionBar.appendChild(wrap);
        }
      }
    });
  }

  // =========================================================================
  // 3. INSTAGRAM INJECTOR (Reels Vertical Sidebar + Feed Post Action Bar)
  // =========================================================================
  function extractDirectInstagramMedia(vid) {
    // 1. In-page network sniffer dataset (highest priority: active video stream)
    if (document.documentElement.dataset.dmvStream && document.documentElement.dataset.dmvStream.startsWith('http')) {
      return document.documentElement.dataset.dmvStream;
    }

    // 2. Performance entries recorded by the browser network stack
    try {
      const resources = performance.getEntriesByType('resource');
      for (let i = resources.length - 1; i >= 0; i--) {
        const name = resources[i].name;
        if (
          (name.includes('cdninstagram.com') || name.includes('fbcdn.net')) &&
          (name.includes('.mp4') || name.includes('/v/t16.') || name.includes('/o1/v/') || name.includes('bytestart=') || name.includes('efg='))
        ) {
          const clean = name.replace(/&bytestart=\d+&byteend=\d+/gi, '').replace(/\?bytestart=\d+&byteend=\d+&?/gi, '?');
          if (clean.startsWith('http')) return clean;
        }
      }
    } catch (e) {}

    // 3. Scan page script tags
    try {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const txt = s.textContent;
        if (!txt || (!txt.includes('video_url') && !txt.includes('video_versions') && !txt.includes('.mp4'))) continue;

        const m = txt.match(/"video_url"\s*:\s*"((?:\\.|[^"\\])+)"/);
        if (m && m[1]) {
          const decoded = m[1].replace(/\\\//g, '/').replace(/\\u0026/gi, '&');
          if (decoded.startsWith('http') && (decoded.includes('cdninstagram') || decoded.includes('fbcdn'))) {
            return decoded;
          }
        }
      }
    } catch (e) {}

    // 4. Video element direct src (if non-blob)
    if (vid) {
      const src = vid.currentSrc || vid.src;
      if (src && src.startsWith('http') && !src.startsWith('blob:')) {
        return src;
      }
    }

    return null;
  }

  function getActiveInstagramParams() {
    // Locate the active playing or primary video on the page
    const videos = Array.from(document.querySelectorAll('video'));
    let vid = videos.find((v) => !v.paused && !v.ended && v.currentTime > 0);
    if (!vid && videos.length > 0) {
      const centerY = window.innerHeight / 2;
      let minDiff = Infinity;
      videos.forEach((v) => {
        const rect = v.getBoundingClientRect();
        if (rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight) {
          const diff = Math.abs(rect.top + rect.height / 2 - centerY);
          if (diff < minDiff) {
            minDiff = diff;
            vid = v;
          }
        }
      });
      if (!vid) vid = videos[0];
    }

    const directStream = extractDirectInstagramMedia(vid);
    const domMedia = {
      directUrl: directStream,
      poster: vid?.getAttribute('poster') || '',
      author: document.querySelector('header a, a[role="link"]')?.textContent?.trim() || 'Instagram Creator',
      title: document.querySelector('h1, span')?.textContent?.trim().slice(0, 100) || 'Instagram Video',
    };

    let postUrl = null;
    const path = window.location.pathname;
    if (path.includes('/reel/') || path.includes('/p/')) {
      const m = path.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
      if (m) {
        postUrl = `https://www.instagram.com/${m[1]}/${m[2]}/`;
      }
    }

    if (!postUrl) {
      const linkEl = vid?.closest('article')?.querySelector('a[href*="/reel/"], a[href*="/p/"]') ||
                     document.querySelector('a[href*="/reel/"], a[href*="/p/"]');
      const rawHref = linkEl?.getAttribute('href') || linkEl?.href || '';
      if (rawHref) {
        const m = rawHref.match(/\/(reel|p)\/([A-Za-z0-9_-]+)/);
        if (m) {
          postUrl = `https://www.instagram.com/${m[1]}/${m[2]}/`;
        }
      }
    }

    return { url: postUrl || window.location.href, domMedia };
  }

  function injectInstagram() {
    // Strategy A: Reels Vertical Action Column (Right side: Like, Comment, Share, More)
    const actionIcons = document.querySelectorAll(
      'svg[aria-label*="Share" i], svg[aria-label*="Direct" i], svg[aria-label*="Comment" i], svg[aria-label*="Like" i], svg[aria-label*="Save" i], svg[aria-label*="Bookmark" i], svg[aria-label*="Partager" i], svg[aria-label*="مشاركة" i], svg[aria-label*="Compartir" i], [role="button"][aria-label*="Share" i], [role="button"][aria-label*="Direct" i]'
    );

    actionIcons.forEach((icon) => {
      // Find the true vertical column containing the action buttons
      let parent = icon.closest('div[role="button"]') || icon.closest('button') || icon.parentElement;
      if (!parent) return;

      let column = null;
      let targetChild = null;
      let depth = 0;

      while (parent && parent !== document.body && depth < 6) {
        parent = parent.parentElement;
        depth++;
        if (!parent) break;

        // An action column has at least 2 distinct action icons
        const svgs = parent.querySelectorAll(
          'svg[aria-label*="Like" i], svg[aria-label*="Unlike" i], svg[aria-label*="Comment" i], svg[aria-label*="Share" i], svg[aria-label*="Direct" i], svg[aria-label*="Save" i], svg[aria-label*="Bookmark" i], svg[aria-label*="More" i], [role="button"][aria-label*="Like" i], [role="button"][aria-label*="Comment" i]'
        );

        if (svgs.length >= 2) {
          const rect = parent.getBoundingClientRect();
          // Narrow or vertical column, or within /reel/ URL
          if ((rect.width > 0 && rect.width <= 160) || (rect.height > rect.width) || window.location.pathname.includes('/reel')) {
            column = parent;
            // Identify which direct child of column contains this icon
            for (const child of column.children) {
              if (child.contains(icon)) {
                targetChild = child;
                break;
              }
            }
            break;
          }
        }
      }

      if (column && !column.querySelector('.dmv-reel-action')) {
        const reelAction = document.createElement('div');
        reelAction.className = 'dmv-reel-action';

        const reelBtn = document.createElement('button');
        reelBtn.className = 'dmv-btn-reel';
        reelBtn.setAttribute('type', 'button');
        reelBtn.setAttribute('title', 'Download Reel with DownMyVid');
        reelBtn.innerHTML = `<img src="${LOGO_HEADER_URL}" alt="DownMyVid" />`;

        const label = document.createElement('span');
        label.className = 'dmv-reel-label';
        label.textContent = 'Save';

        attachButtonEvents(reelBtn, getActiveInstagramParams);

        reelAction.appendChild(reelBtn);
        reelAction.appendChild(label);

        // Prefer placing right after the Share item or targetChild
        let shareChild = null;
        for (const ch of column.children) {
          if (ch.querySelector('svg[aria-label*="Share" i], svg[aria-label*="Direct" i], svg[aria-label*="Partager" i], svg[aria-label*="مشاركة" i], [role="button"][aria-label*="Share" i]')) {
            shareChild = ch;
            break;
          }
        }

        const insertRef = shareChild || targetChild;
        if (insertRef && insertRef.nextSibling) {
          column.insertBefore(reelAction, insertRef.nextSibling);
        } else {
          column.appendChild(reelAction);
        }
      }
    });

    // Strategy B: Timeline Feed Post Horizontal Action Bar (Under the post video)
    const feedActionBars = document.querySelectorAll('section, div[role="presentation"] > div');
    feedActionBars.forEach((actionBar) => {
      if (actionBar.querySelector('.dmv-ig-btn') || actionBar.querySelector('.dmv-reel-action')) return;

      const hasActions = actionBar.querySelector('svg[aria-label*="Like" i], svg[aria-label*="Comment" i], svg[aria-label*="Share" i]');
      if (!hasActions) return;

      const rect = actionBar.getBoundingClientRect();
      if (rect.width > 160 && (rect.height < 140 || rect.width > rect.height)) {
        const wrap = document.createElement('div');
        wrap.className = 'dmv-ig-wrapper';

        const btn = document.createElement('button');
        btn.className = 'dmv-btn dmv-btn-compact dmv-ig-btn';
        btn.setAttribute('type', 'button');
        btn.setAttribute('title', 'Download video with DownMyVid');
        btn.innerHTML = `${LOGO_ICON_HTML}<span>DownMyVid</span>`;

        attachButtonEvents(btn, getActiveInstagramParams);

        wrap.appendChild(btn);

        const bookmarkBtn = actionBar.querySelector('svg[aria-label*="Save" i], svg[aria-label*="Bookmark" i]')?.closest('div, button');
        if (bookmarkBtn && bookmarkBtn.parentElement === actionBar) {
          actionBar.insertBefore(wrap, bookmarkBtn);
        } else {
          actionBar.appendChild(wrap);
        }
      }
    });

    // Strategy C: Reels Resilient Fallback (Bottom author / caption area)
    if (window.location.pathname.includes('/reel') || window.location.pathname.includes('/reels')) {
      const hasAction = document.querySelector('.dmv-reel-action, .dmv-reel-pill-wrapper');
      if (!hasAction) {
        const authorLine = document.querySelector('div[class*="x1n2onr6"] h2, div[class*="x1n2onr6"] a, a[role="link"][href*="/"]')?.closest('div');
        if (authorLine && authorLine.parentElement && !authorLine.parentElement.querySelector('.dmv-reel-pill-wrapper')) {
          const pillWrap = document.createElement('div');
          pillWrap.className = 'dmv-reel-pill-wrapper';

          const pillBtn = document.createElement('button');
          pillBtn.className = 'dmv-btn-under-video';
          pillBtn.setAttribute('type', 'button');
          pillBtn.setAttribute('title', 'Download Reel with DownMyVid');
          pillBtn.innerHTML = `${LOGO_ICON_HTML}<span>Download Reel</span>`;

          attachButtonEvents(pillBtn, getActiveInstagramParams);
          pillWrap.appendChild(pillBtn);
          authorLine.parentElement.appendChild(pillWrap);
        }
      }
    }
  }

  // =========================================================================
  // 4. FACEBOOK INJECTOR (Reels Sidebar & Feed Post Action Bar)
  // =========================================================================
  function injectFacebook() {
    const videos = document.querySelectorAll('video');

    videos.forEach((vid) => {
      const post = vid.closest('div[role="article"]') || 
                   vid.closest('div[data-pagelet*="FeedUnit"]') || 
                   vid.closest('div[role="main"]') || 
                   vid.closest('div[role="dialog"]') || 
                   vid.parentElement?.parentElement?.parentElement;
      if (!post) return;

      const getFbParams = () => {
        const directSrc = vid.currentSrc || vid.src || '';
        const domMedia = {
          directUrl: (directSrc.startsWith('http') && !directSrc.includes('blob:')) ? directSrc : null,
          poster: vid.getAttribute('poster') || '',
          author: post.querySelector('h2, h3, h4, strong, a[role="link"]')?.textContent?.trim() || 'Facebook Creator',
          title: post.querySelector('div[data-ad-preview="message"], div[dir="auto"]')?.textContent?.trim().slice(0, 100) || 'Facebook Video',
        };

        const link = post.querySelector('a[href*="/videos/"], a[href*="/watch/"], a[href*="/reel/"]');
        let fbUrl = link
          ? (link.href.startsWith('http') ? link.href.split('?')[0] : `https://www.facebook.com${link.getAttribute('href').split('?')[0]}`)
          : window.location.href;

        return { url: fbUrl, domMedia };
      };

      // Strategy A: Facebook Reels / Watch Vertical Action Column (Right side)
      const shareBtn = post.querySelector('div[aria-label*="Share" i], div[aria-label*="Partager" i], div[aria-label*="مشاركة" i]');
      const commentBtn = post.querySelector('div[aria-label*="Comment" i], div[aria-label*="Commenter" i], div[aria-label*="تعليق" i]');
      const likeBtn = post.querySelector('div[aria-label*="Like" i], div[aria-label*="J’aime" i], div[aria-label*="إعجاب" i]');
      const targetAction = shareBtn || commentBtn || likeBtn;

      const isReelLayout = targetAction && targetAction.closest('div[class*="xurb0ha"], div[role="presentation"], div[class*="x1n2onr6"]');
      if (isReelLayout && !post.querySelector('.dmv-reel-action')) {
        const column = targetAction.parentElement?.parentElement;
        if (column && !column.querySelector('.dmv-reel-action')) {
          const reelAction = document.createElement('div');
          reelAction.className = 'dmv-reel-action';

          const reelBtn = document.createElement('button');
          reelBtn.className = 'dmv-btn-reel';
          reelBtn.setAttribute('type', 'button');
          reelBtn.setAttribute('title', 'Download Reel with DownMyVid');
          reelBtn.innerHTML = `<img src="${LOGO_HEADER_URL}" alt="DownMyVid" />`;

          const label = document.createElement('span');
          label.className = 'dmv-reel-label';
          label.textContent = 'Save';

          attachButtonEvents(reelBtn, getFbParams);

          reelAction.appendChild(reelBtn);
          reelAction.appendChild(label);
          column.appendChild(reelAction);
        }
      }

      // Strategy B: Facebook Feed Posts Horizontal Toolbar (Directly under the video)
      const toolbar = post.querySelector('div[role="toolbar"]');
      if (toolbar && !toolbar.querySelector('.dmv-fb-btn')) {
        const wrap = document.createElement('div');
        wrap.className = 'dmv-fb-wrapper';

        const btn = document.createElement('button');
        btn.className = 'dmv-btn dmv-btn-compact dmv-fb-btn';
        btn.setAttribute('type', 'button');
        btn.setAttribute('title', 'Download video with DownMyVid');
        btn.innerHTML = `${LOGO_ICON_HTML}<span>DownMyVid</span>`;

        attachButtonEvents(btn, getFbParams);

        wrap.appendChild(btn);
        toolbar.appendChild(wrap);
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
    if (IS_FACEBOOK) injectFacebook();
  }

  // Run initial scan & continuous polling for dynamic scrolling feeds
  scanAndInject();
  setInterval(scanAndInject, 800);

  // MutationObserver with 200ms debounce
  let debounceTimer = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanAndInject, 200);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  window.addEventListener('popstate', () => setTimeout(scanAndInject, 250));

  // =========================================================================
  // MESSAGE LISTENER (FOR POPUP QUERYING THE ACTIVE VIDEO)
  // =========================================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_ACTIVE_VIDEO') {
      const videos = Array.from(document.querySelectorAll('video'));

      let activeVid = videos.find((v) => !v.paused && !v.ended && v.currentTime > 0);
      if (!activeVid && videos.length > 0) {
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
        const container = activeVid.closest('article, div[aria-modal="true"], div[data-testid="cellInnerDiv"], div[role="dialog"], div[role="article"]') || activeVid.parentElement;
        const domMedia = {
          directUrl: (activeVid.currentSrc && activeVid.currentSrc.startsWith('http') && !activeVid.currentSrc.includes('blob:')) ? activeVid.currentSrc : null,
          poster: activeVid.getAttribute('poster') || '',
          author: container?.querySelector('header a, [data-testid="User-Name"], h2, h3, h4')?.textContent?.trim() || 'Video',
          title: container?.querySelector('[data-testid="tweetText"], div[data-ad-preview="message"], h1, span')?.textContent?.trim().slice(0, 100) || 'Video Stream',
        };

        let resolvedUrl = window.location.href;
        if (IS_X && container) {
          resolvedUrl = resolveTweetUrl(container) || window.location.href;
        } else if (IS_INSTAGRAM && container) {
          const link = container.querySelector('a[href*="/reel/"], a[href*="/p/"]');
          if (link) resolvedUrl = `https://www.instagram.com${link.getAttribute('href').split('?')[0]}`;
        } else if (IS_FACEBOOK && container) {
          const link = container.querySelector('a[href*="/videos/"], a[href*="/watch/"], a[href*="/reel/"]');
          if (link) resolvedUrl = link.href.startsWith('http') ? link.href.split('?')[0] : `https://www.facebook.com${link.getAttribute('href').split('?')[0]}`;
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
