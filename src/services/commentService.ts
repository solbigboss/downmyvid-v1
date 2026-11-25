import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { BlogComment, CreateCommentDTO, CommentStatus } from '../types';
import { resolveApiUrl } from './mediaExtractor';
import { BLOG_ADMIN_EMAIL } from '../data/blog';

const commentsCollection = collection(db, 'comments');

function requireAdminUser() {
  const user = auth.currentUser;
  if (!user || user.email?.toLowerCase() !== BLOG_ADMIN_EMAIL) {
    throw new Error('Sign in with the blog administrator Google account to moderate comments.');
  }
  return user;
}

const SPAM_KEYWORDS = [
  'viagra', 'cialis', 'casino', 'poker', 'crypto giveaway',
  'free btc', 'free eth', 'buy followers', 'telegram:', 'whatsapp:',
  'wa.me/', 't.me/', 'escort', 'dating service', 'loans',
  'earn money online', 'passive income', 'seo backlink',
  'investment guaranteed', 'hot girls', 'adult dating',
  'gift cards', 'hack account', 'click here'
];

function checkSpam(content: string, guestName: string): boolean {
  const combined = `${guestName} ${content}`.toLowerCase();
  if (/(https?:\/\/|www\.|\.ru\/|\.xyz\/|\.top\/|ftp:\/\/)/i.test(combined)) {
    return true;
  }
  for (const kw of SPAM_KEYWORDS) {
    if (combined.includes(kw)) {
      return true;
    }
  }
  return false;
}

function dateString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as any).toDate === 'function') {
    return (value as any).toDate().toISOString();
  }
  return new Date().toISOString();
}

/**
 * Fetch top-level approved comments for an article with reply counts.
 * Tries the backend API first, with automatic Firestore client fallback.
 */
export async function fetchTopLevelComments(postSlug: string): Promise<BlogComment[]> {
  const cleanSlug = postSlug.trim().toLowerCase();
  const apiUrl = resolveApiUrl(`/api/comments?post_slug=${encodeURIComponent(cleanSlug)}`);

  try {
    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.comments)) {
        return data.comments;
      }
    }
  } catch (apiErr) {
    console.warn('API /api/comments unreachable, falling back to Firestore query:', apiErr);
  }

  // Fallback to Firestore client SDK directly (e.g. static hosting)
  try {
    const q = query(
      commentsCollection,
      where('post_slug', '==', cleanSlug),
      where('status', '==', 'approved')
    );
    const snapshot = await getDocs(q);
    const allApproved: BlogComment[] = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        post_slug: String(d.post_slug || cleanSlug),
        parent_id: d.parent_id ? String(d.parent_id) : null,
        guest_name: String(d.guest_name || 'Anonymous'),
        content: String(d.content || ''),
        status: (d.status as CommentStatus) || 'approved',
        created_at: dateString(d.created_at || d.createdAt),
      };
    });

    // Filter top-level and calculate reply counts
    const topLevel = allApproved
      .filter((c) => !c.parent_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return topLevel.map((c) => {
      const replyCount = allApproved.filter((r) => r.parent_id === c.id).length;
      return {
        ...c,
        reply_count: replyCount,
      };
    });
  } catch (firestoreErr) {
    console.error('Failed to fetch comments from Firestore:', firestoreErr);
    return [];
  }
}

/**
 * Lazy-load direct replies for a specific top-level comment.
 */
export async function fetchReplies(commentId: string, postSlug: string): Promise<BlogComment[]> {
  const cleanId = commentId.trim();
  const cleanSlug = postSlug.trim().toLowerCase();
  const apiUrl = resolveApiUrl(`/api/comments/${encodeURIComponent(cleanId)}/replies`);

  try {
    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.replies)) {
        return data.replies;
      }
    }
  } catch (apiErr) {
    console.warn('API /api/comments/:id/replies unreachable, falling back to Firestore query:', apiErr);
  }

  // Fallback to Firestore client SDK
  try {
    const q = query(
      commentsCollection,
      where('post_slug', '==', cleanSlug),
      where('parent_id', '==', cleanId),
      where('status', '==', 'approved')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs
      .map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          post_slug: cleanSlug,
          parent_id: cleanId,
          guest_name: String(d.guest_name || 'Anonymous'),
          content: String(d.content || ''),
          status: (d.status as CommentStatus) || 'approved',
          created_at: dateString(d.created_at || d.createdAt),
        };
      })
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  } catch (firestoreErr) {
    console.error('Failed to fetch replies from Firestore:', firestoreErr);
    return [];
  }
}

