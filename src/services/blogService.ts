import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import { BlogPost, BLOG_ADMIN_EMAIL } from '../data/blog';

const postsCollection = collection(db, 'blogPosts');

function requireAdmin() {
  const user = auth.currentUser;
  if (!user || user.email?.toLowerCase() !== BLOG_ADMIN_EMAIL) {
    throw new Error('Sign in with the blog administrator Google account to manage posts.');
  }
  return user;
}

function dateString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') return value.toDate().toISOString();
  return '';
}

function toPost(id: string, data: Record<string, unknown>): BlogPost {
  return {
    id,
    slug: String(data.slug || ''),
    title: String(data.title || ''),
    excerpt: String(data.excerpt || ''),
    body: String(data.body || ''),
    imageUrl: String(data.imageUrl || ''),
    authorEmail: String(data.authorEmail || ''),
    published: data.published === true,
    publishedAt: dateString(data.publishedAt),
    updatedAt: dateString(data.updatedAt),
  };
}

export async function listPublishedPosts(): Promise<BlogPost[]> {
  const snapshot = await getDocs(query(postsCollection, where('published', '==', true)));
  return snapshot.docs
    .map(post => toPost(post.id, post.data()))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  const snapshot = await getDocs(query(postsCollection, where('published', '==', true)));
  const post = snapshot.docs.find(item => item.data().slug === slug);
  return post ? toPost(post.id, post.data()) : null;
}

export async function listAdminPosts(): Promise<BlogPost[]> {
  requireAdmin();
  const snapshot = await getDocs(postsCollection);
  return snapshot.docs.map(post => toPost(post.id, post.data())).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function savePost(input: Omit<BlogPost, 'id' | 'authorEmail' | 'publishedAt' | 'updatedAt'> & { id?: string }): Promise<void> {
  const user = requireAdmin();
  const slug = input.slug.trim().toLowerCase();
  const title = input.title.trim();
  const excerpt = input.excerpt.trim();
  const body = input.body.trim();
  const imageUrl = input.imageUrl.trim();
  if (!slug || !title || !excerpt || !body) throw new Error('Title, slug, excerpt, and article text are required.');
  const duplicateCheck = await getDocs(query(postsCollection, where('slug', '==', slug)));
  if (duplicateCheck.docs.some(snapshot => snapshot.id !== input.id)) throw new Error('That URL slug is already in use. Choose another slug.');

  const now = new Date().toISOString();
  if (input.id) {
    const postRef = doc(db, 'blogPosts', input.id);
    const previous = await getDoc(postRef);
    if (!previous.exists()) throw new Error('This post no longer exists. Refresh the page and try again.');
    const previousData = previous.data();
    const wasPublished = previousData.published === true;
    const publishedAt = input.published ? (wasPublished ? dateString(previousData.publishedAt) || now : now) : '';
    await updateDoc(postRef, { slug, title, excerpt, body, imageUrl, published: input.published, authorEmail: user.email, publishedAt, updatedAt: serverTimestamp() });
  } else {
    await addDoc(postsCollection, { slug, title, excerpt, body, imageUrl, published: input.published, authorEmail: user.email, publishedAt: input.published ? now : '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
}

export async function removePost(post: BlogPost): Promise<void> {
  requireAdmin();
  await deleteDoc(doc(db, 'blogPosts', post.id));
  if (post.imageUrl.includes('/blog-images%2F')) {
    try {
      const decodedPath = decodeURIComponent(new URL(post.imageUrl).pathname.split('/o/')[1] || '');
      if (decodedPath.startsWith('blog-images/')) await deleteObject(ref(storage, decodedPath));
    } catch { /* Post deletion should not be blocked by an already-missing image. */ }
  }
}

export async function uploadBlogImage(file: File): Promise<string> {
  const user = requireAdmin();
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (file.size > 8 * 1024 * 1024) throw new Error('Images must be 8 MB or smaller.');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100) || 'image';
  const imageRef = ref(storage, `blog-images/${user.uid}/${Date.now()}-${safeName}`);
  await uploadBytes(imageRef, file, { contentType: file.type });
  return getDownloadURL(imageRef);
}

