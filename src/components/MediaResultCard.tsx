import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Download,
  Share2,
  QrCode,
  Copy,
  Check,
  Scissors,
  CheckCircle2,
  Music,
  Video,
  FileText,
  Clock,
  Eye,
  Heart,
  Repeat,
  AlertCircle,
} from 'lucide-react';
import Hls from 'hls.js';
import { TweetMediaData, MediaFormat, Language } from '../types';
import { translations } from '../data/translations';
import { isValidMediaStreamUrl } from '../services/mediaExtractor';

interface MediaResultCardProps {
  media: TweetMediaData;
  currentLang: Language;
  onOpenQr: (url: string, title: string) => void;
  onSaveDownload: (media: TweetMediaData, format: MediaFormat) => void;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const MediaResultCard: React.FC<MediaResultCardProps> = ({
  media,
  currentLang,
  onOpenQr,
  onSaveDownload,
}) => {
  const safeDuration = Math.max(2, Math.round(media.durationSeconds || 10));

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [copiedLink, setCopiedLink] = useState(false);
  const [trimmerActive, setTrimmerActive] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(safeDuration);
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('Starting...');
  const [downloadComplete, setDownloadComplete] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const downloadAbortRef = useRef<AbortController | null>(null);
  const t = translations[currentLang];

  const isHlsUrl = (u?: string | null) =>
    Boolean(u && (u.includes('.m3u8') || u.includes('/api/hls-proxy')));

  // Reset all local media/player state and wire HLS playback whenever media changes
  useEffect(() => {
    downloadAbortRef.current?.abort();
    downloadAbortRef.current = null;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setIsPlaying(false);
    setIsMuted(false);
    setCurrentTime(0);
    setCopiedLink(false);
    setTrimmerActive(false);
    setTrimStart(0);
    setTrimEnd(safeDuration);
    setActiveDownloadId(null);
    setDownloadProgress(0);
    setDownloadSpeed('Starting...');
    setDownloadComplete(null);
    setVideoError(null);
    setDownloadError(null);

    const streamUrl = media.isSpaces ? media.audioUrl || media.videoUrl : media.videoUrl;
    const targetEl: HTMLMediaElement | null = media.isSpaces ? audioRef.current : videoRef.current;

    if (targetEl && streamUrl) {
      targetEl.pause();
      if (isHlsUrl(streamUrl)) {
        if (Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
          });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(targetEl);
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) {
              setIsPlaying(false);
              setVideoError('Live/HLS stream preview unavailable. Use the download buttons below.');
            }
          });
        } else if (targetEl.canPlayType('application/vnd.apple.mpegurl')) {
          targetEl.src = streamUrl;
          targetEl.load();
        } else {
          setVideoError('HLS preview is not supported in this browser. Use the download buttons below.');
        }
      } else {
        targetEl.src = streamUrl;
        targetEl.load();
      }
    }

    return () => {
      downloadAbortRef.current?.abort();
      downloadAbortRef.current = null;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [media.id, media.videoUrl, media.audioUrl, media.originalUrl, media.isSpaces, safeDuration]);

  const getActiveMediaElement = (): HTMLMediaElement | null =>
    media.isSpaces ? audioRef.current : videoRef.current;

  const togglePlay = () => {
    const el = getActiveMediaElement();
    if (el && !videoError) {
      if (isPlaying) {
        el.pause();
        setIsPlaying(false);
      } else {
        el
          .play()
          .then(() => setIsPlaying(true))
          .catch(() => setIsPlaying(false));
      }
    }
  };

  const toggleMute = () => {
    const el = getActiveMediaElement();
    if (el) {
      el.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleFullscreen = () => {
    if (!media.isSpaces && videoRef.current && videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(media.originalUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Downmyvid - Video from @${media.author.handle}`,
          text: media.tweetText,
          url: media.originalUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      handleCopyLink();
    }
  };

  const triggerBlobSave = (blob: Blob, filename: string) => {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
  };

  const streamDownloadToDisk = async (
    fetchUrl: string,
    filename: string,
    mimeType: string,
    signal: AbortSignal
  ): Promise<{ ok: boolean; htmlReturned?: boolean }> => {
    const isSameOrigin = fetchUrl.startsWith('/');
    const res = await fetch(fetchUrl, {
      mode: isSameOrigin ? 'same-origin' : 'cors',
      cache: 'no-store',
      signal,
    });
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) {
      return { ok: false, htmlReturned: true };
    }
    if (!res.ok) {
      return { ok: false };
    }

    const totalBytes = Number(res.headers.get('content-length') || 0);
    if (!res.body) {
      const rawBlob = await res.blob();
      if (rawBlob.size === 0) return { ok: false };
      triggerBlobSave(new Blob([rawBlob], { type: mimeType }), filename);
      return { ok: true };
    }

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let loadedBytes = 0;
    const startedAt = performance.now();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loadedBytes += value.byteLength;
        const elapsedSec = Math.max(0.1, (performance.now() - startedAt) / 1000);
        const speedMbps = (loadedBytes / 1048576 / elapsedSec).toFixed(1);
        const loadedMb = (loadedBytes / 1048576).toFixed(1);
        if (totalBytes > 0) {
          setDownloadProgress(Math.min(99, Math.max(5, Math.round((loadedBytes / totalBytes) * 100))));
          setDownloadSpeed(`${speedMbps} MB/s`);
        } else {
          setDownloadProgress((prev) => (prev < 85 ? Math.min(85, prev + 4) : prev));
          setDownloadSpeed(`${loadedMb} MB · ${speedMbps} MB/s`);
        }
      }
    }

    if (loadedBytes === 0) {
      return { ok: false };
    }

    const blob = new Blob(chunks as BlobPart[], { type: mimeType });
    setDownloadProgress(100);
    triggerBlobSave(blob, filename);
    return { ok: true };
  };

  const handleDownload = async (format: MediaFormat) => {
    setDownloadError(null);
    const rawTargetUrl =
      format.directUrl ||
      (format.type === 'audio' ? media.audioUrl : media.videoUrl);

    if (!isValidMediaStreamUrl(rawTargetUrl)) {
      setDownloadError('No valid downloadable media URL was found for this format.');
      return;
    }

    downloadAbortRef.current?.abort();
    const controller = new AbortController();
    downloadAbortRef.current = controller;

    setActiveDownloadId(format.id);
    setDownloadProgress(5);
    setDownloadSpeed('Connecting...');
    setDownloadComplete(null);

    const safeHandle = (media.author?.handle || 'video').replace(/[^a-zA-Z0-9_]/g, '') || 'media';
    const ext = format.format.toLowerCase();
    const filename = `Downmyvid_${safeHandle}_${format.quality.replace(/[^a-zA-Z0-9]+/g, '_')}.${ext}`;
    const mimeType =
      ext === 'mp3' ? 'audio/mpeg' : ext === 'm4a' ? 'audio/mp4' : 'video/mp4';

    const proxyUrl = rawTargetUrl.startsWith('/api/')
      ? rawTargetUrl
      : `/api/proxy-download?url=${encodeURIComponent(rawTargetUrl)}&filename=${encodeURIComponent(filename)}`;

    let downloaded = false;
    let backendMissingForHls = false;

    try {
      // 1. If external HTTPS URL (e.g., X video.twimg.com), fetch directly with cache:'no-store' to avoid <video> non-CORS cache poisoning
      if (/^https?:\/\//i.test(rawTargetUrl)) {
        try {
          const directAttempt = await streamDownloadToDisk(
            rawTargetUrl,
            filename,
            mimeType,
            controller.signal
          );
          downloaded = directAttempt.ok;
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
        }
      }

      // 2. Use backend proxy (/api/proxy-download or /api/hls-download)
      if (!downloaded) {
        try {
          const proxyAttempt = await streamDownloadToDisk(
            proxyUrl,
            filename,
            mimeType,
            controller.signal
          );
          downloaded = proxyAttempt.ok;
          if (!downloaded && proxyAttempt.htmlReturned && rawTargetUrl.startsWith('/api/hls-download')) {
            backendMissingForHls = true;
          }
        } catch (err: any) {
          if (err?.name === 'AbortError') return;
        }
      }

      if (downloaded) {
        onSaveDownload(media, format);
        setDownloadComplete(format.id);
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
        window.setTimeout(() => setDownloadComplete(null), 5000);
      } else if (backendMissingForHls) {
        setDownloadError('Live broadcast & Spaces MP4/MP3 conversion requires the backend server.');
      } else {
        setDownloadError('Direct download was blocked by the origin CDN. Please try another quality or retry.');
      }
    } finally {
      if (downloadAbortRef.current === controller) {
        downloadAbortRef.current = null;
        setActiveDownloadId(null);
      }
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto my-3 sm:my-8 bg-white dark:bg-[#15202b] border border-[#cfd9de] dark:border-[#2f3336] rounded-2xl sm:rounded-3xl overflow-hidden shadow-xl animate-in fade-in zoom-in-95 duration-200 transition-colors">
      {/* Tweet Author Header */}
      <div className="p-3.5 sm:p-6 border-b border-[#eff3f4] dark:border-[#2f3336] bg-[#f7f9f9]/50 dark:bg-[#1e2732]/40 flex items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <img
            src={media.author.avatar}
            alt={media.author.name}
            className="w-12 h-12 rounded-full border border-[#cfd9de] dark:border-[#2f3336] object-cover shrink-0 shadow-sm"
            referrerPolicy="no-referrer"
          />
          <div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-bold text-[#0f1419] dark:text-white text-base leading-snug">
                {media.author.name}
              </span>
              {media.author.verified && (
                <span className="text-[#1d9bf0]" title="Verified Account">
                  <CheckCircle2 className="w-4 h-4 fill-[#1d9bf0] text-white" />
                </span>
              )}
              <span className="text-xs text-[#536471] dark:text-[#8b98a5]">@{media.author.handle}</span>
            </div>
            <div className="text-xs text-[#536471] dark:text-[#8b98a5] flex items-center gap-2 mt-0.5">
              <Clock className="w-3.5 h-3.5" />
              <span>{media.publishedAt}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons for Mobile / Desktop Sharing */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => onOpenQr(media.originalUrl, media.tweetText)}
            className="touch-target p-2 sm:px-3 sm:py-1.5 rounded-xl bg-white dark:bg-[#1e2732] border border-[#cfd9de] dark:border-[#2f3336] text-[#0f1419] dark:text-[#cfd9de] hover:bg-[#f7f9f9] dark:hover:bg-[#273340] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            title="Scan QR to download on mobile phone"
          >
            <QrCode className="w-4 h-4 text-[#1d9bf0]" />
            <span className="hidden sm:inline">Phone QR</span>
          </button>

          <button
            onClick={handleNativeShare}
            className="touch-target p-2 sm:px-3 sm:py-1.5 rounded-xl bg-white dark:bg-[#1e2732] border border-[#cfd9de] dark:border-[#2f3336] text-[#0f1419] dark:text-[#cfd9de] hover:bg-[#f7f9f9] dark:hover:bg-[#273340] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
            title="Share via device"
          >
            <Share2 className="w-4 h-4 text-[#1d9bf0]" />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>
      </div>

      {/* Tweet Body Text */}
      <div className="px-4 sm:px-6 pt-4 pb-2">
        <p className="text-[#0f1419] dark:text-[#e1e8ed] text-sm sm:text-base leading-relaxed break-words font-medium">
          {media.tweetText}
        </p>

        {/* Tweet stats */}
        <div className="flex items-center gap-4 mt-3 text-xs text-[#536471] dark:text-[#8b98a5] pb-2 border-b border-[#eff3f4] dark:border-[#2f3336]">
          <span className="flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" />
            <span className="font-semibold">{media.viewCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <Heart className="w-3.5 h-3.5 text-rose-500" />
            <span className="font-semibold">{media.likeCount}</span>
          </span>
          <span className="flex items-center gap-1">
            <Repeat className="w-3.5 h-3.5 text-emerald-500" />
            <span className="font-semibold">{media.retweetCount}</span>
          </span>
        </div>
      </div>

      {/* Media Player Container - Zero Cumulative Layout Shift (Aspect 16:9) */}
      <div className="px-4 sm:px-6 py-3">
        <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-inner group">
          {media.isSpaces ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0f1419] via-[#15202b] to-[#1e2732] p-6 text-white text-center">
              <audio
                key={media.audioUrl || media.videoUrl}
                ref={audioRef}
                playsInline
                preload="metadata"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={() => {
                  setIsPlaying(false);
                  setVideoError('Space audio preview unavailable. Use the download buttons below.');
                }}
              />
              <div className="w-16 h-16 rounded-full bg-[#1d9bf0]/20 border border-[#1d9bf0] flex items-center justify-center mb-3 animate-pulse">
                <Music className="w-8 h-8 text-[#1d9bf0]" />
              </div>
              <span className="text-lg font-bold">X Spaces Broadcast Audio</span>
              <span className="text-xs text-[#8b98a5] mt-1">Original AAC / 320kbps MP3 Audio Stream</span>

              <div className="flex items-center gap-1 mt-4 h-12">
                {[40, 70, 25, 90, 60, 85, 30, 95, 50, 80, 45, 100, 65, 35, 75, 55, 90, 40].map((h, i) => (
                  <div
                    key={i}
                    style={{ height: `${isPlaying ? h : 20}%` }}
                    className="w-1.5 bg-[#1d9bf0] rounded-full transition-all duration-300"
                  />
                ))}
              </div>
            </div>
          ) : videoError ? (
            <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-white bg-[#0f1419]">
              <AlertCircle className="w-10 h-10 text-rose-400 mb-3" />
              <p className="text-sm font-bold mb-1">Video Preview Unavailable</p>
              <p className="text-xs text-[#8b98a5] max-w-md">{videoError}</p>
            </div>
          ) : (
            <video
              key={media.videoUrl}
              ref={videoRef}
              poster={media.thumbnailUrl || undefined}
              playsInline
              loop
              preload="metadata"
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onError={() => {
                setIsPlaying(false);
                setVideoError('Browser could not play this video stream directly. Try the download options below.');
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="w-full h-full object-contain"
            />
          )}

          {/* Floating Minimal Touch Player Controls */}
          {!videoError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              <button
                onClick={togglePlay}
                className="touch-target w-16 h-16 rounded-full bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white flex items-center justify-center shadow-lg active:scale-95 transition-transform pointer-events-auto"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7 ml-1" />}
              </button>
            </div>
          )}

          {/* Bottom Bar Controls */}
          <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between text-white text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                disabled={!!videoError}
                className="touch-target p-1 hover:text-[#1d9bf0] transition-colors disabled:opacity-40"
                aria-label="Play/Pause"
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
              <button
                onClick={toggleMute}
                disabled={!!videoError}
                className="touch-target p-1 hover:text-[#1d9bf0] transition-colors disabled:opacity-40"
                aria-label="Mute/Unmute"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <span className="font-mono tabular-nums text-[11px] text-[#cfd9de]">
                {formatDuration(currentTime)} / {formatDuration(media.durationSeconds || 0)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setTrimmerActive((prev) => !prev)}
                className={`touch-target px-2 py-1 rounded-md text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                  trimmerActive ? 'bg-[#1d9bf0] text-white' : 'bg-white/20 hover:bg-white/30 text-white'
                }`}
                title="Trim clip duration"
              >
                <Scissors className="w-3.5 h-3.5" />
                <span>Trim</span>
              </button>
              <button
                onClick={handleFullscreen}
                disabled={!!videoError}
                className="touch-target p-1 hover:text-[#1d9bf0] transition-colors disabled:opacity-40"
                aria-label="Fullscreen"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Clip Trimmer Drawer */}
        {trimmerActive && (
          <div className="mt-3 p-4 bg-[#f7f9f9] dark:bg-[#1e2732] border border-[#cfd9de] dark:border-[#2f3336] rounded-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs font-bold text-[#0f1419] dark:text-white mb-2">
              <span className="flex items-center gap-1.5">
                <Scissors className="w-4 h-4 text-[#1d9bf0]" />
                {t.trimmerTitle}
              </span>
              <span className="font-mono text-[#536471] dark:text-[#8b98a5]">
                {trimStart}s — {trimEnd}s ({Math.max(0, trimEnd - trimStart)}s duration)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs text-[#536471] dark:text-[#8b98a5]">{t.trimmerStart}:</label>
              <input
                type="range"
                min="0"
                max={Math.max(0, safeDuration - 1)}
                value={trimStart}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val < trimEnd) setTrimStart(val);
                }}
                className="w-full accent-[#1d9bf0]"
              />
              <label className="text-xs text-[#536471] dark:text-[#8b98a5]">{t.trimmerEnd}:</label>
              <input
                type="range"
                min="1"
                max={safeDuration}
                value={trimEnd}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val > trimStart) setTrimEnd(val);
                }}
                className="w-full accent-[#1d9bf0]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Active Download Progress Notice */}
      {activeDownloadId && (
        <div className="mx-4 sm:mx-6 my-2 p-4 bg-[#e8f5fe] dark:bg-[#1d9bf0]/15 border border-[#1d9bf0]/30 rounded-2xl animate-in fade-in">
          <div className="flex items-center justify-between text-xs font-bold text-[#1d9bf0] mb-2">
            <span>{t.downloadingNotice}</span>
            <span className="font-mono">{downloadSpeed} · {downloadProgress}%</span>
          </div>
          <div className="w-full bg-[#1d9bf0]/20 rounded-full h-2 overflow-hidden">
            <div
              className="bg-[#1d9bf0] h-full transition-all duration-150 rounded-full"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        </div>
      )}

      {downloadError && (
        <div className="mx-4 sm:mx-6 my-2 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-2xl text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{downloadError}</span>
        </div>
      )}

      {downloadComplete && (
        <div className="mx-4 sm:mx-6 my-2 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-xs text-emerald-800 dark:text-emerald-400 font-bold flex items-center justify-between animate-in fade-in">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            {t.downloadComplete}
          </span>
          <button
            onClick={() => setDownloadComplete(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900"
          >
            ✕
          </button>
        </div>
      )}

      {/* Format Selection Cards / Table */}
      <div className="p-4 sm:p-6 border-t border-[#eff3f4] dark:border-[#2f3336]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base sm:text-lg font-extrabold text-[#0f1419] dark:text-white">
            {t.formatSelection}
          </h3>
          <span className="text-xs text-[#00ba7c] font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#00ba7c] animate-ping" />
            {t.freeNoLimits}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
          {media.formats.map((fmt) => {
            const isDownloadingThis = activeDownloadId === fmt.id;
            return (
              <div
                key={fmt.id}
                className={`p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all flex items-center justify-between gap-2.5 ${
                  fmt.isPopular
                    ? 'border-[#1d9bf0]/50 bg-[#f7fafd] dark:bg-[#1e2732] shadow-xs'
                    : 'border-[#cfd9de] dark:border-[#2f3336] bg-white dark:bg-[#15202b] hover:border-[#8b98a5]'
                }`}
              >
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      fmt.type === 'audio'
                        ? 'bg-[#ffad1f]/15 text-[#ffad1f]'
                        : fmt.type === 'gif'
                        ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400'
                        : 'bg-[#1d9bf0]/15 text-[#1d9bf0]'
                    }`}
                  >
                    {fmt.type === 'audio' ? (
                      <Music className="w-4 h-4 sm:w-5 sm:h-5" />
                    ) : fmt.type === 'gif' ? (
                      <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                    ) : (
                      <Video className="w-4 h-4 sm:w-5 sm:h-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-extrabold text-xs sm:text-sm text-[#0f1419] dark:text-white leading-tight">
                      {fmt.label}
                    </div>
                    <div className="text-[11px] sm:text-xs text-[#536471] dark:text-[#8b98a5] font-mono tabular-nums mt-0.5">
                      {fmt.resolution || fmt.bitrate || fmt.quality} · {fmt.sizeMb} MB · {fmt.format}
                    </div>
                  </div>
                </div>

                {/* Right side: Action with POPULAR badge neatly stacked ABOVE download button */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {fmt.isPopular && (
                    <span className="text-[9px] sm:text-[10px] tracking-wide font-black uppercase bg-[#1d9bf0] text-white px-2 py-0.5 rounded-full shadow-2xs leading-none">
                      POPULAR
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={isDownloadingThis}
                    onClick={() => handleDownload(fmt)}
                    className={`touch-target px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-xs shrink-0 active:scale-95 ${
                      fmt.isPopular
                        ? 'bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white'
                        : 'bg-[#0f1419] dark:bg-[#273340] hover:bg-[#272c30] dark:hover:bg-[#344454] text-white'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{t.downloadBtn}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Copy Direct Link Button */}
        <div className="mt-4 pt-4 border-t border-[#eff3f4] dark:border-[#2f3336] flex flex-wrap items-center justify-between gap-3 text-xs text-[#536471] dark:text-[#8b98a5]">
          <div className="flex items-center gap-2">
            <span>Original source bitstream</span>
            <span>·</span>
            <span>0% Watermark</span>
          </div>

          <button
            type="button"
            onClick={handleCopyLink}
            className="touch-target inline-flex items-center gap-1.5 font-bold text-[#1d9bf0] hover:underline"
          >
            {copiedLink ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
            <span>{copiedLink ? t.linkCopied : t.copyLink}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