/**
 * Submit a new guest comment (with Honeypot bot protection and spam filter).
 */
export async function submitComment(
  dto: CreateCommentDTO
): Promise<{ success: boolean; comment?: BlogComment; message?: string; status?: CommentStatus }> {
  const apiUrl = resolveApiUrl('/api/comments');

  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        success: true,
        comment: data.comment,
        status: data.status,
        message: data.message || 'Comment posted successfully!',
      };
    }

    if (res.status === 429) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || 'Rate limit reached: Please wait a moment before posting another comment.');
    }

    if (res.status === 403) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || 'Security verification failed. Please complete the Turnstile challenge.');
    }
  } catch (apiErr) {
    if (apiErr instanceof Error && (apiErr.message.includes('Rate limit') || apiErr.message.includes('Security verification') || apiErr.message.includes('Turnstile'))) {
      throw apiErr;
    }
    console.warn('API /api/comments POST failed, falling back to Firestore client write:', apiErr);
  }

  // Fallback to Firestore direct client write
  // 1. Honeypot check: If bot filled the hidden website field, silently drop
  if (dto.website && String(dto.website).trim().length > 0) {
    return {
      success: true,
      message: 'Comment submitted successfully.',
      status: 'approved',
      comment: {
        id: (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `cmt_${Date.now()}`),
        post_slug: dto.post_slug,
        parent_id: dto.parent_id || null,
        guest_name: 'Anonymous',
        content: '',
        status: 'approved',
        created_at: new Date().toISOString(),
      },
    };
  }

  const cleanSlug = dto.post_slug.trim().toLowerCase();
  const cleanName = (dto.guest_name && dto.guest_name.trim().slice(0, 100)) || 'Anonymous';
  const cleanContent = dto.content.trim().slice(0, 1000);
  const targetParentId = dto.parent_id ? String(dto.parent_id).trim() : null;

  // Spam keyword & URL detection
  const isSpam = checkSpam(cleanContent, cleanName);
  const status: CommentStatus = isSpam ? 'spam' : 'approved';

  const docData = {
    post_slug: cleanSlug,
    parent_id: targetParentId,
    guest_name: cleanName,
    content: cleanContent,
    status,
    created_at: serverTimestamp(),
  };

  const docRef = await addDoc(commentsCollection, docData);

  const createdComment: BlogComment = {
    id: docRef.id,
    post_slug: cleanSlug,
    parent_id: targetParentId,
    guest_name: cleanName,
    content: cleanContent,
    status,
    created_at: new Date().toISOString(),
  };

  return {
    success: true,
    comment: createdComment,
    status,
    message: isSpam
      ? 'Your comment has been submitted and is pending review.'
      : 'Comment posted successfully!',
  };
}

/**
 * Admin: List all comments across all articles, optionally filtered by status.
 * Tries backend API first, with full Firestore client fallback.
 */
export async function listAllCommentsForAdmin(statusFilter: CommentStatus | 'all' = 'all'): Promise<BlogComment[]> {
  requireAdminUser();

  const apiUrl = resolveApiUrl(`/api/admin/comments?status=${encodeURIComponent(statusFilter)}`);
  try {
    const res = await fetch(apiUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.comments)) {
        return data.comments;
      }
    }
  } catch (apiErr) {
    console.warn('Admin API /api/admin/comments unreachable, querying Firestore directly:', apiErr);
  }

  // Fallback to direct Firestore query
  try {
    const q = statusFilter === 'all'
      ? commentsCollection
      : query(commentsCollection, where('status', '==', statusFilter));

    const snapshot = await getDocs(q);
    const comments: BlogComment[] = snapshot.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        id: docSnap.id,
        post_slug: String(d.post_slug || ''),
        parent_id: d.parent_id ? String(d.parent_id) : null,
        guest_name: String(d.guest_name || 'Anonymous'),
        content: String(d.content || ''),
        status: (d.status as CommentStatus) || 'pending',
        created_at: dateString(d.created_at || d.createdAt),
      };
    });

    // Sort newest first
    return comments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (err) {
    console.error('Failed to query comments from Firestore for admin:', err);
    throw new Error(err instanceof Error ? err.message : 'Could not load comments.');
  }
}

