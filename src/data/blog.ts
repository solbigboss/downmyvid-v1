export interface BlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  imageUrl: string;
  category: string;
  authorEmail: string;
  published: boolean;
  publishedAt: string;
  updatedAt: string;
}

export const BLOG_ADMIN_EMAIL = 'journeysailblog@gmail.com';
