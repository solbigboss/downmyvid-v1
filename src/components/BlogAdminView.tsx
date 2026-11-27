import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenter, AlignLeft, AlignRight, Bold, Heading1, Heading2, ImagePlus, Italic,
  Link as LinkIcon, List, LoaderCircle, LogIn, LogOut, Plus, Redo2, Save, Trash2, Undo2,
  FileText, MessageSquare, CheckCircle, XCircle, Ban, ShieldAlert, Search, RefreshCw,
  ExternalLink, CornerDownRight, Clock,
  X, Layers, Newspaper, TrendingUp, Sparkles, Gamepad2, Tag, ChevronLeft, ChevronRight,
  ChevronsLeft, ChevronsRight, Edit3, ArrowRight, Check, SlidersHorizontal
} from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, loginWithGoogle, logoutUser } from '../firebase';
import { BlogPost, BLOG_ADMIN_EMAIL } from '../data/blog';
import { listAdminPosts, removePost, savePost, uploadBlogImage } from '../services/blogService';
import {
  listAllCommentsForAdmin,
  updateCommentStatus,
  deleteComment,
  banCommentAuthor
} from '../services/commentService';
import { MarkdownContent } from './MarkdownContent';
import { Language, BlogComment, CommentStatus } from '../types';
import { blogCopy } from '../data/blogCopy';

const blank = { slug: '', title: '', excerpt: '', body: '', imageUrl: '', category: 'News', published: false };

function makeSlug(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return <>{text}</>;
  const trimmed = query.trim();
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark key={i} className="bg-[#1d9bf0]/30 text-[#78c5f8] dark:text-cyan-300 font-black px-0.5 rounded">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function getNicheTheme(niche: string = '') {
  const n = niche.toLowerCase().trim();
  if (n === 'ai' || n.includes('ai') || n.includes('artificial') || n.includes('intelligence')) {
    return {
      label: 'AI',
      badge: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
      activeGradient: 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]',
      icon: Sparkles,
      dot: 'bg-cyan-400',
    };
  }
  if (n === 'finance' || n.includes('finance') || n.includes('crypto') || n.includes('bitcoin') || n.includes('stock')) {
    return {
      label: 'Finance',
      badge: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
      activeGradient: 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-[0_0_15px_rgba(16,185,129,0.4)]',
      icon: TrendingUp,
      dot: 'bg-emerald-400',
    };
  }
  if (n === 'games' || n.includes('game') || n.includes('gaming')) {
    return {
      label: 'Games',
      badge: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
      activeGradient: 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]',
      icon: Gamepad2,
      dot: 'bg-purple-400',
    };
  }
  if (n === 'news' || n.includes('news')) {
    return {
      label: 'News',
      badge: 'bg-sky-500/15 text-sky-400 border border-sky-500/30',
      activeGradient: 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-[0_0_15px_rgba(14,165,233,0.4)]',
      icon: Newspaper,
      dot: 'bg-sky-400',
    };
  }
  if (n === 'all') {
    return {
      label: 'All Niches',
      badge: 'bg-slate-800 text-slate-300 border border-white/10',
      activeGradient: 'bg-gradient-to-r from-[#1d9bf0] to-[#007bff] text-white shadow-[0_0_15px_rgba(29,155,240,0.4)]',
      icon: Layers,
      dot: 'bg-[#1d9bf0]',
    };
  }
  return {
    label: niche || 'Other',
    badge: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30',
    activeGradient: 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)]',
    icon: Tag,
    dot: 'bg-indigo-400',
  };
}

interface BlogAdminViewProps { currentLang: Language; }

