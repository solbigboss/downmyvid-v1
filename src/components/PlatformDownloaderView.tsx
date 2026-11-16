import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Download } from 'lucide-react';
import { PLATFORMS_CONFIG } from '../data/platforms';
import { extractMedia, normalizeUrlInput } from '../services/mediaExtractor';
import { Language, MediaFormat, TweetMediaData } from '../types';
import { MediaResultCard } from './MediaResultCard';

interface PlatformDownloaderViewProps {
  platformSlug: 'instagram' | 'tiktok' | 'facebook' | 'threads';
  currentLang: Language;
  onOpenQr: (url: string, title: string) => void;
  onSaveDownload: (media: TweetMediaData, format: MediaFormat) => void;
  onSelectPlatform: (slug: 'instagram' | 'tiktok' | 'facebook' | 'threads' | 'home') => void;
}

export const PlatformDownloaderView: React.FC<PlatformDownloaderViewProps> = ({
  platformSlug,
  currentLang,
  onOpenQr,
  onSaveDownload,
  onSelectPlatform,
}) => {
  const platform = PLATFORMS_CONFIG[platformSlug].name;
  const isSupported = platformSlug === 'instagram' || platformSlug === 'facebook';
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TweetMediaData | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    setUrl('');
    setIsLoading(false);
    setError(null);
    setResult(null);
    return () => {
      requestIdRef.current += 1;
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, [platformSlug]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // The ref also blocks repeated submits before React renders the loading state.
    if (!isSupported || controllerRef.current) return;
    const normalized = normalizeUrlInput(url);
    setResult(null);
    setError(null);
    if (!normalized) {
      setError(`Please paste a public ${platform} video, reel, or post link.`);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    try {
      const media = await extractMedia(normalized, currentLang, controller.signal, platformSlug);
      if (!controller.signal.aborted && requestId === requestIdRef.current) {
        setResult(media);
      }
    } catch (err: unknown) {
      if (!controller.signal.aborted && requestId === requestIdRef.current) {
        setError(err instanceof Error ? err.message : `Unable to extract this ${platform} link. Please try again.`);
      }
    } finally {
      if (requestId === requestIdRef.current && !controller.signal.aborted) {
        controllerRef.current = null;
        setIsLoading(false);
      }
    }
  };

  return (
    <section className="max-w-3xl mx-auto px-4 py-10">
      <button
        type="button"
        onClick={() => onSelectPlatform('home')}
        className="touch-target inline-flex items-center gap-2 text-sm font-semibold text-[#536471] hover:text-[#1d9bf0]"
        aria-label="Back to DownMyVid downloader"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to DownMyVid</span>
      </button>
      {isSupported ? (
        <>
          <h1 className="mt-6 text-2xl font-bold text-[#0f1419] dark:text-white">{platform} video downloader</h1>
          <p className="mt-3 text-sm text-[#536471] dark:text-[#8b98a5]">
            Paste a public {platform} video, reel, or post link to find available downloads.
          </p>
          <form onSubmit={handleSubmit} aria-busy={isLoading} className="mt-6">
            <label htmlFor="platform-media-url" className="block mb-2 text-sm font-semibold">{platform} URL</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="platform-media-url"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={url}
                disabled={isLoading}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setError(null);
                }}
                placeholder={platformSlug === 'instagram' ? 'https://www.instagram.com/reel/...' : 'https://www.facebook.com/reel/...'}
                aria-describedby={error ? 'platform-extract-error' : undefined}
                className="flex-1 min-w-0 px-4 py-3 rounded-xl border border-[#cfd9de] dark:border-[#2f3336] bg-white dark:bg-[#15202b] focus:outline-none focus:ring-2 focus:ring-[#1d9bf0]"
              />
              <button
                type="submit"
                disabled={isLoading}
                className="touch-target inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[#1d9bf0] text-white font-bold hover:bg-[#1a8cd8] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                {isLoading ? 'Finding downloads…' : 'Download'}
              </button>
            </div>
            {isLoading && <p role="status" className="mt-3 text-sm text-[#536471] dark:text-[#8b98a5]">Analyzing {platform} link…</p>}
            {error && (
              <p id="platform-extract-error" role="alert" className="mt-3 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </p>
            )}
          </form>
          {result && (
            <MediaResultCard
              key={`${platformSlug}::${result.id}::${result.originalUrl}`}
              media={result}
              currentLang={currentLang}
              onOpenQr={onOpenQr}
              onSaveDownload={onSaveDownload}
            />
          )}
        </>
      ) : (
        <>
          <h1 className="mt-6 text-2xl font-bold text-[#0f1419] dark:text-white">{platform} extraction is not verified</h1>
          <p role="status" className="mt-3 text-sm text-[#536471] dark:text-[#8b98a5]">
            The {platform} extractor has not been verified on the free static site. This page is disabled until it is tested.
          </p>
        </>
      )}
    </section>
  );
};
