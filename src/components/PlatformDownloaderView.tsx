import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { PLATFORMS_CONFIG } from '../data/platforms';

interface PlatformDownloaderViewProps {
  platformSlug: 'instagram' | 'tiktok' | 'facebook' | 'threads';
  onSelectPlatform: (slug: 'instagram' | 'tiktok' | 'facebook' | 'threads' | 'home') => void;
}

export const PlatformDownloaderView: React.FC<PlatformDownloaderViewProps> = ({ platformSlug, onSelectPlatform }) => {
  const platform = PLATFORMS_CONFIG[platformSlug].name;
  const needsBackend = platformSlug === 'instagram' || platformSlug === 'facebook';

  return (
    <section className="max-w-3xl mx-auto px-4 py-10">
      <button
        type="button"
        onClick={() => onSelectPlatform('home')}
        className="touch-target inline-flex items-center gap-2 text-sm font-semibold text-[#536471] hover:text-[#1d9bf0]"
        aria-label="Back to X video downloader"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to DownMyVid</span>
      </button>
      <h1 className="mt-6 text-2xl font-bold text-[#0f1419] dark:text-white">{platform} extraction is not verified</h1>
      <p role="status" className="mt-3 text-sm text-[#536471] dark:text-[#8b98a5]">
        {needsBackend
          ? `The ${platform} extractor runs on the Express backend, which is not available on free static Firebase Hosting. Extraction has not been verified against a normal remote server.`
          : `The ${platform} extractor has not been verified on the free static site. This page is disabled until it is tested.`}
      </p>
    </section>
  );
};
