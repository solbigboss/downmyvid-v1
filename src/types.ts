export type Language = 'en' | 'fr' | 'es' | 'ar';

export type ThemeMode = 'system' | 'dark' | 'light';

export type PlatformType = 'x' | 'instagram' | 'tiktok' | 'facebook' | 'threads' | 'youtube';

export type XDownloadCategory = 'video' | 'stream' | 'spaces';

export type ActiveTab = 'home' | 'mp3' | 'batch' | 'guides' | 'faq' | 'history' | 'instagram' | 'tiktok' | 'facebook' | 'threads' | 'youtube' | 'blog' | 'admin';

export interface MediaFormat {
  id: string;
  label: string;
  type: 'video' | 'audio' | 'gif';
  quality: string;
  resolution?: string;
  bitrate?: string;
  sizeMb: number;
  format: string;
  fps?: number;
  isPopular?: boolean;
  directUrl?: string;
}

export interface TweetMediaData {
  id: string;
  originalUrl: string;
  author: {
    name: string;
    handle: string;
    avatar: string;
    verified: boolean;
  };
  tweetText: string;
  publishedAt: string;
  durationSeconds: number;
  viewCount: string;
  likeCount: string;
  retweetCount: string;
  thumbnailUrl: string;
  videoUrl: string;
  audioUrl?: string;
  isSpaces?: boolean;
  formats: MediaFormat[];
}

export interface DownloadHistoryItem {
  id: string;
  title: string;
  authorHandle: string;
  thumbnailUrl: string;
  format: string;
  quality: string;
  sizeMb: number;
  downloadedAt: number;
  originalUrl: string;
  mediaType: 'video' | 'audio';
}

export type CommentStatus = 'approved' | 'pending' | 'rejected' | 'spam';

export interface BlogComment {
  id: string;
  post_slug: string;
  parent_id: string | null;
  guest_name: string;
  content: string;
  status: CommentStatus;
  created_at: string;
  updated_at?: string;
  reply_count?: number;
  replies?: BlogComment[];
}

export interface CreateCommentDTO {
  post_slug: string;
  parent_id?: string | null;
  guest_name?: string;
  content: string;
  website?: string; // Honeypot field for bot trapping
}
