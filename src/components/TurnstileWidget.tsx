import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  theme?: 'dark' | 'light' | 'auto';
  className?: string;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'error-callback'?: () => void;
          'expired-callback'?: () => void;
          theme?: 'dark' | 'light' | 'auto';
          size?: 'normal' | 'compact' | 'flexible';
        }
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoaded?: () => void;
  }
}

// Cloudflare Turnstile Site Key for DownMyVid
const PRODUCTION_TURNSTILE_SITE_KEY = '0x4AAAAAAGS0n5MhtxDZgn9T';

export const TurnstileWidget: React.FC<TurnstileWidgetProps> = ({
  onVerify,
  onError,
  onExpire,
  theme = 'auto',
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState<boolean>(false);
  const [isVerified, setIsVerified] = useState<boolean>(false);

  const siteKey =
    ((import.meta as any).env?.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ||
    PRODUCTION_TURNSTILE_SITE_KEY;

  useEffect(() => {
    let isMounted = true;

    const renderWidget = () => {
      if (!isMounted || !containerRef.current || !window.turnstile) return;

      // Clean up existing widget if any
      if (widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }

      try {
        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme,
          callback: (token: string) => {
            if (!isMounted) return;
            setIsVerified(true);
            onVerify(token);
          },
          'error-callback': () => {
            if (!isMounted) return;
            setIsVerified(false);
            onError?.();
          },
          'expired-callback': () => {
            if (!isMounted) return;
            setIsVerified(false);
            onExpire?.();
          },
        });
        widgetIdRef.current = id;
        setIsLoaded(true);
      } catch (err) {
        console.warn('Turnstile render warning:', err);
      }
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      // Check if script tag already exists
      const existingScript = document.getElementById('cf-turnstile-script');
      if (!existingScript) {
        const script = document.createElement('script');
        script.id = 'cf-turnstile-script';
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
        script.async = true;
        script.defer = true;
        script.onload = () => {
          if (isMounted) renderWidget();
        };
        document.head.appendChild(script);
      } else {
        existingScript.addEventListener('load', renderWidget);
      }
    }

    return () => {
      isMounted = false;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
      }
    };
  }, [siteKey, theme]);

  return (
    <div
      className={`my-3 p-2.5 rounded-2xl bg-[#0b111e]/60 dark:bg-[#101726]/80 border border-white/10 shadow-[inset_0px_2px_4px_rgba(0,0,0,0.4),0px_6px_16px_rgba(0,0,0,0.3)] backdrop-blur-md transition-all flex flex-col items-center justify-center min-h-[68px] ${className}`}
    >
      <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-400">
        <ShieldCheck className={`w-3.5 h-3.5 ${isVerified ? 'text-emerald-400' : 'text-cyan-400 animate-pulse'}`} />
        <span>Cloudflare Turnstile · Zero-Friction Human Verification</span>
      </div>

      <div ref={containerRef} className="flex justify-center items-center">
        {!isLoaded && (
          <div className="flex items-center gap-2 py-2 text-xs text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
            <span>Initializing security check...</span>
          </div>
        )}
      </div>
    </div>
  );
};
