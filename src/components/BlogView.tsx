import React, { useEffect, useState } from 'react';
import { ArrowLeft, Calendar, Image as ImageIcon, LoaderCircle } from 'lucide-react';
import { BlogPost } from '../data/blog';
import { getPublishedPost, listPublishedPosts } from '../services/blogService';

interface BlogViewProps { slug?: string; onBack: () => void; onOpenPost: (slug: string) => void; }

function dateLabel(value: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : '';
}

export const BlogView: React.FC<BlogViewProps> = ({ slug, onBack, onOpenPost }) => {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setError(null); setPost(null); setPosts([]);
    const task = slug ? getPublishedPost(slug).then(setPost) : listPublishedPosts().then(setPosts);
    task.catch((err) => setError(err instanceof Error ? err.message : 'Unable to load the blog right now.')).finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!slug || !post) return;
    document.title = `${post.title} | DownMyVid Blog`;
    const description = document.querySelector('meta[name="description"]');
    description?.setAttribute('content', post.excerpt);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://downmyvid.com/blog/${encodeURIComponent(post.slug)}`);
    let socialTitle = document.querySelector('meta[property="og:title"]');
    if (socialTitle) socialTitle.setAttribute('content', `${post.title} | DownMyVid Blog`);
    let socialDescription = document.querySelector('meta[property="og:description"]');
    if (socialDescription) socialDescription.setAttribute('content', post.excerpt);
    let socialImage = document.querySelector('meta[property="og:image"]');
    if (socialImage && post.imageUrl) socialImage.setAttribute('content', post.imageUrl);
  }, [slug, post]);

  if (loading) return <section className="max-w-5xl mx-auto px-4 py-20 text-center"><LoaderCircle className="w-8 h-8 animate-spin mx-auto text-[#1d9bf0]" /></section>;
  if (error) return <section className="max-w-3xl mx-auto px-4 py-20 text-center"><p className="text-red-600">{error}</p><button onClick={onBack} className="mt-5 text-[#1d9bf0] font-bold">Back to DownMyVid</button></section>;

  if (slug) {
    return <article className="max-w-3xl mx-auto px-4 py-10">
      <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-bold text-[#536471] hover:text-[#1d9bf0]"><ArrowLeft className="w-4 h-4" /> Blog</button>
      {post ? <>
        {post.imageUrl && <img src={post.imageUrl} alt="" className="mt-7 w-full max-h-[420px] object-cover rounded-3xl" />}
        <h1 className="mt-7 text-3xl sm:text-5xl font-black tracking-tight">{post.title}</h1>
        <p className="mt-3 text-sm text-[#536471] flex items-center gap-2"><Calendar className="w-4 h-4" /> {dateLabel(post.publishedAt)}</p>
        <div className="mt-8 whitespace-pre-wrap text-base leading-8 text-[#536471] dark:text-[#cfd9de]">{post.body}</div>
      </> : <p className="mt-10 text-[#536471]">This post was not found.</p>}
    </article>;
  }

  return <section className="max-w-5xl mx-auto px-4 py-10">
    <div className="max-w-2xl mb-10"><p className="text-sm font-bold text-[#1d9bf0]">DownMyVid Blog</p><h1 className="mt-2 text-4xl sm:text-5xl font-black tracking-tight">AI, gaming, creator tools, and internet news</h1><p className="mt-4 text-[#536471] dark:text-[#8b98a5]">Practical guides and news for people who create, watch, and save media online.</p></div>
    {posts.length === 0 ? <div className="rounded-3xl border border-dashed border-[#cfd9de] p-10 text-center text-[#536471]"><ImageIcon className="w-8 h-8 mx-auto mb-3" /><p>New posts are coming soon.</p></div> : <div className="grid gap-5 sm:grid-cols-2">
      {posts.map(item => <button key={item.id} onClick={() => onOpenPost(item.slug)} className="text-left rounded-3xl overflow-hidden border border-[#cfd9de] dark:border-[#2f3336] bg-white dark:bg-[#15202b] hover:border-[#1d9bf0] transition-colors">
        {item.imageUrl ? <img src={item.imageUrl} alt="" className="w-full h-48 object-cover" /> : <div className="h-48 bg-[#e8f5fe] dark:bg-[#1e2732] flex items-center justify-center"><ImageIcon className="w-10 h-10 text-[#1d9bf0]" /></div>}
        <div className="p-5"><p className="text-xs text-[#536471]">{dateLabel(item.publishedAt)}</p><h2 className="mt-2 text-xl font-black">{item.title}</h2><p className="mt-2 text-sm text-[#536471] dark:text-[#8b98a5]">{item.excerpt}</p></div>
      </button>)}
    </div>}
  </section>;
};
