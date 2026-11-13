import { Language } from '../types';

export interface PlatformConfig {
  slug: 'instagram' | 'tiktok' | 'facebook' | 'threads';
  name: string;
  badge: Record<Language, string>;
  title: Record<Language, string>;
  subtitle: Record<Language, string>;
  placeholder: Record<Language, string>;
  primaryColor: string;
  themeClass: {
    badgeBg: string;
    badgeText: string;
    buttonBg: string;
    buttonHover: string;
    cardBorder: string;
    accentGradient: string;
    dotColor: string;
  };
  sampleUrl: string;
  sampleLabel: string;
  features: Record<Language, string[]>;
}

export const PLATFORMS_CONFIG: Record<'instagram' | 'tiktok' | 'facebook' | 'threads', PlatformConfig> = {
  facebook: {
    slug: 'facebook',
    name: 'Facebook',
    badge: {
      en: 'Facebook Video & Reels Downloader',
      fr: 'Téléchargeur de Vidéos & Reels Facebook',
      es: 'Descargador de Videos y Reels de Facebook',
      ar: 'محمل فيديوهات وريلز فيسبوك',
    },
    title: {
      en: 'Facebook Video Downloader (FB HD MP4)',
      fr: 'Téléchargeur de Vidéo Facebook (FB HD MP4)',
      es: 'Descargador de Videos de Facebook (FB HD MP4)',
      ar: 'تحميل فيديو فيسبوك بجودة عالية (FB Video Downloader)',
    },
    subtitle: {
      en: 'Download public Facebook videos, Reels, and Watch clips in 1080p Full HD or convert to MP3 audio without watermarks.',
      fr: 'Téléchargez des vidéos publiques Facebook, des Reels et des clips Watch en Full HD 1080p ou convertissez-les en audio MP3.',
      es: 'Descarga videos públicos de Facebook, Reels y clips de Watch en 1080p Full HD o conviértelos a audio MP3.',
      ar: 'قم بتنزيل مقاطع فيديو فيسبوك العامة والريلز ومقاطع Watch بجودة Full HD 1080p أو استخرج الصوت بصيغة MP3 بسرعة فائقة.',
    },
    placeholder: {
      en: 'Paste Facebook video link (e.g. https://www.facebook.com/watch?v=...)',
      fr: 'Collez le lien de la vidéo Facebook (ex. https://www.facebook.com/watch?v=...)',
      es: 'Pega el enlace de video de Facebook (ej. https://www.facebook.com/watch?v=...)',
      ar: 'الصق رابط فيديو فيسبوك (مثال: https://www.facebook.com/watch?v=...)',
    },
    primaryColor: '#1877F2',
    themeClass: {
      badgeBg: 'bg-[#E7F3FF] dark:bg-[#1877F2]/20',
      badgeText: 'text-[#1877F2]',
      buttonBg: 'bg-[#1877F2] hover:bg-[#166fe5]',
      buttonHover: 'hover:bg-[#166fe5]',
      cardBorder: 'border-[#1877F2]/30',
      accentGradient: 'from-[#1877F2] to-[#0866FF]',
      dotColor: '#1877F2',
    },
    sampleUrl: 'https://www.facebook.com/watch?v=108927491823901',
    sampleLabel: 'FB Documentary Clip',
    features: {
      en: ['1080p Full HD & 720p HD Quality', 'Facebook Watch & Reels Support', 'Extract Clean 320kbps MP3 Audio', '100% Free with No Software Required'],
      fr: ['Qualité 1080p Full HD et 720p', 'Prise en charge de Facebook Watch et Reels', 'Extraction audio MP3 320kbps', '100% gratuit sans installation'],
      es: ['Calidad 1080p Full HD y 720p', 'Compatible con Facebook Watch y Reels', 'Extrae audio MP3 a 320kbps', '100% gratis sin programas'],
      ar: ['دقة عالية 1080p Full HD و 720p', 'دعم كامل لمقاطع فيسبوك Watch والريلز', 'استخراج صوت MP3 نقي 320kbps', 'مجاني بالكامل وبدون برامج إضافية'],
    },
  },

  instagram: {
    slug: 'instagram',
    name: 'Instagram',
    badge: {
      en: 'Instagram Reels, Stories & Video Downloader',
      fr: 'Téléchargeur de Reels, Stories & Vidéos Instagram',
      es: 'Descargador de Reels, Stories y Videos de Instagram',
      ar: 'محمل ريلز، ستوري وفيديوهات إنستغرام',
    },
    title: {
      en: 'Instagram Video & Reels Downloader',
      fr: 'Téléchargeur de Vidéos & Reels Instagram',
      es: 'Descargador de Videos y Reels de Instagram',
      ar: 'تحميل ريلز ومقاطع فيديو إنستغرام بجودة عالية',
    },
    subtitle: {
      en: 'Save Instagram Reels, video posts, and IGTV clips in original high resolution straight to your phone gallery or computer.',
      fr: 'Enregistrez les Reels, publications vidéo et clips IGTV Instagram en haute résolution directement sur votre téléphone.',
      es: 'Guarda Reels de Instagram, publicaciones de video y clips de IGTV en alta resolución original directamente en tu galería.',
      ar: 'احفظ مقاطع ريلز إنستغرام والمنشورات المرئية بجودتها الأصلية العالية مباشرة في معرض هاتفك أو حاسوبك.',
    },
    placeholder: {
      en: 'Paste Instagram Reel or Video link (e.g. https://www.instagram.com/reel/...)',
      fr: 'Collez le lien Instagram Reel ou Vidéo (ex. https://www.instagram.com/reel/...)',
      es: 'Pega el enlace de Reel o video de Instagram (ej. https://www.instagram.com/reel/...)',
      ar: 'الصق رابط ريلز أو فيديو إنستغرام (مثال: https://www.instagram.com/reel/...)',
    },
    primaryColor: '#E1306C',
    themeClass: {
      badgeBg: 'bg-[#FDE8EF] dark:bg-[#E1306C]/20',
      badgeText: 'text-[#E1306C]',
      buttonBg: 'bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F56040] hover:opacity-95',
      buttonHover: 'hover:opacity-95',
      cardBorder: 'border-[#E1306C]/30',
      accentGradient: 'from-[#833AB4] via-[#FD1D1D] to-[#F56040]',
      dotColor: '#E1306C',
    },
    sampleUrl: 'https://www.instagram.com/reel/C28919241908/',
    sampleLabel: 'Travel Reel Highlight',
    features: {
      en: ['Original Full HD Resolution', 'Fast Instagram Reels & Carousel Downloader', 'Save Audio Soundtracks as MP3', 'Compatible with iOS Camera Roll & Android'],
      fr: ['Résolution Full HD d\'origine', 'Téléchargement rapide de Reels & Carrousels', 'Enregistrement audio en MP3', 'Compatible avec iOS et Android'],
      es: ['Resolución Full HD original', 'Descarga rápida de Reels y Carruseles', 'Guarda pistas de audio en MP3', 'Compatible con iOS y Android'],
      ar: ['جودة Full HD الأصلية بدون تقليل الدقة', 'تحميل فوري لريلز ومنشورات إنستغرام', 'حفظ المقاطع الصوتية بصيغة MP3', 'حفظ مباشر في ألبوم الكاميرا للآيفون والأندرويد'],
    },
  },

  tiktok: {
    slug: 'tiktok',
    name: 'TikTok',
    badge: {
      en: 'TikTok Video Downloader Without Watermark',
      fr: 'Téléchargeur de Vidéos TikTok Sans Filigrane',
      es: 'Descargador de Videos de TikTok Sin Marca de Agua',
      ar: 'تحميل فيديو تيك توك بدون علامة مائية (No Watermark)',
    },
    title: {
      en: 'TikTok Video Downloader (No Watermark HD)',
      fr: 'Téléchargeur TikTok Sans Filigrane (HD MP4)',
      es: 'Descargador de TikTok Sin Marca de Agua (HD MP4)',
      ar: 'تحميل فيديوهات تيك توك بدون علامة مائية بجودة HD',
    },
    subtitle: {
      en: 'Download clean TikTok videos in high-definition MP4 without any watermark or blur, or extract the background audio as MP3.',
      fr: 'Téléchargez des vidéos TikTok en MP4 haute définition sans filigrane ni flou, ou extrayez l\'audio en MP3.',
      es: 'Descarga videos limpios de TikTok en MP4 de alta definición sin marcas de agua ni desenfoque, o extrae el audio como MP3.',
      ar: 'قم بتنزيل مقاطع تيك توك الأصلية بصيغة MP4 عالية الدقة بدون أي علامة مائية، أو استخرج الصوت والموسيقى كملف MP3.',
    },
    placeholder: {
      en: 'Paste TikTok video link (e.g. https://www.tiktok.com/@user/video/...)',
      fr: 'Collez le lien TikTok (ex. https://www.tiktok.com/@user/video/...)',
      es: 'Pega el enlace de TikTok (ej. https://www.tiktok.com/@user/video/...)',
      ar: 'الصق رابط فيديو تيك توك (مثال: https://www.tiktok.com/@user/video/...)',
    },
    primaryColor: '#00F2FE',
    themeClass: {
      badgeBg: 'bg-[#E6FDFF] dark:bg-[#00F2FE]/20',
      badgeText: 'text-[#00F2FE] dark:text-[#00F2FE]',
      buttonBg: 'bg-gradient-to-r from-[#00F2FE] to-[#FE2C55] text-black font-extrabold hover:opacity-90',
      buttonHover: 'hover:opacity-90',
      cardBorder: 'border-[#00F2FE]/30',
      accentGradient: 'from-[#00F2FE] via-black to-[#FE2C55]',
      dotColor: '#00F2FE',
    },
    sampleUrl: 'https://www.tiktok.com/@tiktok/video/7106594312292453675',
    sampleLabel: 'Viral Creative Clip',
    features: {
      en: ['100% Free of TikTok Watermark', 'Ultra Fast CDN Server Pipeline', 'Download Original TikTok Sound (MP3)', 'No Registration & Unlimited Downloads'],
      fr: ['100% sans filigrane TikTok', 'Serveurs CDN ultra rapides', 'Télécharger le son TikTok original (MP3)', 'Sans inscription et illimité'],
      es: ['100% sin marca de agua de TikTok', 'Servidores CDN ultrarrápidos', 'Descarga el sonido original de TikTok en MP3', 'Sin registro y descargas ilimitadas'],
      ar: ['خالٍ تماماً من العلامة المائية وشعار تيك توك', 'سيرفرات فائقة السرعة للتحميل المباشر', 'تحميل الصوت والموسيقى الأصلية بصيغة MP3', 'تحميل مجاني غير محدود بدون تسجيل'],
    },
  },

  threads: {
    slug: 'threads',
    name: 'Threads',
    badge: {
      en: 'Threads Video & Media Downloader',
      fr: 'Téléchargeur de Vidéos Threads',
      es: 'Descargador de Videos de Threads',
      ar: 'محمل فيديوهات ووسائط ثريدز (Threads)',
    },
    title: {
      en: 'Threads Video Downloader (Clean MP4)',
      fr: 'Téléchargeur de Vidéo Threads (MP4 Propre)',
      es: 'Descargador de Videos de Threads (MP4 Limpio)',
      ar: 'تحميل فيديوهات ثريدز بجودة عالية (Threads Video Downloader)',
    },
    subtitle: {
      en: 'Download videos, voice recordings, and animated clips from Threads posts in original quality directly to your phone or desktop.',
      fr: 'Téléchargez des vidéos, des enregistrements vocaux et des clips animés de Threads en qualité d\'origine.',
      es: 'Descarga videos, grabaciones de voz y clips animados de publicaciones de Threads en calidad original.',
      ar: 'قم بتنزيل مقاطع الفيديو والتسجيلات الصوتية والوسائط من منصة ثريدز بجودتها الأصلية بدون علامة مائية.',
    },
    placeholder: {
      en: 'Paste Threads link (e.g. https://www.threads.net/@user/post/...)',
      fr: 'Collez le lien Threads (ex. https://www.threads.net/@user/post/...)',
      es: 'Pega el enlace de Threads (ej. https://www.threads.net/@user/post/...)',
      ar: 'الصق رابط ثريدز (مثال: https://www.threads.net/@user/post/...)',
    },
    primaryColor: '#101010',
    themeClass: {
      badgeBg: 'bg-[#F2F2F2] dark:bg-white/10',
      badgeText: 'text-[#101010] dark:text-white',
      buttonBg: 'bg-black hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200',
      buttonHover: 'hover:bg-neutral-800',
      cardBorder: 'border-neutral-300 dark:border-neutral-700',
      accentGradient: 'from-neutral-900 to-black',
      dotColor: '#A855F7',
    },
    sampleUrl: 'https://www.threads.com/@nasa/post/Dfc_lfaAgnE',
    sampleLabel: 'NASA Space Clip',
    features: {
      en: ['Preserve Native 1080p Video Clarity', 'Direct Threads CDN Extraction', 'Audio Voice Note Extraction to MP3', 'Fast & Safe with Zero Log Policy'],
      fr: ['Conserve la clarté vidéo 1080p', 'Extraction directe depuis le CDN Threads', 'Extraction de notes vocales en MP3', 'Rapide et sécurisé sans journaux'],
      es: ['Conserva la claridad nativa en 1080p', 'Extracción directa del CDN de Threads', 'Extracción de notas de voz a MP3', 'Rápido y seguro sin registros'],
      ar: ['حفظ الفيديو بالدقة الكاملة 1080p الأصلية', 'استخراج مباشر من خوادم ثريدز السريعة', 'استخراج التسجيلات الصوتية بصيغة MP3', 'أمان وخصوصية تامة بدون حفظ سجلات'],
    },
  },
};
