import React from 'react';
import { Language } from '../types';

interface FlagIconProps {
  code: Language;
  className?: string;
  label?: string;
}

export const FlagIcon: React.FC<FlagIconProps> = ({ code, className = 'w-6 h-4', label }) => {
  const ariaLabel =
    label ||
    (code === 'en' ? 'English' : code === 'fr' ? 'Français' : code === 'es' ? 'Español' : 'العربية');

  switch (code) {
    case 'en':
      return (
        <svg
          viewBox="0 0 24 16"
          className={`${className} rounded-[3px] shrink-0 shadow-2xs ring-1 ring-black/10 dark:ring-white/15`}
          role="img"
          aria-label={ariaLabel}
        >
          <rect width="24" height="16" fill="#FFFFFF" />
          <rect y="0" width="24" height="1.23" fill="#B22234" />
          <rect y="2.46" width="24" height="1.23" fill="#B22234" />
          <rect y="4.92" width="24" height="1.23" fill="#B22234" />
          <rect y="7.38" width="24" height="1.23" fill="#B22234" />
          <rect y="9.84" width="24" height="1.23" fill="#B22234" />
          <rect y="12.3" width="24" height="1.23" fill="#B22234" />
          <rect y="14.77" width="24" height="1.23" fill="#B22234" />
          <rect width="10.5" height="8.61" fill="#3C3B6E" />
          <circle cx="2" cy="1.7" r="0.5" fill="#FFFFFF" />
          <circle cx="4.2" cy="1.7" r="0.5" fill="#FFFFFF" />
          <circle cx="6.4" cy="1.7" r="0.5" fill="#FFFFFF" />
          <circle cx="8.6" cy="1.7" r="0.5" fill="#FFFFFF" />
          <circle cx="3.1" cy="3.4" r="0.5" fill="#FFFFFF" />
          <circle cx="5.3" cy="3.4" r="0.5" fill="#FFFFFF" />
          <circle cx="7.5" cy="3.4" r="0.5" fill="#FFFFFF" />
          <circle cx="2" cy="5.1" r="0.5" fill="#FFFFFF" />
          <circle cx="4.2" cy="5.1" r="0.5" fill="#FFFFFF" />
          <circle cx="6.4" cy="5.1" r="0.5" fill="#FFFFFF" />
          <circle cx="8.6" cy="5.1" r="0.5" fill="#FFFFFF" />
          <circle cx="3.1" cy="6.8" r="0.5" fill="#FFFFFF" />
          <circle cx="5.3" cy="6.8" r="0.5" fill="#FFFFFF" />
          <circle cx="7.5" cy="6.8" r="0.5" fill="#FFFFFF" />
        </svg>
      );

    case 'fr':
      return (
        <svg
          viewBox="0 0 24 16"
          className={`${className} rounded-[3px] shrink-0 shadow-2xs ring-1 ring-black/10 dark:ring-white/15`}
          role="img"
          aria-label={ariaLabel}
        >
          <rect x="0" width="8" height="16" fill="#002395" />
          <rect x="8" width="8" height="16" fill="#FFFFFF" />
          <rect x="16" width="8" height="16" fill="#ED2939" />
        </svg>
      );

    case 'es':
      return (
        <svg
          viewBox="0 0 24 16"
          className={`${className} rounded-[3px] shrink-0 shadow-2xs ring-1 ring-black/10 dark:ring-white/15`}
          role="img"
          aria-label={ariaLabel}
        >
          <rect width="24" height="4" y="0" fill="#AA151B" />
          <rect width="24" height="8" y="4" fill="#F1BF00" />
          <rect width="24" height="4" y="12" fill="#AA151B" />
          <rect x="5.5" y="5.6" width="3" height="4.4" rx="1" fill="#AA151B" />
          <rect x="6.2" y="6.3" width="1.6" height="2.8" rx="0.4" fill="#F1BF00" />
          <rect x="5.8" y="5.1" width="2.4" height="0.8" rx="0.3" fill="#AA151B" />
        </svg>
      );

    case 'ar':
      return (
        <svg
          viewBox="0 0 24 16"
          className={`${className} rounded-[3px] shrink-0 shadow-2xs ring-1 ring-black/10 dark:ring-white/15`}
          role="img"
          aria-label={ariaLabel}
        >
          <rect width="24" height="16" fill="#006C35" />
          <path
            d="M5.5 5.2h13M6.5 7.4h11M8.2 3.8v2.2m3.4-2.2v2.4m3.8-2.4v2.2"
            stroke="#FFFFFF"
            strokeWidth="1.05"
            strokeLinecap="round"
          />
          <path
            d="M6.5 11.4h10.8l1.2-0.7"
            stroke="#FFFFFF"
            strokeWidth="1.25"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );
  }
};
