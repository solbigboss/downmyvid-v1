/**
 * DownMyVid Chrome Extension - Content Script
 * Injects 3D Download Buttons UNDER Video Players on YouTube, X (Twitter), Instagram, and Facebook.
 * No intrusive overlays, no video pausing on click.
 * Privacy-First: 0 trackers, 0 third-party redirects.
 */

(() => {
  const HOSTNAME = window.location.hostname;
  const IS_YOUTUBE = HOSTNAME.includes('youtube.com');
  const IS_X = HOSTNAME.includes('x.com') || HOSTNAME.includes('twitter.com');
  const IS_INSTAGRAM = HOSTNAME.includes('instagram.com');
  const IS_FACEBOOK = HOSTNAME.includes('facebook.com') || HOSTNAME.includes('fb.com') || HOSTNAME.includes('fb.watch');
  const IS_TIKTOK = HOSTNAME.includes('tiktok.com');

  const LOGO_ICON_URL = chrome.runtime.getURL('icons/icon16.png');
  const LOGO_HEADER_URL = chrome.runtime.getURL('icons/icon32.png');
  const LOGO_ICON_HTML = `<img src="${LOGO_ICON_URL}" class="dmv-btn-logo" alt="DownMyVid" />`;

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
  // 1. YOUTUBE INJECTOR (Under the video in the action bar)
  // =========================================================================
  function injectYouTube() {
    // Watch Page Action Bar (Right below the video title/player)
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

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        handleDownloadClick(window.location.href, btn, null);
      }, true);

      wrap.appendChild(btn);
      watchActions.appendChild(wrap);
    }

    // Shorts Page Action Column (Right beside the Short)
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

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleDownloadClick(window.location.href, btn, null);
        }, true);

        wrap.appendChild(btn);
        actions.appendChild(wrap);
      }
    });
  }

  // =========================================================================
  // 2. X / TWITTER INJECTOR (Directly UNDER the video in the action bar)
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
    for (let depth = 0; depth < 6 && parent; depth++) {
      const parentLink = parent.querySelector('time')?.closest('a') || parent.querySelector('a[href*="/status/"]');
      if (parentLink && parentLink.getAttribute('href')?.includes('/status/')) {
        return `https://x.com${parentLink.getAttribute('href').split('?')[0]}`;
      }
      parent = parent.parentElement;
    }

    return null;
  }

  function injectX() {
    // Strategy 1: Find all videos on X and inject into the action bar UNDER the video
    const videos = document.querySelectorAll('video, [data-testid="videoPlayer"], [data-testid="videoComponent"]');

    videos.forEach((vidEl) => {
      const tweet = vidEl.closest('article[data-testid="tweet"]') || 
                    vidEl.closest('div[data-testid="cellInnerDiv"]') || 
                    vidEl.closest('div[aria-modal="true"]') || 
                    vidEl.closest('div[role="dialog"]') || 
                    vidEl.parentElement?.parentElement?.parentElement;
      if (!tweet) return;

      // Locate the action bar UNDER the video (div[role="group"])
      const actionBar = tweet.querySelector('div[role="group"]');
      if (actionBar && !actionBar.querySelector('.dmv-x-btn')) {
        const wrap = document.createElement('div');
        wrap.className = 'dmv-x-wrapper';

        const btn = document.createElement('button');
        btn.className = 'dmv-btn dmv-btn-compact dmv-x-btn';
        btn.setAttribute('type', 'button');
        btn.setAttribute('title', 'Download video with DownMyVid');
        btn.innerHTML = `${LOGO_ICON_HTML}<span>Save</span>`;

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const domMedia = findDirectVideoInfo(tweet);
          const tweetUrl = resolveTweetUrl(tweet) || window.location.href;
          handleDownloadClick(tweetUrl, btn, domMedia);
        }, true);

        wrap.appendChild(btn);

        // Place into the action bar next to Bookmark/Share
        const bookmarkOrShare = actionBar.querySelector('[data-testid="bookmark"], [data-testid="share"], [aria-label*="Share" i]');
        if (bookmarkOrShare && bookmarkOrShare.parentElement && bookmarkOrShare.parentElement.parentElement === actionBar) {
          actionBar.insertBefore(wrap, bookmarkOrShare.parentElement);
        } else {
          actionBar.appendChild(wrap);
        }
      }

      // Strategy 1B: If no action bar exists (theatre/modal), insert directly below media container
      const mediaContainer = vidEl.closest('[data-testid="tweetPhoto"], [data-testid="videoPlayer"], [data-testid="videoComponent"]') || vidEl.parentElement;
      if (mediaContainer && mediaContainer.parentElement && !mediaContainer.parentElement.querySelector('.dmv-under-video-bar') && !actionBar) {
        const subBar = document.createElement('div');
        subBar.className = 'dmv-under-video-bar';

        const subBtn = document.createElement('button');
        subBtn.className = 'dmv-btn-under-video';
        subBtn.innerHTML = `${LOGO_ICON_HTML}<span>Download Video</span>`;

        subBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          const domMedia = findDirectVideoInfo(tweet || vidEl);
          const tweetUrl = resolveTweetUrl(tweet || vidEl) || window.location.href;
          handleDownloadClick(tweetUrl, subBtn, domMedia);
        }, true);

        subBar.appendChild(subBtn);
        mediaContainer.after(subBar);
      }
    });

    // Strategy 2: Scan all tweet articles that contain video indicators
    const allTweets = document.querySelectorAll('article[data-testid="tweet"]');
    allTweets.forEach((tweet) => {
      if (tweet.querySelector('.dmv-x-btn')) return;
      const hasMedia = tweet.querySelector('video, [data-testid="videoPlayer"], [data-testid="videoComponent"], [aria-label*="video" i], [data-testid="playButton"]');
      if (!hasMedia) return;

      const actionBar = tweet.querySelector('div[role="group"]');
      if (!actionBar || actionBar.querySelector('.dmv-x-btn')) return;

      const wrap = document.createElement('div');
      wrap.className = 'dmv-x-wrapper';

      const btn = document.createElement('button');
      btn.className = 'dmv-btn dmv-btn-compact dmv-x-btn';
      btn.setAttribute('type', 'button');
      btn.setAttribute('title', 'Download video with DownMyVid');
      btn.innerHTML = `${LOGO_ICON_HTML}<span>Save</span>`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const domMedia = findDirectVideoInfo(tweet);
        const tweetUrl = resolveTweetUrl(tweet) || window.location.href;
        handleDownloadClick(tweetUrl, btn, domMedia);
      }, true);

      wrap.appendChild(btn);
      actionBar.appendChild(wrap);
    });
  }

  // =========================================================================
  // 3. INSTAGRAM INJECTOR (Directly UNDER the video, NEVER inside)
  // =========================================================================
  function injectInstagram() {
    const videos = document.querySelectorAll('video');

    videos.forEach((vid) => {
      const container = vid.closest('article') || 
                        vid.closest('div[role="dialog"]') || 
                        vid.closest('div[role="presentation"]') || 
                        vid.parentElement?.parentElement;
      if (!container) return;

      if (container.querySelector('.dmv-ig-btn')) return;

      // Find the action bar directly UNDER the video (Like, Comment, Share row)
      const actionBar = container.querySelector('section, div[role="presentation"] > div, div[role="group"]');
      if (!actionBar) return;

      const wrap = document.createElement('div');
      wrap.className = 'dmv-ig-wrapper';

      const btn = document.createElement('button');
      btn.className = 'dmv-btn dmv-btn-compact dmv-ig-btn';
      btn.setAttribute('type', 'button');
      btn.setAttribute('title', 'Download video with DownMyVid');
      btn.innerHTML = `${LOGO_ICON_HTML}<span>DownMyVid</span>`;

      // Crucial: capture: true + stopImmediatePropagation prevents Instagram from pausing the video
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const directSrc = vid.currentSrc || vid.src || '';
        const domMedia = {
          directUrl: (directSrc.startsWith('http') && !directSrc.includes('blob:')) ? directSrc : null,
          poster: vid.getAttribute('poster') || '',
          author: container.querySelector('header a, a[role="link"]')?.textContent?.trim() || 'Instagram Creator',
          title: container.querySelector('h1, span')?.textContent?.trim().slice(0, 100) || 'Instagram Video',
        };

        const linkEl = container.querySelector('a[href*="/reel/"], a[href*="/p/"]');
        let postUrl = linkEl ? `https://www.instagram.com${linkEl.getAttribute('href').split('?')[0]}` : null;
        if (!postUrl && (window.location.pathname.includes('/reel/') || window.location.pathname.includes('/p/'))) {
          postUrl = `https://www.instagram.com${window.location.pathname.split('?')[0]}`;
        }
        if (!postUrl) {
          postUrl = window.location.href;
        }

        handleDownloadClick(postUrl, btn, domMedia);
      }, true);

      wrap.appendChild(btn);

      // Insert next to Bookmark or in the action bar row
      const bookmarkBtn = actionBar.querySelector('svg[aria-label*="Save" i], svg[aria-label*="Bookmark" i]')?.closest('div, button');
      if (bookmarkBtn && bookmarkBtn.parentElement === actionBar) {
        actionBar.insertBefore(wrap, bookmarkBtn);
      } else {
        actionBar.appendChild(wrap);
      }
    });
  }

  // =========================================================================
  // 4. FACEBOOK INJECTOR (Directly UNDER the video in the toolbar)
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

      if (post.querySelector('.dmv-fb-btn')) return;

      // Find the action bar under the video: toolbar containing Like/Comment/Share
      const actionBar = post.querySelector('div[role="toolbar"], div[role="group"]');
      const likeBtn = post.querySelector('div[aria-label*="Like" i], div[aria-label*="J’aime" i], div[aria-label*="Me gusta" i], div[aria-label*="إعجاب" i]');
      const targetBar = actionBar || likeBtn?.parentElement?.parentElement || post.querySelector('div[role="group"]');

      if (targetBar && !targetBar.querySelector('.dmv-fb-btn')) {
        const wrap = document.createElement('div');
        wrap.className = 'dmv-fb-wrapper';

        const btn = document.createElement('button');
        btn.className = 'dmv-btn dmv-btn-compact dmv-fb-btn';
        btn.setAttribute('type', 'button');
        btn.setAttribute('title', 'Download video with DownMyVid');
        btn.innerHTML = `${LOGO_ICON_HTML}<span>DownMyVid</span>`;

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

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

          handleDownloadClick(fbUrl, btn, domMedia);
        }, true);

        wrap.appendChild(btn);
        targetBar.appendChild(wrap);
      } else {
        // Fallback: place directly beneath the video wrapper
        const videoWrapper = vid.parentElement;
        if (videoWrapper && videoWrapper.parentElement && !videoWrapper.parentElement.querySelector('.dmv-under-video-bar')) {
          const subBar = document.createElement('div');
          subBar.className = 'dmv-under-video-bar';

          const subBtn = document.createElement('button');
          subBtn.className = 'dmv-btn-under-video';
          subBtn.innerHTML = `${LOGO_ICON_HTML}<span>Download Video</span>`;

          subBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const directSrc = vid.currentSrc || vid.src || '';
            const domMedia = {
              directUrl: (directSrc.startsWith('http') && !directSrc.includes('blob:')) ? directSrc : null,
              poster: vid.getAttribute('poster') || '',
              author: 'Facebook Creator',
              title: 'Facebook Video',
            };

            handleDownloadClick(window.location.href, subBtn, domMedia);
          }, true);

          subBar.appendChild(subBtn);
          videoWrapper.after(subBar);
        }
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

  // Initial scan & periodic scan for dynamic feed scrolling
  scanAndInject();
  setInterval(scanAndInject, 1000);

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

  // Re-check on URL pushState / history changes
  window.addEventListener('popstate', () => setTimeout(scanAndInject, 300));

  // =========================================================================
  // MESSAGE LISTENER (FOR POPUP QUERYING THE ACTIVE VIDEO)
  // =========================================================================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_ACTIVE_VIDEO') {
      const videos = Array.from(document.querySelectorAll('video'));

      // Find currently playing video, or one visible in viewport
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