/**
 * Admin: Update status of a comment (e.g. 'approved', 'spam', 'rejected', 'pending').
 */
export async function updateCommentStatus(commentId: string, status: CommentStatus): Promise<void> {
  requireAdminUser();
  const cleanId = commentId.trim();

  // Try API first
  const apiUrl = resolveApiUrl(`/api/admin/comments/${encodeURIComponent(cleanId)}`);
  try {
    const res = await fetch(apiUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (res.ok) return;
  } catch (apiErr) {
    console.warn('API PATCH /api/admin/comments/:id unreachable, updating Firestore directly:', apiErr);
  }

  // Fallback to direct Firestore update
  try {
    const commentRef = doc(db, 'comments', cleanId);
    await updateDoc(commentRef, {
      status,
      updated_at: serverTimestamp(),
    });
  } catch (err) {
    console.error('Failed to update comment status in Firestore:', err);
    throw new Error(err instanceof Error ? err.message : 'Failed to update comment status.');
  }
}

/**
 * Admin: Permanently delete a comment and cascade-delete any child replies.
 */
export async function deleteComment(commentId: string): Promise<void> {
  requireAdminUser();
  const cleanId = commentId.trim();

  // Try API first
  const apiUrl = resolveApiUrl(`/api/admin/comments/${encodeURIComponent(cleanId)}`);
  try {
    const res = await fetch(apiUrl, {
      method: 'DELETE',
    });
    if (res.ok) return;
  } catch (apiErr) {
    console.warn('API DELETE /api/admin/comments/:id unreachable, deleting via Firestore directly:', apiErr);
  }

  // Fallback to direct Firestore deletion
  try {
    const commentRef = doc(db, 'comments', cleanId);
    await deleteDoc(commentRef);

    // Also delete any child replies referencing this comment
    const repliesQuery = query(commentsCollection, where('parent_id', '==', cleanId));
    const replyDocs = await getDocs(repliesQuery);
    if (!replyDocs.empty) {
      const batch = writeBatch(db);
      replyDocs.forEach((rSnap) => {
        batch.delete(rSnap.ref);
      });
      await batch.commit();
    }
  } catch (err) {
    console.error('Failed to delete comment in Firestore:', err);
    throw new Error(err instanceof Error ? err.message : 'Failed to delete comment.');
  }
}

/**
 * Admin: Ban all comments from a specific guest author name (marks them all as spam).
 */
export async function banCommentAuthor(guestName: string): Promise<number> {
  requireAdminUser();
  const cleanName = guestName.trim();
  if (!cleanName || cleanName === 'Anonymous') {
    throw new Error('Cannot ban default Anonymous author. Please ban or delete individual comments.');
  }

  // Try API first
  const apiUrl = resolveApiUrl('/api/admin/comments/ban-author');
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ guest_name: cleanName }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.updatedCount || 0;
    }
  } catch (apiErr) {
    console.warn('API POST ban-author unreachable, updating Firestore directly:', apiErr);
  }

  // Fallback to direct Firestore batch update
  try {
    const q = query(commentsCollection, where('guest_name', '==', cleanName));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return 0;

    const batch = writeBatch(db);
    snapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, {
        status: 'spam',
        updated_at: serverTimestamp(),
      });
    });
    await batch.commit();
    return snapshot.size;
  } catch (err) {
    console.error('Failed to ban author in Firestore:', err);
    throw new Error(err instanceof Error ? err.message : 'Failed to ban author.');
  }
}