export const BlogAdminView: React.FC<BlogAdminViewProps> = ({ currentLang }) => {
  const copy = blogCopy[currentLang];
  const isRtl = currentLang === 'ar';
  const [user, setUser] = useState<User | null>(auth.currentUser);

  // Tabs: 'posts' | 'comments'
  const [activeTab, setActiveTab] = useState<'posts' | 'comments'>('posts');

  // Posts State
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState(blank);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Articles Search, Filtering by Niches & Pagination State
  const [postSearch, setPostSearch] = useState('');
  const [postCategory, setPostCategory] = useState<string>('all');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const [highlightedPostId, setHighlightedPostId] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Comments Moderation State
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [commentFilter, setCommentFilter] = useState<'all' | CommentStatus>('all');
  const [commentSearch, setCommentSearch] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentActionId, setCommentActionId] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

  // Dismiss suggestions on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const updateBody = (nextBody: string) => {
    setUndoStack(stack => [...stack.slice(-99), form.body]);
    setRedoStack([]);
    setForm(current => ({ ...current, body: nextBody }));
  };

  const undoBody = () => {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack(stack => stack.slice(0, -1));
    setRedoStack(stack => [...stack, form.body]);
    setForm(current => ({ ...current, body: previous }));
  };

  const redoBody = () => {
    if (!redoStack.length) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(stack => stack.slice(0, -1));
    setUndoStack(stack => [...stack, form.body]);
    setForm(current => ({ ...current, body: next }));
  };

  const insertMarkdown = (prefix: string, suffix = '', placeholder = 'text') => {
    const textarea = bodyRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = form.body.slice(start, end) || placeholder;
    const nextBody = `${form.body.slice(0, start)}${prefix}${selected}${suffix}${form.body.slice(end)}`;
    updateBody(nextBody);
    window.requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + prefix.length + selected.length + suffix.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  };

  const insertAlignment = (alignment: 'left' | 'center' | 'right') => {
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? form.body.length;
    const end = textarea?.selectionEnd ?? form.body.length;
    const selected = form.body.slice(start, end).trim() || 'Write your text here';
    const nextBody = `${form.body.slice(0, start)}[align:${alignment}]\n${selected}\n[/align]${form.body.slice(end)}`;
    updateBody(nextBody);
  };

  const insertImageMarkdown = () => {
    const rawUrl = window.prompt('Paste a direct image URL (https://…)');
    if (!rawUrl) return;
    try {
      const imageUrl = new URL(rawUrl.trim());
      if (imageUrl.protocol !== 'https:') throw new Error('Use an HTTPS image URL.');
      const textarea = bodyRef.current;
      const cursor = textarea?.selectionStart ?? form.body.length;
      updateBody(`${form.body.slice(0, cursor)}![Image description](${imageUrl.href})\n${form.body.slice(cursor)}`);
    } catch {
      setMessage('Please enter a valid HTTPS image URL.');
    }
  };

  const isAdmin = user?.email?.toLowerCase() === BLOG_ADMIN_EMAIL;

  const refreshPosts = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try { setPosts(await listAdminPosts()); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load posts.'); }
    finally { setLoading(false); }
  };

  const refreshComments = async () => {
    if (!isAdmin) return;
    setCommentsLoading(true);
    try {
      const data = await listAllCommentsForAdmin(commentFilter);
      setComments(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load comments.');
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void refreshPosts();
      void refreshComments();
    }
  }, [isAdmin, commentFilter]);

  const edit = (post: BlogPost) => {
    setEditingId(post.id);
    setForm({ slug: post.slug, title: post.title, excerpt: post.excerpt, body: post.body, imageUrl: post.imageUrl, category: post.category || 'News', published: post.published });
    setUndoStack([]);
    setRedoStack([]);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const reset = () => { setEditingId(undefined); setForm(blank); setUndoStack([]); setRedoStack([]); setMessage(null); if (fileRef.current) fileRef.current.value = ''; };

  const onSave = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setMessage(null);
    try { await savePost({ ...form, id: editingId }); await refreshPosts(); reset(); setMessage('Post saved.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save the post.'); }
    finally { setLoading(false); }
  };

  const onImage = async (file?: File) => {
    if (!file) return;
    setLoading(true); setMessage('Uploading image…');
    try { const imageUrl = await uploadBlogImage(file); setForm(current => ({ ...current, imageUrl })); setMessage('Image uploaded.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Image upload failed. Check Firebase Storage setup and billing eligibility.'); }
    finally { setLoading(false); }
  };

  const onDelete = async (post: BlogPost) => {
    if (!window.confirm(`Delete “${post.title}”?`)) return;
    setLoading(true); setMessage(null);
    try { await removePost(post); await refreshPosts(); if (editingId === post.id) reset(); setMessage('Post deleted.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to delete post.'); }
    finally { setLoading(false); }
  };

  // Comment Moderation Handlers
  const handleCommentStatus = async (commentId: string, nextStatus: CommentStatus) => {
    setCommentActionId(commentId);
    setMessage(null);
    try {
      await updateCommentStatus(commentId, nextStatus);
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, status: nextStatus } : c));
      setMessage(`Comment status updated to "${nextStatus}".`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update comment status.');
    } finally {
      setCommentActionId(null);
    }
  };

  const handleCommentDelete = async (comment: BlogComment) => {
    if (!window.confirm(`Permanently delete comment by "${comment.guest_name}" and its replies?`)) return;
    setCommentActionId(comment.id);
    setMessage(null);
    try {
      await deleteComment(comment.id);
      setComments(prev => prev.filter(c => c.id !== comment.id && c.parent_id !== comment.id));
      setMessage('Comment permanently deleted.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to delete comment.');
    } finally {
      setCommentActionId(null);
    }
  };

  const handleBanAuthor = async (guestName: string) => {
    if (!window.confirm(`Mark ALL comments by "${guestName}" as spam/banned?`)) return;
    setMessage(null);
    try {
      const count = await banCommentAuthor(guestName);
      setComments(prev => prev.map(c => c.guest_name.toLowerCase() === guestName.toLowerCase() ? { ...c, status: 'spam' } : c));
      setMessage(`Marked ${count} comment(s) by "${guestName}" as spam.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to ban author.');
    }
  };

  if (!user) return <section dir={isRtl ? 'rtl' : 'ltr'} className="max-w-xl mx-auto px-4 py-20 text-center"><h1 className="text-3xl font-black">{copy.admin}</h1><p className="mt-3 text-[#536471]">{copy.signInHelp}</p><button onClick={() => void loginWithGoogle().catch(error => setMessage(error.message))} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#1d9bf0] px-5 py-3 font-bold text-white"><LogIn className="w-4 h-4" /> {copy.signIn}</button>{message && <p role="alert" className="mt-4 text-sm text-red-600">{message}</p>}</section>;
  if (!isAdmin) return <section dir={isRtl ? 'rtl' : 'ltr'} className="max-w-xl mx-auto px-4 py-20 text-center"><h1 className="text-3xl font-black">{copy.accessRestricted}</h1><button onClick={() => void logoutUser()} className="mt-6 inline-flex items-center gap-2 rounded-xl border px-4 py-2"><LogOut className="w-4 h-4" /> {copy.signOut}</button></section>;

  // Counts for comments
  const pendingCount = comments.filter(c => c.status === 'pending').length;
  const approvedCount = comments.filter(c => c.status === 'approved').length;
  const spamCount = comments.filter(c => c.status === 'spam').length;
  const rejectedCount = comments.filter(c => c.status === 'rejected').length;

  const filteredComments = comments.filter(c => {
    if (commentFilter !== 'all' && c.status !== commentFilter) return false;
    if (commentSearch.trim()) {
      const q = commentSearch.toLowerCase();
      const matchName = c.guest_name.toLowerCase().includes(q);
      const matchText = c.content.toLowerCase().includes(q);
      const matchSlug = c.post_slug.toLowerCase().includes(q);
      return matchName || matchText || matchSlug;
    }
    return true;
  });

  // Article Niches: Standard requested niches plus any custom categories from existing posts
  const standardNiches = ['all', 'News', 'Finance', 'AI', 'Games'];
  const dynamicNiches = Array.from(
    new Set(
      posts
        .map(p => (p.category || '').trim())
        .filter(c => Boolean(c) && !['news', 'finance', 'ai', 'games'].includes(c.toLowerCase()))
    )
  );
  const availableNiches = [...standardNiches, ...dynamicNiches];

  const getNicheCount = (niche: string) => {
    if (niche === 'all') return posts.length;
    const target = niche.toLowerCase();
    return posts.filter(p => {
      const cat = (p.category || '').trim().toLowerCase();
      if (target === 'ai') return cat === 'ai' || cat.includes('ai') || cat.includes('artificial');
      if (target === 'games') return cat === 'games' || cat.includes('game');
      if (target === 'finance') return cat === 'finance' || cat.includes('finance') || cat.includes('crypto') || cat.includes('bitcoin');
      if (target === 'news') return cat === 'news' || cat.includes('news');
      return cat === target;
    }).length;
  };

  const filteredPosts = posts.filter(post => {
    // 1. Niche / Category filter
    if (postCategory !== 'all') {
      const cat = (post.category || '').trim().toLowerCase();
      const target = postCategory.toLowerCase();
      let matches = false;
      if (target === 'ai') {
        matches = cat === 'ai' || cat.includes('ai') || cat.includes('artificial');
      } else if (target === 'games') {
        matches = cat === 'games' || cat.includes('game');
      } else if (target === 'finance') {
        matches = cat === 'finance' || cat.includes('finance') || cat.includes('crypto') || cat.includes('bitcoin');
      } else if (target === 'news') {
        matches = cat === 'news' || cat.includes('news');
      } else {
        matches = cat === target;
      }
      if (!matches) return false;
    }

    // 2. Search query filter
    if (postSearch.trim()) {
      const q = postSearch.trim().toLowerCase();
      const matchTitle = (post.title || '').toLowerCase().includes(q);
      const matchSlug = (post.slug || '').toLowerCase().includes(q);
      const matchCat = (post.category || '').toLowerCase().includes(q);
      const matchExcerpt = (post.excerpt || '').toLowerCase().includes(q);
      return matchTitle || matchSlug || matchCat || matchExcerpt;
    }

    return true;
  });

  // Live suggestions when typing in search bar (top 6 matches)
  const searchSuggestions = postSearch.trim()
    ? posts.filter(post => {
        const q = postSearch.trim().toLowerCase();
        return (
          (post.title || '').toLowerCase().includes(q) ||
          (post.slug || '').toLowerCase().includes(q) ||
          (post.category || '').toLowerCase().includes(q)
        );
      }).slice(0, 6)
    : [];

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / pageSize));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedPosts = filteredPosts.slice(startIndex, startIndex + pageSize);

  const getPageNumbers = (current: number, total: number) => {
    if (total <= 6) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    const pages: (number | string)[] = [];
    if (current <= 3) {
      pages.push(1, 2, 3, 4, '...', total);
    } else if (current >= total - 2) {
      pages.push(1, '...', total - 3, total - 2, total - 1, total);
    } else {
      pages.push(1, '...', current - 1, current, current + 1, '...', total);
    }
    return pages;
  };

  return (
    <section dir={isRtl ? 'rtl' : 'ltr'} className={`max-w-6xl mx-auto px-4 py-10 ${isRtl ? 'font-[Cairo]' : ''}`}>
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <p className="text-sm font-medium text-[#536471] dark:text-[#8899a6]">{copy.signedInAs} <strong className="text-white">{user.email}</strong></p>
          </div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white mt-1">Admin Dashboard</h1>
        </div>
        <button
          onClick={() => void logoutUser()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#141b2d] px-4 py-2.5 text-sm font-bold text-[#94a3b8] hover:text-white hover:border-white/20 transition-all shadow-[inset_0px_1px_1px_rgba(255,255,255,0.1),0px_4px_8px_rgba(0,0,0,0.3)]"
        >
          <LogOut className="w-4 h-4" /> {copy.signOut}
        </button>
      </div>

      {/* 3D Tab Switcher */}
      <div className="flex flex-wrap items-center gap-3 mb-8 p-1.5 rounded-2xl bg-[#0f172a] border border-white/10 shadow-[inset_0px_2px_4px_rgba(0,0,0,0.6)]">
        <button
          type="button"
          onClick={() => setActiveTab('posts')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${
            activeTab === 'posts'
              ? 'bg-gradient-to-b from-[#3bb3ff] to-[#007bff] text-white shadow-[0_4px_12px_rgba(0,123,255,0.4),inset_0px_1px_2px_rgba(255,255,255,0.4)]'
              : 'text-[#94a3b8] hover:text-white hover:bg-white/5'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Articles ({posts.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('comments')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-200 ${
            activeTab === 'comments'
              ? 'bg-gradient-to-b from-[#3bb3ff] to-[#007bff] text-white shadow-[0_4px_12px_rgba(0,123,255,0.4),inset_0px_1px_2px_rgba(255,255,255,0.4)]'
              : 'text-[#94a3b8] hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          <span>Comments Moderation ({comments.length})</span>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-black bg-amber-500 text-slate-950 shadow-sm animate-pulse">
              {pendingCount} new
            </span>
          )}
        </button>
      </div>

      {/* Global alert feedback */}
      {message && (
        <div role="status" className="mb-6 flex items-center justify-between p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 text-sm backdrop-blur-md">
          <span>{message}</span>
          <button onClick={() => setMessage(null)} className="text-cyan-400 hover:text-white font-bold ml-4">✕</button>
        </div>
      )}

      {/* TAB 1: ARTICLES MANAGEMENT */}
      {activeTab === 'posts' && (
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <form onSubmit={onSave} className="space-y-4 rounded-3xl border border-[#cfd9de] dark:border-[#2f3336] bg-white dark:bg-[#15202b] p-5 sm:p-7 shadow-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">{editingId ? copy.editPost : copy.newPost}</h2>
              <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-sm font-bold text-[#1d9bf0]">
                <Plus className="w-4 h-4" /> {copy.newPost}
              </button>
            </div>
            <label className="block text-sm font-bold">{copy.titleField}
              <input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value, slug: editingId ? form.slug : makeSlug(e.target.value) })} className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2.5" maxLength={140} />
            </label>
            <label className="block text-sm font-bold">{copy.slugField}
              <input required value={form.slug} onChange={e => setForm({ ...form, slug: makeSlug(e.target.value) })} className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2.5" maxLength={90} />
            </label>
            <div>
              <label className="block text-sm font-bold">{copy.categoryField}
                <input required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="News, Finance, AI, Games" list="niche-suggestions" className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2.5" maxLength={40} />
                <datalist id="niche-suggestions">
                  <option value="News" />
                  <option value="Finance" />
                  <option value="AI" />
                  <option value="Games" />
                </datalist>
              </label>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] uppercase font-bold text-slate-500">Quick niche:</span>
                {['News', 'Finance', 'AI', 'Games'].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, category: cat }))}
                    className={`px-2 py-0.5 rounded-lg text-xs font-bold transition-all ${
                      form.category.toLowerCase() === cat.toLowerCase()
                        ? 'bg-[#1d9bf0] text-white shadow-sm'
                        : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
            <label className="block text-sm font-bold">{copy.excerptField}
              <textarea required value={form.excerpt} onChange={e => setForm({ ...form, excerpt: e.target.value })} className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2.5" rows={3} maxLength={300} />
            </label>
            <div>
              <label htmlFor="blog-article-body" className="block text-sm font-bold">{copy.bodyField}</label>
              <div className="mt-2 flex flex-wrap gap-1 rounded-t-xl border border-b-0 border-[#cfd9de] dark:border-[#2f3336] bg-[#f7f9f9] dark:bg-[#1e2732] p-2" role="toolbar" aria-label="Article formatting">
                <button type="button" title="Undo" aria-label="Undo" disabled={!undoStack.length} onClick={undoBody} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b] disabled:cursor-not-allowed disabled:opacity-40"><Undo2 className="h-4 w-4" /></button>
                <button type="button" title="Redo" aria-label="Redo" disabled={!redoStack.length} onClick={redoBody} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b] disabled:cursor-not-allowed disabled:opacity-40"><Redo2 className="h-4 w-4" /></button>
                <span className="mx-1 h-6 w-px bg-[#cfd9de]" aria-hidden="true" />
                <button type="button" title="Align left" aria-label="Align left" onClick={() => insertAlignment('left')} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b]"><AlignLeft className="h-4 w-4" /></button>
                <button type="button" title="Align center" aria-label="Align center" onClick={() => insertAlignment('center')} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b]"><AlignCenter className="h-4 w-4" /></button>
                <button type="button" title="Align right" aria-label="Align right" onClick={() => insertAlignment('right')} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b]"><AlignRight className="h-4 w-4" /></button>
                <button type="button" title="Heading 1" aria-label="Insert heading 1" onClick={() => insertMarkdown('# ', '', 'Main heading')} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b]"><Heading1 className="h-4 w-4" /></button>
                <button type="button" title="Heading 2" aria-label="Insert heading 2" onClick={() => insertMarkdown('## ', '', 'Section heading')} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b]"><Heading2 className="h-4 w-4" /></button>
                <button type="button" title="Bold" aria-label="Bold selected text" onClick={() => insertMarkdown('**', '**', 'bold text')} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b]"><Bold className="h-4 w-4" /></button>
                <button type="button" title="Italic" aria-label="Italicize selected text" onClick={() => insertMarkdown('*', '*', 'italic text')} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b]"><Italic className="h-4 w-4" /></button>
                <button type="button" title="Link" aria-label="Insert link" onClick={() => insertMarkdown('[', '](https://example.com)', 'link text')} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b]"><LinkIcon className="h-4 w-4" /></button>
                <button type="button" title="Bullet list" aria-label="Insert bullet item" onClick={() => insertMarkdown('- ', '', 'List item')} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b]"><List className="h-4 w-4" /></button>
                <button type="button" title="Insert image URL" aria-label="Insert image URL" onClick={insertImageMarkdown} className="rounded-lg border p-2 hover:bg-white dark:hover:bg-[#15202b]"><ImagePlus className="h-4 w-4" /></button>
              </div>
              <textarea id="blog-article-body" ref={bodyRef} required value={form.body} onChange={e => updateBody(e.target.value)} className="w-full rounded-b-xl border border-[#cfd9de] dark:border-[#2f3336] bg-transparent px-3 py-3 font-mono text-sm leading-6" rows={14} aria-describedby="blog-markdown-help" />
              <p id="blog-markdown-help" className="mt-1 text-xs text-[#536471]">{copy.formattingHelp} {currentLang === 'en' ? 'Alignment applies between [align:left|center|right] and [/align] markers.' : currentLang === 'fr' ? 'L’alignement s’applique entre les marqueurs [align:left|center|right] et [/align].' : currentLang === 'es' ? 'La alineación se aplica entre los marcadores [align:left|center|right] y [/align].' : 'يُطبّق المحاذاة بين العلامتين [align:left|center|right] و[/align].'}</p>
              <details className="mt-3 rounded-xl border border-[#cfd9de] dark:border-[#2f3336] p-3">
                <summary className="cursor-pointer text-sm font-bold">{copy.preview}</summary>
                <MarkdownContent value={form.body} dir={isRtl ? 'rtl' : 'ltr'} className={`mt-4 text-sm text-[#536471] dark:text-[#cfd9de] ${isRtl ? 'font-[Cairo]' : ''}`} />
              </details>
            </div>
            <div>
              <label className="block text-sm font-bold">{copy.coverImage}</label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold"><ImagePlus className="w-4 h-4" /> {copy.uploadImage}</button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => void onImage(e.target.files?.[0])} />
                <input aria-label="Image URL" value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} placeholder={copy.imageUrl} className="min-w-[180px] flex-1 rounded-xl border bg-transparent px-3 py-2" />
              </div>
              {form.imageUrl && <img src={form.imageUrl} alt="Cover preview" className="mt-3 max-h-64 w-full rounded-2xl object-cover" />}
            </div>
            <label className="flex items-center gap-2 text-sm font-bold">
              <input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} /> {copy.publish}
            </label>
            <button disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#1d9bf0] px-5 py-3 font-bold text-white disabled:opacity-60 shadow-[0_4px_12px_rgba(29,155,240,0.4)]">
              {loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {copy.save}
            </button>
          </form>

          {/* Existing Posts List with Search, Niches Filter, Auto-suggestions & Pagination */}
          <aside className="space-y-4">
            {/* Header with Counter and Refresh */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                  {copy.existingPosts}
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-gradient-to-r from-[#1d9bf0] to-[#007bff] text-white shadow-[0_2px_8px_rgba(29,155,240,0.4)]">
                    {posts.length}
                  </span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => void refreshPosts()}
                disabled={loading}
                title="Refresh articles"
                className="p-2 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:border-cyan-500/40 transition-all duration-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              </button>
            </div>

            {/* Search Bar Container with Live Auto-suggestions */}
            <div ref={searchContainerRef} className="relative z-30">
              <div className="relative group">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-[#1d9bf0] transition-colors" />
                <input
                  type="text"
                  placeholder="Search articles by title, slug, niche..."
                  value={postSearch}
                  onFocus={() => setShowSuggestions(true)}
                  onChange={e => {
                    setPostSearch(e.target.value);
                    setCurrentPage(1);
                    setShowSuggestions(true);
                  }}
                  className="w-full bg-[#0b111e] border border-white/10 rounded-2xl pl-10 pr-9 py-2.5 text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#1d9bf0] focus:ring-2 focus:ring-[#1d9bf0]/20 shadow-[inset_0px_2px_4px_rgba(0,0,0,0.6)] transition-all"
                />
                {postSearch && (
                  <button
                    type="button"
                    onClick={() => {
                      setPostSearch('');
                      setShowSuggestions(false);
                      setCurrentPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Auto-suggested Articles Dropdown */}
              {showSuggestions && postSearch.trim() && (
                <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl bg-[#0b111e]/95 backdrop-blur-xl border border-cyan-500/30 shadow-[0_15px_40px_rgba(0,0,0,0.8),0_0_20px_rgba(29,155,240,0.15)] p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="px-3 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-400 border-b border-white/5">
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      Suggested Articles ({searchSuggestions.length})
                    </span>
                    <span className="text-[10px] text-slate-500">Click to edit</span>
                  </div>

                  {searchSuggestions.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400">
                      No articles matching "<strong className="text-white">{postSearch}</strong>"
                    </div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto divide-y divide-white/5 mt-1">
                      {searchSuggestions.map(suggestion => {
                        const theme = getNicheTheme(suggestion.category);
                        const Icon = theme.icon;
                        return (
                          <div
                            key={suggestion.id}
                            onClick={() => {
                              edit(suggestion);
                              setShowSuggestions(false);
                              setHighlightedPostId(suggestion.id);
                              setTimeout(() => setHighlightedPostId(null), 3000);
                              window.scrollTo({ top: 0, behavior: 'smooth' });
                            }}
                            className="p-2.5 rounded-xl hover:bg-white/5 cursor-pointer transition-all flex items-start gap-2.5 group"
                          >
                            <div className={`mt-0.5 p-1 rounded-lg ${theme.badge} shrink-0`}>
                              <Icon className="w-3 h-3" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1">
                                {highlightMatch(suggestion.title, postSearch)}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                                <span className="truncate">/blog/{suggestion.slug}</span>
                                <span>·</span>
                                <span className={suggestion.published ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                                  {suggestion.published ? 'Published' : 'Draft'}
                                </span>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 p-1 rounded-lg bg-[#1d9bf0]/10 text-[#1d9bf0] opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Filter by Niche / Category */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <span className="flex items-center gap-1.5">
                  <SlidersHorizontal className="w-3 h-3 text-[#1d9bf0]" /> Filter by Niche / Category
                </span>
                {postCategory !== 'all' && (
                  <button
                    type="button"
                    onClick={() => { setPostCategory('all'); setCurrentPage(1); }}
                    className="text-[#1d9bf0] hover:underline text-[10px] font-bold normal-case"
                  >
                    Reset filter
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {availableNiches.map(niche => {
                  const theme = getNicheTheme(niche);
                  const Icon = theme.icon;
                  const isSelected = postCategory.toLowerCase() === niche.toLowerCase();
                  const count = getNicheCount(niche);

                  return (
                    <button
                      key={niche}
                      type="button"
                      onClick={() => {
                        setPostCategory(niche);
                        setCurrentPage(1);
                      }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 active:scale-95 ${
                        isSelected
                          ? `${theme.activeGradient} scale-105 shadow-md`
                          : 'bg-[#0f172a] text-slate-400 hover:text-white hover:bg-white/5 border border-white/10'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      <span>{theme.label}</span>
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                        isSelected ? 'bg-black/30 text-white' : 'bg-white/10 text-slate-400'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Top Controls: Range Count & Page Size Selector (10, 25, 50, 100) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-white/5 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span>
                  Showing <strong className="text-white">{filteredPosts.length === 0 ? 0 : startIndex + 1}–{Math.min(startIndex + pageSize, filteredPosts.length)}</strong> of <strong className="text-white">{filteredPosts.length}</strong>
                </span>
                {(postSearch || postCategory !== 'all') && (
                  <span className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 font-semibold">
                    Filtered
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1 bg-[#0b111e] border border-white/10 rounded-xl p-1 shadow-inner self-start sm:self-auto">
                <span className="text-[10px] uppercase font-bold text-slate-500 px-1">Per page:</span>
                {[10, 25, 50, 100].map(size => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setPageSize(size);
                      setCurrentPage(1);
                    }}
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-black transition-all duration-150 ${
                      pageSize === size
                        ? 'bg-gradient-to-r from-[#1d9bf0] to-[#007bff] text-white shadow-[0_2px_8px_rgba(29,155,240,0.5)] scale-105'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Articles List (Max 10 / selected pageSize per page) */}
            <div className="space-y-2.5 min-h-[300px]">
              {loading && (
                <div className="py-12 text-center text-slate-400">
                  <LoaderCircle className="w-6 h-6 animate-spin mx-auto text-[#1d9bf0] mb-2" />
                  <p className="text-xs">{copy.loading}</p>
                </div>
              )}

              {!loading && paginatedPosts.length === 0 && (
                <div className="py-12 text-center rounded-2xl bg-white/5 border border-white/10 p-6">
                  <Search className="w-8 h-8 mx-auto text-slate-500 mb-2 opacity-50" />
                  <p className="text-sm font-bold text-white">No articles found</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {postSearch ? `No results for "${postSearch}".` : 'No articles in this category.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPostSearch('');
                      setPostCategory('all');
                      setCurrentPage(1);
                    }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1d9bf0]/15 text-[#1d9bf0] text-xs font-bold hover:bg-[#1d9bf0]/25 transition-all"
                  >
                    Clear filters
                  </button>
                </div>
              )}

              {!loading && paginatedPosts.map(post => {
                const theme = getNicheTheme(post.category);
                const Icon = theme.icon;
                const isEditing = editingId === post.id;
                const isHighlighted = highlightedPostId === post.id;

                return (
                  <div
                    key={post.id}
                    className={`group relative rounded-2xl border transition-all duration-200 p-3.5 shadow-sm ${
                      isEditing
                        ? 'bg-[#14233c] border-[#1d9bf0] shadow-[0_0_15px_rgba(29,155,240,0.3)] ring-1 ring-[#1d9bf0]'
                        : isHighlighted
                        ? 'bg-[#152a3a] border-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.4)] animate-pulse'
                        : 'bg-white/5 dark:bg-[#15202b] border-white/10 hover:border-cyan-500/40 hover:bg-white/[0.08] hover:translate-x-1'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold ${theme.badge}`}>
                            <Icon className="w-2.5 h-2.5" />
                            {theme.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold ${
                            post.published ? 'text-emerald-400' : 'text-slate-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${post.published ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                            {post.published ? copy.published : copy.draft}
                          </span>
                        </div>

                        <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-snug line-clamp-2 group-hover:text-cyan-300 transition-colors">
                          {highlightMatch(post.title, postSearch)}
                        </h3>

                        <p className="text-[11px] text-[#536471] dark:text-[#8899a6] mt-1 truncate">
                          /blog/{post.slug}
                        </p>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 pt-0.5">
                        <button
                          type="button"
                          onClick={() => edit(post)}
                          title="Edit post"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#1d9bf0]/10 hover:bg-[#1d9bf0] text-[#1d9bf0] hover:text-white text-xs font-bold transition-all shadow-sm"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit</span>
                        </button>
                        <a
                          href={`/blog/${encodeURIComponent(post.slug)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="View live post"
                          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => void onDelete(post)}
                          aria-label={`Delete ${post.title}`}
                          title="Delete post"
                          className="p-1.5 rounded-xl text-red-500 hover:text-white hover:bg-red-500/20 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="pt-3 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <span className="text-slate-400 text-[11px]">
                  Page <strong className="text-white">{safeCurrentPage}</strong> of <strong className="text-white">{totalPages}</strong>
                </span>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage(1)}
                    title="First page"
                    className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    title="Previous page"
                    className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  {getPageNumbers(safeCurrentPage, totalPages).map((p, idx) => {
                    if (p === '...') {
                      return (
                        <span key={`ellipsis-${idx}`} className="px-2 text-slate-500 font-bold text-xs select-none">
                          ...
                        </span>
                      );
                    }
                    const pageNum = p as number;
                    const isCurrent = pageNum === safeCurrentPage;
                    return (
                      <button
                        key={`page-${pageNum}`}
                        type="button"
                        onClick={() => setCurrentPage(pageNum)}
                        className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold transition-all duration-150 ${
                          isCurrent
                            ? 'bg-gradient-to-r from-[#1d9bf0] to-[#007bff] text-white shadow-[0_2px_8px_rgba(29,155,240,0.5)] scale-105'
                            : 'bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    title="Next page"
                    className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage(totalPages)}
                    title="Last page"
                    className="p-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronsRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* TAB 2: COMMENTS MODERATION */}
      {activeTab === 'comments' && (
        <div className="space-y-6">
          {/* Filter Pills & Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-3xl bg-[#0b111e] border border-white/10 shadow-[0px_10px_25px_rgba(0,0,0,0.5)]">
            {/* Status Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setCommentFilter('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  commentFilter === 'all'
                    ? 'bg-gradient-to-b from-[#3bb3ff] to-[#007bff] text-white shadow-[0_2px_8px_rgba(0,123,255,0.4)]'
                    : 'bg-[#1c2638] text-[#94a3b8] hover:text-white'
                }`}
              >
                All ({comments.length})
              </button>
              <button
                type="button"
                onClick={() => setCommentFilter('pending')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  commentFilter === 'pending'
                    ? 'bg-gradient-to-b from-amber-400 to-amber-600 text-slate-950 font-black shadow-[0_2px_8px_rgba(245,158,11,0.4)]'
                    : 'bg-[#1c2638] text-amber-300 hover:text-white'
                }`}
              >
                <Clock className="w-3 h-3" />
                Pending ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setCommentFilter('approved')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  commentFilter === 'approved'
                    ? 'bg-gradient-to-b from-emerald-400 to-emerald-600 text-white shadow-[0_2px_8px_rgba(16,185,129,0.4)]'
                    : 'bg-[#1c2638] text-emerald-400 hover:text-white'
                }`}
              >
                <CheckCircle className="w-3 h-3" />
                Approved ({approvedCount})
              </button>
              <button
                type="button"
                onClick={() => setCommentFilter('spam')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  commentFilter === 'spam'
                    ? 'bg-gradient-to-b from-rose-500 to-rose-700 text-white shadow-[0_2px_8px_rgba(244,63,94,0.4)]'
                    : 'bg-[#1c2638] text-rose-400 hover:text-white'
                }`}
              >
                <ShieldAlert className="w-3 h-3" />
                Spam / Banned ({spamCount})
              </button>
              <button
                type="button"
                onClick={() => setCommentFilter('rejected')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  commentFilter === 'rejected'
                    ? 'bg-gradient-to-b from-slate-500 to-slate-700 text-white'
                    : 'bg-[#1c2638] text-slate-400 hover:text-white'
                }`}
              >
                <XCircle className="w-3 h-3" />
                Rejected ({rejectedCount})
              </button>
            </div>

            {/* Search & Refresh */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search comments..."
                  value={commentSearch}
                  onChange={e => setCommentSearch(e.target.value)}
                  className="w-full bg-[#141b2d] border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <button
                type="button"
                title="Refresh comments"
                onClick={() => void refreshComments()}
                disabled={commentsLoading}
                className="p-2 rounded-xl bg-[#141b2d] border border-white/10 text-slate-300 hover:text-white disabled:opacity-50 transition-all shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${commentsLoading ? 'animate-spin text-cyan-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Comments List */}
          {commentsLoading && comments.length === 0 ? (
            <div className="py-20 text-center rounded-3xl bg-[#0b111e] border border-white/5">
              <LoaderCircle className="w-8 h-8 animate-spin mx-auto text-cyan-400 mb-3" />
              <p className="text-sm text-slate-400 font-semibold">Loading blog comments...</p>
            </div>
          ) : filteredComments.length === 0 ? (
            <div className="py-20 text-center rounded-3xl bg-[#0b111e] border border-white/5">
              <MessageSquare className="w-10 h-10 mx-auto text-slate-600 mb-3" />
              <p className="text-base text-slate-300 font-bold">No comments found</p>
              <p className="text-xs text-slate-500 mt-1">
                {commentSearch ? 'No comments matched your search query.' : 'There are no comments in this status filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredComments.map(comment => {
                const isWorking = commentActionId === comment.id;

                return (
                  <div
                    key={comment.id}
                    className={`rounded-2xl border p-5 transition-all backdrop-blur-md ${
                      comment.status === 'spam'
                        ? 'bg-rose-950/20 border-rose-500/20'
                        : comment.status === 'pending'
                        ? 'bg-amber-950/20 border-amber-500/30'
                        : comment.status === 'rejected'
                        ? 'bg-slate-900/40 border-slate-700/40 opacity-70'
                        : 'bg-[#111927] border-white/10 shadow-[0px_8px_20px_rgba(0,0,0,0.4)]'
                    }`}
                  >
                    {/* Top Row: Author, Article, Status */}
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#2a354d] to-[#141b2d] border border-white/10 flex items-center justify-center font-black text-cyan-300 text-sm shadow-[inset_0px_2px_4px_rgba(255,255,255,0.1)]">
                          {comment.guest_name.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">{comment.guest_name}</span>
                            {comment.parent_id && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-400 bg-cyan-950/40 border border-cyan-800/40 px-2 py-0.5 rounded-full">
                                <CornerDownRight className="w-3 h-3" /> Reply
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-slate-400">
                            {new Date(comment.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                          </span>
                        </div>
                      </div>

                      {/* Right Meta: Post Slug Link & Status Badge */}
                      <div className="flex items-center gap-2.5">
                        <a
                          href={`/blog/${comment.post_slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-400 hover:text-cyan-300 bg-cyan-950/30 hover:bg-cyan-900/40 border border-cyan-500/20 px-2.5 py-1 rounded-lg transition-colors"
                        >
                          <span className="max-w-[140px] sm:max-w-[200px] truncate">/{comment.post_slug}</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>

                        {comment.status === 'approved' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle className="w-3 h-3" /> Approved
                          </span>
                        )}
                        {comment.status === 'pending' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                            <Clock className="w-3 h-3" /> Pending Review
                          </span>
                        )}
                        {comment.status === 'spam' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            <ShieldAlert className="w-3 h-3" /> Spam / Banned
                          </span>
                        )}
                        {comment.status === 'rejected' && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-slate-500/20 text-slate-300 border border-slate-500/30">
                            <XCircle className="w-3 h-3" /> Rejected
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Comment Content Box */}
                    <div className="rounded-xl bg-[#0b111e]/80 border border-white/5 p-3.5 my-3 shadow-[inset_0px_2px_4px_rgba(0,0,0,0.4)]">
                      <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed break-words font-sans">
                        {comment.content}
                      </p>
                    </div>

                    {/* Bottom Action Bar with 3D tactile buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Approve Button */}
                        {comment.status !== 'approved' && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() => void handleCommentStatus(comment.id, 'approved')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 disabled:opacity-50 transition-all shadow-[0px_4px_10px_rgba(16,185,129,0.3),inset_0px_1px_1px_rgba(255,255,255,0.3)] active:scale-95"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Approve
                          </button>
                        )}

                        {/* Ban / Spam Button */}
                        {comment.status !== 'spam' && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() => void handleCommentStatus(comment.id, 'spam')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-gradient-to-b from-rose-500 to-rose-700 hover:from-rose-400 hover:to-rose-600 disabled:opacity-50 transition-all shadow-[0px_4px_10px_rgba(244,63,94,0.3),inset_0px_1px_1px_rgba(255,255,255,0.3)] active:scale-95"
                          >
                            <Ban className="w-3.5 h-3.5" /> Ban / Spam
                          </button>
                        )}

                        {/* Reject Button */}
                        {comment.status !== 'rejected' && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() => void handleCommentStatus(comment.id, 'rejected')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 bg-gradient-to-b from-slate-700 to-slate-800 hover:text-white disabled:opacity-50 transition-all shadow-[0px_3px_6px_rgba(0,0,0,0.3),inset_0px_1px_1px_rgba(255,255,255,0.1)] active:scale-95"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        )}

                        {/* Ban Author Button (if not anonymous) */}
                        {comment.guest_name && comment.guest_name.toLowerCase() !== 'anonymous' && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() => void handleBanAuthor(comment.guest_name)}
                            title={`Ban all comments by "${comment.guest_name}"`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-200 bg-purple-950/60 hover:bg-purple-900/70 border border-purple-500/40 disabled:opacity-50 transition-all shadow-[0px_3px_6px_rgba(168,85,247,0.2)] active:scale-95"
                          >
                            <ShieldAlert className="w-3.5 h-3.5 text-purple-400" /> Ban User
                          </button>
                        )}
                      </div>

                      {/* Delete Button */}
                      <button
                        type="button"
                        disabled={isWorking}
                        onClick={() => void handleCommentDelete(comment)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-red-400 hover:text-white bg-red-950/40 hover:bg-red-700 border border-red-500/30 disabled:opacity-50 transition-all shadow-[0px_3px_6px_rgba(239,68,68,0.2),inset_0px_1px_1px_rgba(255,255,255,0.1)] active:scale-95"
                      >
                        {isWorking ? (
                          <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
