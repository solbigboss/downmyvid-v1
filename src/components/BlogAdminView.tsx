import React, { useEffect, useRef, useState } from 'react';
import { AlignCenter, AlignLeft, AlignRight, Bold, Heading1, Heading2, ImagePlus, Italic, Link as LinkIcon, List, LoaderCircle, LogIn, LogOut, Plus, Redo2, Save, Trash2, Undo2 } from 'lucide-react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, loginWithGoogle, logoutUser } from '../firebase';
import { BlogPost, BLOG_ADMIN_EMAIL } from '../data/blog';
import { listAdminPosts, removePost, savePost, uploadBlogImage } from '../services/blogService';
import { MarkdownContent } from './MarkdownContent';
import { Language } from '../types';
import { blogCopy } from '../data/blogCopy';

const blank = { slug: '', title: '', excerpt: '', body: '', imageUrl: '', category: 'News', published: false };

function makeSlug(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
}

interface BlogAdminViewProps { currentLang: Language; }

export const BlogAdminView: React.FC<BlogAdminViewProps> = ({ currentLang }) => {
  const copy = blogCopy[currentLang];
  const isRtl = currentLang === 'ar';
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [editingId, setEditingId] = useState<string | undefined>();
  const [form, setForm] = useState(blank);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => onAuthStateChanged(auth, setUser), []);

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

  const refresh = async () => {
    if (!isAdmin) return;
    setLoading(true);
    try { setPosts(await listAdminPosts()); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load posts.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, [isAdmin]);

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
    try { await savePost({ ...form, id: editingId }); await refresh(); reset(); setMessage('Post saved.'); }
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
    try { await removePost(post); await refresh(); if (editingId === post.id) reset(); setMessage('Post deleted.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to delete post.'); }
    finally { setLoading(false); }
  };

  if (!user) return <section dir={isRtl ? 'rtl' : 'ltr'} className="max-w-xl mx-auto px-4 py-20 text-center"><h1 className="text-3xl font-black">{copy.admin}</h1><p className="mt-3 text-[#536471]">{copy.signInHelp}</p><button onClick={() => void loginWithGoogle().catch(error => setMessage(error.message))} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#1d9bf0] px-5 py-3 font-bold text-white"><LogIn className="w-4 h-4" /> {copy.signIn}</button>{message && <p role="alert" className="mt-4 text-sm text-red-600">{message}</p>}</section>;
  if (!isAdmin) return <section dir={isRtl ? 'rtl' : 'ltr'} className="max-w-xl mx-auto px-4 py-20 text-center"><h1 className="text-3xl font-black">{copy.accessRestricted}</h1><button onClick={() => void logoutUser()} className="mt-6 inline-flex items-center gap-2 rounded-xl border px-4 py-2"><LogOut className="w-4 h-4" /> {copy.signOut}</button></section>;

  return <section dir={isRtl ? 'rtl' : 'ltr'} className={`max-w-5xl mx-auto px-4 py-10 ${isRtl ? 'font-[Cairo]' : ''}`}>
    <div className="flex items-center justify-between gap-4 mb-8"><div><p className="text-sm text-[#536471]">{copy.signedInAs} {user.email}</p><h1 className="text-3xl font-black">{copy.manage}</h1></div><button onClick={() => void logoutUser()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold"><LogOut className="w-4 h-4" /> {copy.signOut}</button></div>
    <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
      <form onSubmit={onSave} className="space-y-4 rounded-3xl border border-[#cfd9de] dark:border-[#2f3336] bg-white dark:bg-[#15202b] p-5 sm:p-7">
        <div className="flex items-center justify-between"><h2 className="text-xl font-black">{editingId ? copy.editPost : copy.newPost}</h2><button type="button" onClick={reset} className="inline-flex items-center gap-1 text-sm font-bold text-[#1d9bf0]"><Plus className="w-4 h-4" /> {copy.newPost}</button></div>
        <label className="block text-sm font-bold">{copy.titleField}<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value, slug: editingId ? form.slug : makeSlug(e.target.value) })} className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2.5" maxLength={140} /></label>
        <label className="block text-sm font-bold">{copy.slugField}<input required value={form.slug} onChange={e => setForm({ ...form, slug: makeSlug(e.target.value) })} className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2.5" maxLength={90} /></label>
        <label className="block text-sm font-bold">{copy.categoryField}<input required value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Games, News, Finance" className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2.5" maxLength={40} /></label>
        <label className="block text-sm font-bold">{copy.excerptField}<textarea required value={form.excerpt} onChange={e => setForm({ ...form, excerpt: e.target.value })} className="mt-1 w-full rounded-xl border bg-transparent px-3 py-2.5" rows={3} maxLength={300} /></label>
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
        <div><label className="block text-sm font-bold">{copy.coverImage}</label><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold"><ImagePlus className="w-4 h-4" /> {copy.uploadImage}</button><input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => void onImage(e.target.files?.[0])} /><input aria-label="Image URL" value={form.imageUrl} onChange={e => setForm({ ...form, imageUrl: e.target.value })} placeholder={copy.imageUrl} className="min-w-[180px] flex-1 rounded-xl border bg-transparent px-3 py-2" /></div>{form.imageUrl && <img src={form.imageUrl} alt="Cover preview" className="mt-3 max-h-64 w-full rounded-2xl object-cover" />}</div>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={form.published} onChange={e => setForm({ ...form, published: e.target.checked })} /> {copy.publish}</label>
        {message && <p role="status" className="text-sm text-[#536471]">{message}</p>}
        <button disabled={loading} className="inline-flex items-center gap-2 rounded-xl bg-[#1d9bf0] px-5 py-3 font-bold text-white disabled:opacity-60">{loading ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {copy.save}</button>
      </form>
      <aside className="space-y-3"><h2 className="text-xl font-black">{copy.existingPosts}</h2>{loading && <p className="text-sm text-[#536471]">{copy.loading}</p>}{posts.map(post => <div key={post.id} className="flex items-center gap-3 rounded-2xl border p-3"><div className="min-w-0 flex-1"><p className="truncate font-bold">{post.title}</p><p className="text-xs text-[#536471]">{post.published ? copy.published : copy.draft} · /blog/{post.slug}</p></div><button onClick={() => edit(post)} className="text-sm font-bold text-[#1d9bf0]">Edit</button><button onClick={() => void onDelete(post)} aria-label={`Delete ${post.title}`} className="p-2 text-red-600"><Trash2 className="w-4 h-4" /></button></div>)}</aside>
    </div>
  </section>;
};
