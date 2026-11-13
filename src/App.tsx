/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { HeroInput } from './components/HeroInput';
import { MediaResultCard } from './components/MediaResultCard';
import { HowItWorksSteps } from './components/HowItWorksSteps';
import { TechnicalSpecs } from './components/TechnicalSpecs';
import { FaqSection } from './components/FaqSection';
import { ToolsNetwork } from './components/ToolsNetwork';
import { RecentDownloads } from './components/RecentDownloads';
import { GuidesView } from './components/GuidesView';
import { PlatformDownloaderView } from './components/PlatformDownloaderView';
import { QrCodeModal } from './components/QrCodeModal';
import { Footer } from './components/Footer';
import { Language, ActiveTab, TweetMediaData, MediaFormat, DownloadHistoryItem, ThemeMode } from './types';
import { extractMedia } from './services/mediaExtractor';

export default function App() {
  const [currentLang, setCurrentLang] = useState<Language>(() => {
    const saved = localStorage.getItem('viralx_lang');
    if (saved === 'en' || saved === 'fr' || saved === 'es' || saved === 'ar') {
      return saved;
    }
    return 'en';
  });

  // Theme mode: 'system' | 'dark' | 'light'
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('viralx_theme_mode');
    if (saved === 'dark' || saved === 'light' || saved === 'system') {
      return saved;
    }
    const legacyDark = localStorage.getItem('viralx_dark_mode');
    if (legacyDark !== null) {
      return legacyDark === 'true' ? 'dark' : 'light';
    }
    return 'system';
  });

  // Track system preference in real time
  const [systemIsDark, setSystemIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setSystemIsDark(mediaQuery.matches);

    const handleSystemChange = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };

    mediaQuery.addEventListener('change', handleSystemChange);
    return () => mediaQuery.removeEventListener('change', handleSystemChange);
  }, []);

  // Compute resolved dark mode boolean based on selection and system preference
  const isDark = themeMode === 'system' ? systemIsDark : themeMode === 'dark';

  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [analyzedMedia, setAnalyzedMedia] = useState<TweetMediaData | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const requestCounterRef = useRef(0);
  const routeNonceRef = useRef(0);

  // QR Modal State
  const [qrModal, setQrModal] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: '',
  });

  // Recent Downloads Local State
  const [localHistory, setLocalHistory] = useState<DownloadHistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('viralx_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const history = localHistory;

  const [platformRoute, setPlatformRoute] = useState<{ url: string; nonce: number } | null>(null);

  const cancelInFlight = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    requestCounterRef.current += 1;
    setIsLoading(false);
  }, []);

  const resetExtractionState = useCallback(() => {
    cancelInFlight();
    setAnalyzedMedia(null);
    setExtractError(null);
    setPlatformRoute(null);
  }, [cancelInFlight]);

  const handlePlatformDetected = (platform: 'tiktok' | 'instagram' | 'facebook' | 'threads', detectedUrl: string) => {
    cancelInFlight();
    setAnalyzedMedia(null);
    setExtractError(null);
    const clean = detectedUrl.trim();
    setPlatformRoute(clean ? { url: clean, nonce: ++routeNonceRef.current } : null);
    setActiveTab(platform);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Sync Dark Mode class and data attributes on html document root element
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
      root.style.colorScheme = 'light';
    }
    localStorage.setItem('viralx_theme_mode', themeMode);
    localStorage.setItem('viralx_dark_mode', String(isDark));
  }, [isDark, themeMode]);

  // Sync RTL and language tag to html root element
  useEffect(() => {
    const root = document.documentElement;
    root.lang = currentLang;
    root.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
    localStorage.setItem('viralx_lang', currentLang);
  }, [currentLang]);

  // Sync history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('viralx_history', JSON.stringify(history));
    } catch {
      // Storage quota or disabled
    }
  }, [history]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Handle URL analysis with real extraction and race-condition protection
  const handleAnalyze = async (url: string) => {
    cancelInFlight();
    setAnalyzedMedia(null);
    setExtractError(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++requestCounterRef.current;

    setIsLoading(true);

    try {
      const result = await extractMedia(url, currentLang, controller.signal);
      if (controller.signal.aborted || requestId !== requestCounterRef.current) {
        return;
      }

      let preparedResult = result;
      if (activeTab === 'mp3' && result.formats.some((f) => f.type === 'audio')) {
        const audioFormats = result.formats
          .filter((f) => f.type === 'audio')
          .sort((a, b) => (a.format === 'MP3' ? -1 : b.format === 'MP3' ? 1 : 0))
          .map((f, idx) => ({ ...f, isPopular: idx === 0 }));
        const otherFormats = result.formats
          .filter((f) => f.type !== 'audio')
          .map((f) => ({ ...f, isPopular: false }));
        preparedResult = {
          ...result,
          formats: [...audioFormats, ...otherFormats],
        };
      }

      setAnalyzedMedia(preparedResult);
      setTimeout(() => {
        const previewElement = document.getElementById('media-preview-anchor');
        if (previewElement) {
          previewElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 50);
    } catch (err: any) {
      if (controller.signal.aborted || requestId !== requestCounterRef.current) {
        return;
      }
      setAnalyzedMedia(null);
      setExtractError(err?.message || 'Failed to extract video from this URL.');
    } finally {
      if (requestId === requestCounterRef.current) {
        setIsLoading(false);
      }
    }
  };

  // Handle saving a download event to user's history
  const handleSaveDownload = (media: TweetMediaData, format: MediaFormat) => {
    const newItem: DownloadHistoryItem = {
      id: `${media.id}_${format.id}_${Date.now()}`,
      title: media.tweetText.slice(0, 60) + (media.tweetText.length > 60 ? '...' : ''),
      authorHandle: media.author.handle,
      thumbnailUrl: media.thumbnailUrl,
      format: format.format,
      quality: format.quality,
      sizeMb: format.sizeMb,
      downloadedAt: Date.now(),
      originalUrl: media.originalUrl,
      mediaType: format.type === 'audio' ? 'audio' : 'video',
    };

    setLocalHistory((prev) => [newItem, ...prev.slice(0, 24)]);
  };

  const handleClearHistory = () => {
    setLocalHistory([]);
  };

  const handleSelectTool = (tab: ActiveTab) => {
    resetExtractionState();
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleOpenQr = (url: string, title: string) => {
    setQrModal({ isOpen: true, url, title });
  };

  const handleCloseQr = () => {
    setQrModal((prev) => ({ ...prev, isOpen: false }));
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#f7f9f9] dark:bg-[#000000] text-[#0f1419] dark:text-[#f7f9f9] selection:bg-[#1d9bf0] selection:text-white transition-colors duration-200">
      {/* Pinned Top Navigation Bar with System/Dark/Light Mode & Flag Icons */}
      <Navbar
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        activeTab={activeTab}
        onTabChange={(tab) => {
          resetExtractionState();
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        savedCount={history.length}
        themeMode={themeMode}
        isDark={isDark}
        onSelectThemeMode={setThemeMode}
      />

      {/* Main Content Area based on Active Tab */}
      <main className="flex-1">
        {activeTab === 'guides' ? (
          <GuidesView
            currentLang={currentLang}
            onBackToHome={() => {
              resetExtractionState();
              setActiveTab('home');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        ) : activeTab === 'history' ? (
          <RecentDownloads
            history={history}
            onClearHistory={handleClearHistory}
            onSelectUrl={(url) => {
              setPlatformRoute(null);
              setActiveTab('home');
              handleAnalyze(url);
            }}
            currentLang={currentLang}
          />
        ) : activeTab === 'instagram' || activeTab === 'tiktok' || activeTab === 'facebook' || activeTab === 'threads' ? (
          <PlatformDownloaderView
            platformSlug={activeTab}
            currentLang={currentLang}
            onOpenQr={handleOpenQr}
            onSaveDownload={handleSaveDownload}
            onSelectPlatform={(slug) => {
              resetExtractionState();
              setActiveTab(slug);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            initialRoute={platformRoute}
          />
        ) : (
          <>
            {/* Hero Input Area (Video Downloader or MP3 Mode) */}
            <HeroInput
              currentLang={currentLang}
              activeTab={activeTab}
              onAnalyze={handleAnalyze}
              isLoading={isLoading}
              extractError={extractError}
              onClearError={() => setExtractError(null)}
              onPlatformDetected={handlePlatformDetected}
            />

            {/* Extracted Media Result Card with Live Preview */}
            <div id="media-preview-anchor" className="w-full px-2 sm:px-4">
              {analyzedMedia && (
                <MediaResultCard
                  key={`${analyzedMedia.id}::${analyzedMedia.originalUrl}`}
                  media={analyzedMedia}
                  currentLang={currentLang}
                  onOpenQr={handleOpenQr}
                  onSaveDownload={handleSaveDownload}
                />
              )}
            </div>

            {/* Step-by-Step Educational Guides */}
            <HowItWorksSteps currentLang={currentLang} />

            {/* Technical Specifications Engine */}
            <TechnicalSpecs currentLang={currentLang} />

            {/* Specialized Tools Network Switcher */}
            <ToolsNetwork
              currentLang={currentLang}
              onSelectTool={handleSelectTool}
            />

            {/* Interactive FAQs with Search */}
            <FaqSection currentLang={currentLang} />
          </>
        )}
      </main>

      {/* Footer with Country Flags for Regional Languages */}
      <Footer
        currentLang={currentLang}
        onLanguageChange={setCurrentLang}
        onSelectTab={(tab) => {
          resetExtractionState();
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* QR Code Modal for Instant Smartphone Transfer */}
      <QrCodeModal
        isOpen={qrModal.isOpen}
        onClose={handleCloseQr}
        url={qrModal.url}
        title={qrModal.title}
        currentLang={currentLang}
      />
    </div>
  );
}
