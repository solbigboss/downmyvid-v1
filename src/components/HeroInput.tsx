import React, { useState, useEffect, useRef } from 'react';
import {
  Clipboard,
  Download,
  X,
  Sparkles,
  AlertCircle,
  Film,
  Radio,
  Mic,
  ArrowRight,
  Globe,
} from 'lucide-react';
import { Language, ActiveTab, XDownloadCategory } from '../types';
import { translations } from '../data/translations';
import { SAMPLE_URLS } from '../data/sampleTweets';
import { detectPlatformFromUrl, normalizeUrlInput } from '../services/mediaExtractor';

interface HeroInputProps {
  currentLang: Language;
  activeTab: ActiveTab;
  onAnalyze: (url: string) => void;
  isLoading: boolean;
  extractError?: string | null;
  onClearError?: () => void;
  onPlatformDetected?: (platform: 'tiktok' | 'instagram' | 'facebook' | 'threads' | 'youtube', url: string) => void;
}

export const HeroInput: React.FC<HeroInputProps> = ({
  currentLang,
  activeTab,
  onAnalyze,
  isLoading,
  extractError,
  onClearError,
  onPlatformDetected,
}) => {
  const [url, setUrl] = useState('');
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [redirectNotice, setRedirectNotice] = useState<string | null>(null);
  const [pasteSuccess, setPasteSuccess] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState<'all' | 'x' | 'tiktok' | 'instagram' | 'facebook' | 'threads' | 'youtube'>('all');
  const [xCategory, setXCategory] = useState<XDownloadCategory>('video');

  const redirectTimerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = translations[currentLang];

  const clearPendingRedirect = () => {
    if (redirectTimerRef.current !== null) {
      window.clearTimeout(redirectTimerRef.current);
      redirectTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearPendingRedirect();
  }, []);

  useEffect(() => {
    if (errorNotice) {
      const timer = window.setTimeout(() => setErrorNotice(null), 4000);
      return () => window.clearTimeout(timer);
    }
  }, [errorNotice]);

  useEffect(() => {
    if (redirectNotice) {
      const timer = window.setTimeout(() => setRedirectNotice(null), 3000);
      return () => window.clearTimeout(timer);
    }
  }, [redirectNotice]);

  // Synchronize category if user is in mp3 tab
  useEffect(() => {
    if (activeTab === 'mp3') {
      setSelectedPlatform('x');
      setXCategory('spaces');
    }
  }, [activeTab]);

  // Check URL platform and trigger seamless in-app redirection cleanly
  const checkAndRouteUrl = (rawUrl: string, immediate = false): boolean => {
    clearPendingRedirect();
    const normalized = normalizeUrlInput(rawUrl);
    const platform = detectPlatformFromUrl(normalized);

    // If user is currently in MP3 mode, stay in MP3 mode and extract direct MP3 audio
    if (activeTab === 'mp3') {
      return false;
    }

    if (platform && platform !== 'x') {
      const labels: Record<'tiktok' | 'instagram' | 'facebook' | 'threads' | 'youtube', string> = {
        tiktok: '⚡ TikTok detected! Switching to TikTok Downloader...',
        instagram: '⚡ Instagram detected! Switching to Instagram Downloader...',
        facebook: '⚡ Facebook detected! Switching to Facebook Downloader...',
        threads: '⚡ Threads detected! Switching to Threads Downloader...',
        youtube: '⚡ YouTube detected! Switching to YouTube Downloader...',
      };
      setRedirectNotice(labels[platform]);
      if (immediate) {
        onPlatformDetected?.(platform, normalized);
      } else {
        redirectTimerRef.current = window.setTimeout(() => {
          redirectTimerRef.current = null;
          onPlatformDetected?.(platform, normalized);
        }, 350);
      }
      return true;
    }

    const lower = normalized.toLowerCase();
    if (lower.includes('spaces')) {
      setSelectedPlatform('x');
      setXCategory('spaces');
    } else if (lower.includes('broadcast') || lower.includes('stream') || lower.includes('/live/') || lower.includes('/i/events/')) {
      setSelectedPlatform('x');
      setXCategory('stream');
    } else if (platform === 'x') {
      setSelectedPlatform('x');
    }

    return false;
  };

  const handlePaste = async () => {
    setErrorNotice(null);
    onClearError?.();
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          const clean = normalizeUrlInput(text);
          setUrl(clean);
          setPasteSuccess(true);
          window.setTimeout(() => setPasteSuccess(false), 2000);
          if (navigator.vibrate) navigator.vibrate(20);

          const redirected = checkAndRouteUrl(clean, false);
          if (redirected) return;

          if (detectPlatformFromUrl(clean) === 'x') {
            onAnalyze(clean);
          }
          return;
        }
      }
      setErrorNotice('Clipboard is empty or access was not granted. Please paste manually.');
    } catch {
      setErrorNotice('Please paste link manually into the box.');
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    clearPendingRedirect();
    setErrorNotice(null);
    onClearError?.();

    const trimmed = url.trim();
    if (!trimmed) {
      setErrorNotice(
        currentLang === 'ar'
          ? 'يرجى لصق أو كتابة رابط فيديو صالح.'
          : 'Please paste or type a valid video or media link.'
      );
      return;
    }

    const redirected = checkAndRouteUrl(trimmed, true);
    if (redirected) return;

    onAnalyze(normalizeUrlInput(trimmed));
  };

  const handleSampleXClick = () => {
    clearPendingRedirect();
    setErrorNotice(null);
    onClearError?.();
    setUrl(SAMPLE_URLS.spacex);
    setSelectedPlatform('x');
    setXCategory('video');
    onAnalyze(SAMPLE_URLS.spacex);
  };

  const isMp3Mode = activeTab === 'mp3';
  const displayedError = extractError || errorNotice;

  // Dynamic placeholder based on platform and category
  const getDynamicPlaceholder = () => {
    if (isMp3Mode) return t.inputPlaceholderMp3;
    if (selectedPlatform === 'x') {
      switch (xCategory) {
        case 'spaces':
          return t.placeholderSpaces;
        case 'stream':
          return t.placeholderStream;
        case 'video':
        default:
          return t.placeholderVideo;
      }
    }
    if (currentLang === 'ar') {
      return 'الصق أي رابط (تيك توك، إنستغرام، إكس/تويتر، فيسبوك، ثريدز)...';
    } else if (currentLang === 'fr') {
      return 'Collez n’importe quel lien (TikTok, Instagram, X, Facebook, Threads)...';
    } else if (currentLang === 'es') {
      return 'Pega cualquier enlace (TikTok, Instagram, X, Facebook, Threads)...';
    }
    return 'Paste any link (TikTok, Instagram, X/Twitter, Facebook, Threads)...';
  };

  return (
    <section className="bg-white dark:bg-[#15202b] border-b border-[#cfd9de] dark:border-[#2f3336] py-7 sm:py-10 md:py-16 px-3 sm:px-4 transition-colors">
      <div className="max-w-4xl mx-auto text-center">
        {/* Dynamic Badge with Supported Platforms */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide mb-4 bg-[#e8f5fe] dark:bg-[#1d9bf0]/15 text-[#1d9bf0] border border-[#1d9bf0]/25 shadow-2xs">
          <Sparkles className="w-3.5 h-3.5 text-[#1d9bf0]" />
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0f1419] dark:text-[#f7f9f9]">
            <span className="w-1.5 h-1.5 rounded-full bg-black dark:bg-white inline-block" />
            <span>X</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#00F2FE] inline-block" />
            <span>TikTok</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#E1306C] inline-block" />
            <span>Instagram</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#1877F2] inline-block" />
            <span>Facebook</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7] inline-block" />
            <span>Threads</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#FF0000] inline-block" />
            <span>YouTube</span>
          </div>
        </div>

        {/* Hero Title: All-In-One Social Media Downloader */}
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-[#0f1419] dark:text-white tracking-tight leading-tight mb-3 max-w-3xl mx-auto">
          {isMp3Mode ? t.heroTitleMp3 : t.heroTitle}
        </h1>

        {/* Short, punchy description */}
        <p className="text-[#536471] dark:text-[#8b98a5] text-sm sm:text-base md:text-lg max-w-2xl mx-auto mb-6 leading-relaxed font-medium">
          {isMp3Mode ? t.heroSubtitleMp3 : t.heroSubtitle}
        </p>

        {/* Platform Quick Filter Pills - Pin-UI Inspired 3D Neon Logo-Only Buttons */}
        {!isMp3Mode && (
          <div className="flex items-center justify-center gap-2.5 sm:gap-3.5 mb-6 max-w-xl mx-auto px-2 flex-wrap sm:flex-nowrap">
            {/* 1. All In One */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => setSelectedPlatform('all')}
                aria-label="All In One"
                className={`w-12 h-12 sm:w-13 sm:h-13 rounded-2xl flex items-center justify-center transition-all duration-300 transform-gpu hover:-translate-y-1.5 hover:scale-105 active:translate-y-0.5 active:border-b active:scale-95 cursor-pointer border-b-[3px] border-b-black/20 dark:border-b-black/50 shadow-[0_4px_10px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.12)] ${
                  selectedPlatform === 'all'
                    ? 'bg-[#1d9bf0]/15 dark:bg-[#1d9bf0]/20 border-2 border-[#1d9bf0] border-b-[#1d9bf0] text-[#1d9bf0] shadow-[0_0_22px_rgba(29,155,240,0.7),inset_0_0_12px_rgba(29,155,240,0.3)] -translate-y-0.5'
                    : 'bg-white/90 dark:bg-[#151a21] border border-[#cfd9de]/80 dark:border-[#2f3336] text-[#536471] dark:text-[#8b98a5] hover:border-[#1d9bf0] hover:border-b-[#1d9bf0] hover:text-[#1d9bf0] hover:shadow-[0_0_24px_rgba(29,155,240,0.85),0_12px_25px_-5px_rgba(29,155,240,0.5),inset_0_0_12px_rgba(29,155,240,0.25)]'
                }`}
              >
                <Globe className="w-5.5 h-5.5 sm:w-6 sm:h-6 transition-all group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(29,155,240,0.9)]" />
              </button>
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-[#0f1419] dark:bg-[#1e2732] text-white text-[11px] font-bold tracking-wide pointer-events-none opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 shadow-xl border border-white/10 whitespace-nowrap z-30">
                All In One
                <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-[#0f1419] dark:border-t-[#1e2732]"></div>
              </div>
            </div>

            {/* 2. Twitter / X */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => setSelectedPlatform('x')}
                aria-label="Twitter / X"
                className={`w-12 h-12 sm:w-13 sm:h-13 rounded-2xl flex items-center justify-center transition-all duration-300 transform-gpu hover:-translate-y-1.5 hover:scale-105 active:translate-y-0.5 active:border-b active:scale-95 cursor-pointer border-b-[3px] border-b-black/20 dark:border-b-black/50 shadow-[0_4px_10px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.12)] ${
                  selectedPlatform === 'x'
                    ? 'bg-[#1d9bf0]/15 dark:bg-white/10 border-2 border-[#1d9bf0] dark:border-white border-b-[#1d9bf0] dark:border-b-white text-[#1d9bf0] dark:text-white shadow-[0_0_22px_rgba(29,155,240,0.7),inset_0_0_12px_rgba(29,155,240,0.3)] -translate-y-0.5'
                    : 'bg-white/90 dark:bg-[#151a21] border border-[#cfd9de]/80 dark:border-[#2f3336] text-[#536471] dark:text-[#8b98a5] hover:border-black dark:hover:border-white hover:border-b-black dark:hover:border-b-white hover:text-black dark:hover:text-white hover:shadow-[0_0_24px_rgba(255,255,255,0.85),0_12px_25px_-5px_rgba(255,255,255,0.45),inset_0_0_12px_rgba(255,255,255,0.25)]'
                }`}
              >
                <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5 fill-current transition-all group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(255,255,255,0.95)]" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 24.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
              </button>
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-[#0f1419] dark:bg-[#1e2732] text-white text-[11px] font-bold tracking-wide pointer-events-none opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 shadow-xl border border-white/10 whitespace-nowrap z-30">
                Twitter / X
                <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-[#0f1419] dark:border-t-[#1e2732]"></div>
              </div>
            </div>

            {/* 3. TikTok */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => onPlatformDetected?.('tiktok', '')}
                aria-label="TikTok"
                className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white/90 dark:bg-[#151a21] border border-[#cfd9de]/80 dark:border-[#2f3336] border-b-[3px] border-b-black/20 dark:border-b-black/50 flex items-center justify-center text-[#536471] dark:text-[#8b98a5] transition-all duration-300 transform-gpu hover:-translate-y-1.5 hover:scale-105 active:translate-y-0.5 active:border-b active:scale-95 shadow-[0_4px_10px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.12)] hover:border-[#00F2FE] hover:border-b-[#00F2FE] hover:text-[#00F2FE] hover:shadow-[0_0_24px_rgba(0,242,254,0.9),-3px_3px_20px_rgba(254,44,85,0.7),0_12px_25px_-5px_rgba(0,242,254,0.45),inset_0_0_12px_rgba(0,242,254,0.25)] cursor-pointer"
              >
                <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5 fill-current transition-all group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(0,242,254,0.95)]" viewBox="0 0 24 24">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 3 15.69a6.34 6.34 0 0 0 10.86 4.43V8.72a8.16 8.16 0 0 0 4.77 1.52v-3.48a4.85 4.85 0 0 1-1-.07z"/>
                </svg>
              </button>
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-[#0f1419] dark:bg-[#1e2732] text-white text-[11px] font-bold tracking-wide pointer-events-none opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 shadow-xl border border-white/10 whitespace-nowrap z-30">
                TikTok
                <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-[#0f1419] dark:border-t-[#1e2732]"></div>
              </div>
            </div>

            {/* 4. Instagram */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => onPlatformDetected?.('instagram', '')}
                aria-label="Instagram"
                className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white/90 dark:bg-[#151a21] border border-[#cfd9de]/80 dark:border-[#2f3336] border-b-[3px] border-b-black/20 dark:border-b-black/50 flex items-center justify-center text-[#536471] dark:text-[#8b98a5] transition-all duration-300 transform-gpu hover:-translate-y-1.5 hover:scale-105 active:translate-y-0.5 active:border-b active:scale-95 shadow-[0_4px_10px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.12)] hover:border-[#E1306C] hover:border-b-[#E1306C] hover:text-[#E1306C] hover:shadow-[0_0_26px_rgba(225,48,108,0.9),0_0_15px_rgba(253,89,73,0.6),0_12px_25px_-5px_rgba(225,48,108,0.45),inset_0_0_12px_rgba(225,48,108,0.25)] cursor-pointer"
              >
                <svg className="w-5.5 h-5.5 sm:w-6 sm:h-6 transition-all group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(225,48,108,0.95)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                </svg>
              </button>
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-[#0f1419] dark:bg-[#1e2732] text-white text-[11px] font-bold tracking-wide pointer-events-none opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 shadow-xl border border-white/10 whitespace-nowrap z-30">
                Instagram
                <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-[#0f1419] dark:border-t-[#1e2732]"></div>
              </div>
            </div>

            {/* 5. Facebook */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => onPlatformDetected?.('facebook', '')}
                aria-label="Facebook"
                className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white/90 dark:bg-[#151a21] border border-[#cfd9de]/80 dark:border-[#2f3336] border-b-[3px] border-b-black/20 dark:border-b-black/50 flex items-center justify-center text-[#536471] dark:text-[#8b98a5] transition-all duration-300 transform-gpu hover:-translate-y-1.5 hover:scale-105 active:translate-y-0.5 active:border-b active:scale-95 shadow-[0_4px_10px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.12)] hover:border-[#1877F2] hover:border-b-[#1877F2] hover:text-[#1877F2] hover:shadow-[0_0_24px_rgba(24,119,242,0.95),0_12px_25px_-5px_rgba(24,119,242,0.5),inset_0_0_12px_rgba(24,119,242,0.25)] cursor-pointer"
              >
                <svg className="w-5 h-5 sm:w-5.5 sm:h-5.5 fill-current transition-all group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(24,119,242,0.95)]" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </button>
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-[#0f1419] dark:bg-[#1e2732] text-white text-[11px] font-bold tracking-wide pointer-events-none opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 shadow-xl border border-white/10 whitespace-nowrap z-30">
                Facebook
                <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-[#0f1419] dark:border-t-[#1e2732]"></div>
              </div>
            </div>

            {/* 6. Threads */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => onPlatformDetected?.('threads', '')}
                aria-label="Threads"
                className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white/90 dark:bg-[#151a21] border border-[#cfd9de]/80 dark:border-[#2f3336] border-b-[3px] border-b-black/20 dark:border-b-black/50 flex items-center justify-center text-[#536471] dark:text-[#8b98a5] transition-all duration-300 transform-gpu hover:-translate-y-1.5 hover:scale-105 active:translate-y-0.5 active:border-b active:scale-95 shadow-[0_4px_10px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.12)] hover:border-[#A855F7] hover:border-b-[#A855F7] hover:text-[#A855F7] hover:shadow-[0_0_24px_rgba(168,85,247,0.95),0_12px_25px_-5px_rgba(168,85,247,0.5),inset_0_0_12px_rgba(168,85,247,0.25)] cursor-pointer"
              >
                <svg className="w-5.5 h-5.5 sm:w-6 sm:h-6 fill-current transition-all group-hover:scale-110 group-hover:drop-shadow-[0_0_10px_rgba(168,85,247,0.95)]" viewBox="0 0 192 192">
                  <path d="M141.537 88.9883C140.71 88.5919 139.87 88.2104 139.019 87.8451C137.537 60.5382 122.616 44.905 97.5619 44.745C97.4484 44.7443 97.3355 44.7443 97.222 44.7443C82.2364 44.7443 69.7731 51.1409 62.102 62.7807L75.881 72.2328C81.6116 63.5383 90.6052 61.6848 97.2286 61.6848C97.3051 61.6848 97.3819 61.6848 97.4576 61.6855C105.707 61.7381 111.932 64.1366 115.961 68.814C118.893 72.2193 120.854 76.925 121.825 82.8638C114.511 81.6207 106.601 81.2385 98.145 81.7233C74.3247 83.0954 59.0111 96.9879 60.0396 116.292C60.5615 126.084 65.4397 134.508 73.775 140.011C80.8224 144.663 89.899 146.938 99.3323 146.423C111.79 145.74 121.563 140.987 128.381 132.296C133.559 125.696 136.834 117.143 138.28 106.366C144.217 109.949 148.617 114.664 151.047 120.332C155.179 129.967 155.42 145.8 142.501 158.708C131.182 170.016 117.576 174.908 97.0135 175.059C74.2042 174.89 56.9538 167.575 45.7381 153.317C35.2355 139.966 29.8077 120.682 29.6052 96C29.8077 71.3178 35.2355 52.0336 45.7381 38.6827C56.9538 24.4249 74.2039 17.11 97.0132 16.9405C119.988 17.1113 137.539 24.4614 149.184 38.788C154.894 45.8136 159.199 54.6488 162.037 64.9503L178.184 60.6422C174.744 47.9622 169.331 37.0357 161.965 27.974C147.036 9.60668 125.202 0.195148 97.0695 0H96.9569C68.8816 0.19447 47.2921 9.6418 32.7883 28.0793C19.8819 44.4864 13.2244 67.3157 13.0007 95.9325L13 96L13.0007 96.0675C13.2244 124.684 19.8819 147.514 32.7883 163.921C47.2921 182.358 68.8816 191.806 96.9569 192H97.0695C122.03 191.827 139.624 185.292 154.118 170.811C173.081 151.866 172.51 128.119 166.26 113.541C161.776 103.087 153.227 94.5962 141.537 88.9883ZM98.4405 129.507C88.0005 130.095 77.1544 125.409 76.6196 115.372C76.2232 107.93 81.9158 99.626 99.0812 98.6368C101.047 98.5234 102.976 98.468 104.871 98.468C111.106 98.468 116.939 99.0737 122.242 100.233C120.264 124.935 108.662 128.946 98.4405 129.507Z"/>
                </svg>
              </button>
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-[#0f1419] dark:bg-[#1e2732] text-white text-[11px] font-bold tracking-wide pointer-events-none opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 shadow-xl border border-white/10 whitespace-nowrap z-30">
                Threads
                <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-[#0f1419] dark:border-t-[#1e2732]"></div>
              </div>
            </div>

            {/* 7. YouTube */}
            <div className="relative group">
              <button
                type="button"
                onClick={() => onPlatformDetected?.('youtube', '')}
                aria-label="YouTube"
                className="w-12 h-12 sm:w-13 sm:h-13 rounded-2xl bg-white/90 dark:bg-[#151a21] border border-[#cfd9de]/80 dark:border-[#2f3336] border-b-[3px] border-b-black/20 dark:border-b-black/50 flex items-center justify-center text-[#536471] dark:text-[#8b98a5] transition-all duration-300 transform-gpu hover:-translate-y-1.5 hover:scale-105 active:translate-y-0.5 active:border-b active:scale-95 shadow-[0_4px_10px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.12)] hover:border-[#FF0000] hover:border-b-[#FF0000] hover:text-[#FF0000] hover:shadow-[0_0_26px_rgba(255,0,0,0.95),0_12px_25px_-5px_rgba(255,0,0,0.55),inset_0_0_12px_rgba(255,0,0,0.3)] cursor-pointer"
              >
                <svg className="w-6 h-6 fill-current transition-all group-hover:scale-110 group-hover:drop-shadow-[0_0_12px_rgba(255,0,0,0.95)]" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              </button>
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-[#0f1419] dark:bg-[#1e2732] text-white text-[11px] font-bold tracking-wide pointer-events-none opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all duration-200 shadow-xl border border-white/10 whitespace-nowrap z-30">
                YouTube
                <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-[#0f1419] dark:border-t-[#1e2732]"></div>
              </div>
            </div>
          </div>
        )}

        {/* 3 Dedicated Download Slots for Twitter / X */}
        {!isMp3Mode && selectedPlatform === 'x' && (
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 mb-5 max-w-xl mx-auto p-1.5 bg-[#eff3f4] dark:bg-[#1e2732] rounded-2xl border border-[#cfd9de]/80 dark:border-[#2f3336] shadow-xs animate-in fade-in duration-200">
            <button
              type="button"
              onClick={() => setXCategory('video')}
              className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-2.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                xCategory === 'video'
                  ? 'bg-white dark:bg-[#1d9bf0] text-[#1d9bf0] dark:text-white shadow-sm ring-1 ring-black/5'
                  : 'text-[#536471] dark:text-[#8b98a5] hover:text-[#0f1419] dark:hover:text-white'
              }`}
            >
              <Film className="w-4 h-4 shrink-0" />
              <span>{t.categoryVideo}</span>
            </button>

            <button
              type="button"
              onClick={() => setXCategory('stream')}
              className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-2.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                xCategory === 'stream'
                  ? 'bg-white dark:bg-[#00ba7c] text-[#00ba7c] dark:text-white shadow-sm ring-1 ring-black/5'
                  : 'text-[#536471] dark:text-[#8b98a5] hover:text-[#0f1419] dark:hover:text-white'
              }`}
            >
              <Radio className="w-4 h-4 shrink-0" />
              <span>{t.categoryStream}</span>
            </button>

            <button
              type="button"
              onClick={() => setXCategory('spaces')}
              className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 py-2 px-2.5 sm:px-4 rounded-xl text-xs sm:text-sm font-bold transition-all ${
                xCategory === 'spaces'
                  ? 'bg-white dark:bg-[#7856FF] text-[#7856FF] dark:text-white shadow-sm ring-1 ring-black/5'
                  : 'text-[#536471] dark:text-[#8b98a5] hover:text-[#0f1419] dark:hover:text-white'
              }`}
            >
              <Mic className="w-4 h-4 shrink-0" />
              <span>{t.categorySpaces}</span>
            </button>
          </div>
        )}

        {/* Input Form with High-Speed Touch Ergonomics */}
        <form onSubmit={handleSubmit} className="relative max-w-2xl mx-auto">
          <div className="flex flex-col sm:flex-row items-stretch bg-white dark:bg-[#1e2732] rounded-2xl border-2 border-[#cfd9de] dark:border-[#2f3336] focus-within:border-[#1d9bf0] dark:focus-within:border-[#1d9bf0] focus-within:ring-4 focus-within:ring-[#1d9bf0]/15 transition-all shadow-md p-1.5 gap-1.5">
            <div className="relative flex-1 flex items-center min-h-[48px]">
              <div className="pl-3.5 pr-1 text-[#8b98a5] shrink-0">
                {selectedPlatform === 'x' && xCategory === 'spaces' ? (
                  <Mic className="w-4 h-4 text-[#7856FF]" />
                ) : selectedPlatform === 'x' && xCategory === 'stream' ? (
                  <Radio className="w-4 h-4 text-[#00ba7c]" />
                ) : selectedPlatform === 'x' ? (
                  <Film className="w-4 h-4 text-[#1d9bf0]" />
                ) : (
                  <Globe className="w-4 h-4 text-[#1d9bf0]" />
                )}
              </div>

              <input
                ref={inputRef}
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={url}
                onChange={(e) => {
                  const val = e.target.value;
                  setUrl(val);
                  setErrorNotice(null);
                  onClearError?.();
                  if (/^https?:\/\//i.test(val.trim())) {
                    checkAndRouteUrl(val, false);
                  } else {
                    clearPendingRedirect();
                  }
                }}
                placeholder={getDynamicPlaceholder()}
                className="w-full bg-transparent px-3 py-3 text-sm sm:text-base text-[#0f1419] dark:text-white placeholder-[#8b98a5] focus:outline-none"
                aria-label="Video or media URL"
              />

              {url && (
                <button
                  type="button"
                  onClick={() => {
                    clearPendingRedirect();
                    setUrl('');
                    setErrorNotice(null);
                    onClearError?.();
                  }}
                  className="touch-target p-2 text-[#8b98a5] hover:text-[#0f1419] dark:hover:text-white transition-colors"
                  aria-label="Clear input"
                >
                  <X className="w-4 h-4" />
                </button>
              )}

              <button
                type="button"
                onClick={handlePaste}
                className="touch-target px-3.5 py-1.5 bg-[#e8f5fe] dark:bg-[#1d9bf0]/20 hover:bg-[#d0ebfd] dark:hover:bg-[#1d9bf0]/30 text-[#1d9bf0] text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors shrink-0 mx-1 active:scale-95"
                title="Paste from clipboard"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span>{pasteSuccess ? 'Pasted!' : t.pasteBtn}</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="touch-target min-h-[48px] bg-[#0f1419] hover:bg-[#272c30] dark:bg-[#1d9bf0] dark:hover:bg-[#1a8cd8] active:scale-[0.98] text-white font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 text-sm sm:text-base transition-all disabled:opacity-70 disabled:cursor-not-allowed shadow-sm shrink-0"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{t.analyzingBtn}</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 text-white" />
                  <span>{t.downloadBtn}</span>
                </>
              )}
            </button>
          </div>

          {redirectNotice && (
            <div className="mt-3 p-3 bg-[#e8f5fe] dark:bg-[#1d9bf0]/20 border border-[#1d9bf0]/40 rounded-xl text-xs text-[#1d9bf0] dark:text-[#71c9f8] font-bold flex items-center justify-center gap-2 text-center animate-in fade-in duration-200">
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>{redirectNotice}</span>
              <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
            </div>
          )}

          {displayedError && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-2 text-left rtl:text-right animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{displayedError}</span>
            </div>
          )}
        </form>

        {/* 1-Click Quick Sample Links (Run Real Extraction Only) */}
        <div className="mt-6 pt-4 border-t border-[#eff3f4] dark:border-[#2f3336] flex flex-wrap items-center justify-center gap-2 text-xs text-[#536471] dark:text-[#8b98a5]">
          <span className="font-semibold text-[#0f1419] dark:text-[#cfd9de]">{t.sampleLinksLabel}</span>

          <button
            type="button"
            onClick={handleSampleXClick}
            className="hover:text-[#1d9bf0] hover:underline px-2.5 py-1 rounded-lg bg-[#f7f9f9] dark:bg-[#1e2732] border border-[#cfd9de]/60 dark:border-[#2f3336] transition-colors inline-flex items-center gap-1 dark:text-[#cfd9de]"
          >
            🚀 SpaceX (X Video)
          </button>

          <button
            type="button"
            onClick={() => onPlatformDetected?.('tiktok', SAMPLE_URLS.tiktok)}
            className="hover:text-[#00F2FE] hover:underline px-2.5 py-1 rounded-lg bg-[#f7f9f9] dark:bg-[#1e2732] border border-[#cfd9de]/60 dark:border-[#2f3336] transition-colors inline-flex items-center gap-1 dark:text-[#cfd9de]"
          >
            🎵 TikTok (No Watermark)
          </button>

          <button
            type="button"
            onClick={() => onPlatformDetected?.('instagram', SAMPLE_URLS.instagram)}
            className="hover:text-[#E1306C] hover:underline px-2.5 py-1 rounded-lg bg-[#f7f9f9] dark:bg-[#1e2732] border border-[#cfd9de]/60 dark:border-[#2f3336] transition-colors inline-flex items-center gap-1 dark:text-[#cfd9de]"
          >
            📸 Instagram Reel (HD)
          </button>

          <button
            type="button"
            onClick={() => onPlatformDetected?.('youtube', SAMPLE_URLS.youtube)}
            className="hover:text-[#FF0000] hover:underline px-2.5 py-1 rounded-lg bg-[#f7f9f9] dark:bg-[#1e2732] border border-[#cfd9de]/60 dark:border-[#2f3336] transition-colors inline-flex items-center gap-1 dark:text-[#cfd9de]"
          >
            ▶️ YouTube (1080p HD)
          </button>

          <button
            type="button"
            onClick={() => {
              clearPendingRedirect();
              setErrorNotice(null);
              onClearError?.();
              setSelectedPlatform('x');
              setXCategory('spaces');
              inputRef.current?.focus();
            }}
            className="hover:text-[#7856FF] hover:underline px-2.5 py-1 rounded-lg bg-[#f7f9f9] dark:bg-[#1e2732] border border-[#cfd9de]/60 dark:border-[#2f3336] transition-colors inline-flex items-center gap-1 dark:text-[#cfd9de]"
          >
            🎙️ Spaces Audio (320k)
          </button>
        </div>
      </div>
    </section>
  );
};
