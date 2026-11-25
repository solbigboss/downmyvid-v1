import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  CornerDownRight,
  ChevronDown,
  ChevronUp,
  User,
  Clock,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
} from 'lucide-react';
import { BlogComment, Language } from '../types';
import {
  fetchTopLevelComments,
  fetchReplies,
  submitComment,
} from '../services/commentService';

interface BlogCommentSectionProps {
  postSlug: string;
  currentLang: Language;
}

// Generate deterministic vibrant 3D avatar gradient based on guest name
function getAvatarStyle(name: string) {
  const gradients = [
    'linear-gradient(135deg, #3bb3ff 0%, #007bff 100%)',
    'linear-gradient(135deg, #00f2fe 0%, #4facfe 100%)',
    'linear-gradient(135deg, #a855f7 0%, #6366f1 100%)',
    'linear-gradient(135deg, #f09433 0%, #e6683c 50%, #dc2743 100%)',
    'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
}

function timeAgo(dateString: string, lang: Language): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffSecs = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSecs < 60) {
      return lang === 'ar' ? 'الآن' : 'just now';
    }
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) {
      return lang === 'ar' ? `منذ ${diffMins} دقيقة` : `${diffMins}m ago`;
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return lang === 'ar' ? `منذ ${diffHours} ساعة` : `${diffHours}h ago`;
    }
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) {
      return lang === 'ar' ? `منذ ${diffDays} يوم` : `${diffDays}d ago`;
    }
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  } catch {
    return dateString;
  }
}

export const BlogCommentSection: React.FC<BlogCommentSectionProps> = ({
  postSlug,
  currentLang,
}) => {
  const isRtl = currentLang === 'ar';

  const [comments, setComments] = useState<BlogComment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Form State
  const [guestName, setGuestName] = useState<string>('');
  const [content, setContent] = useState<string>('');
  const [honeypot, setHoneypot] = useState<string>(''); // Hidden bot trap field
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    guestName: string;
    rootParentId: string;
  } | null>(null);

  // Lazy-loaded replies state: Map of commentId -> { replies: BlogComment[], expanded: boolean, loading: boolean }
  const [repliesState, setRepliesState] = useState<
    Record<string, { replies: BlogComment[]; expanded: boolean; loading: boolean }>
  >({});

  // Fetch top-level comments on mount or postSlug change
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setErrorNotice(null);

    fetchTopLevelComments(postSlug)
      .then((data) => {
        if (isMounted) {
          setComments(data);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error('Error fetching comments:', err);
          setErrorNotice('Unable to load comments right now.');
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [postSlug]);

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);
    setSuccessNotice(null);

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      setErrorNotice(
        isRtl
          ? 'يرجى كتابة تعليق قبل الإرسال.'
          : 'Please write a comment before submitting.'
      );
      return;
    }

    if (trimmedContent.length > 1000) {
      setErrorNotice(
        isRtl
          ? 'لا يمكن أن يتجاوز التعليق 1000 حرف.'
          : 'Comment cannot exceed 1000 characters.'
      );
      return;
    }

    setSubmitting(true);

    try {
      // If replying to someone, use their rootParentId so all replies are flattened under root parent
      const parentId = replyingTo ? replyingTo.rootParentId : null;

      const res = await submitComment({
        post_slug: postSlug,
        parent_id: parentId,
        guest_name: guestName.trim() || 'Anonymous',
        content: replyingTo ? `@${replyingTo.guestName} ${trimmedContent}` : trimmedContent,
        website: honeypot, // Honeypot trap
      });

      if (res.success) {
        setContent('');
        setHoneypot('');
        setSuccessNotice(
          res.message ||
            (isRtl ? 'تم نشر تعليقك بنجاح!' : 'Your comment has been posted!')
        );

        if (res.comment && res.status === 'approved') {
          const newCmt = res.comment;
          if (!newCmt.parent_id) {
            // New top-level comment
            setComments((prev) => [{ ...newCmt, reply_count: 0 }, ...prev]);
          } else {
            // New reply under parentId: update reply count and prepend/append to repliesState
            const rootId = newCmt.parent_id;
            setComments((prev) =>
              prev.map((c) =>
                c.id === rootId
                  ? { ...c, reply_count: (c.reply_count || 0) + 1 }
                  : c
              )
            );
            setRepliesState((prev) => {
              const current = prev[rootId] || { replies: [], expanded: true, loading: false };
              return {
                ...prev,
                [rootId]: {
                  ...current,
                  expanded: true,
                  replies: [...current.replies, newCmt],
                },
              };
            });
          }
        }

        setReplyingTo(null);

        // Auto-dismiss success notification
        window.setTimeout(() => setSuccessNotice(null), 5000);
      } else {
        setErrorNotice(
          isRtl ? 'فشل إرسال التعليق. حاول مرة أخرى.' : 'Failed to post comment. Please try again.'
        );
      }
    } catch (err) {
      console.error('Error posting comment:', err);
      setErrorNotice(
        isRtl
          ? 'حدث خطأ أثناء إرسال التعليق. يرجى المحاولة لاحقاً.'
          : 'An error occurred while posting your comment.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Toggle or Lazy-load replies for a top-level comment
  const handleToggleReplies = async (commentId: string) => {
    const current = repliesState[commentId];

    // If already loaded, simply toggle expanded
    if (current && current.replies.length > 0) {
      setRepliesState((prev) => ({
        ...prev,
        [commentId]: {
          ...prev[commentId],
          expanded: !prev[commentId].expanded,
        },
      }));
      return;
    }

    // Lazy load from API / Firestore
    setRepliesState((prev) => ({
      ...prev,
      [commentId]: {
        replies: [],
        expanded: true,
        loading: true,
      },
    }));

    try {
      const fetched = await fetchReplies(commentId, postSlug);
      setRepliesState((prev) => ({
        ...prev,
        [commentId]: {
          replies: fetched,
          expanded: true,
          loading: false,
        },
      }));
    } catch (err) {
      console.error('Failed to load replies:', err);
      setRepliesState((prev) => ({
        ...prev,
        [commentId]: {
          replies: [],
          expanded: false,
          loading: false,
        },
      }));
    }
  };

  const totalCommentCount =
    comments.reduce((sum, c) => sum + 1 + (c.reply_count || 0), 0);

  return (
    <section
      id="comments-section"
      dir={isRtl ? 'rtl' : 'ltr'}
      className="w-full mt-12 pt-8 text-start select-text"
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#1d9bf0]/15 dark:bg-[#1d9bf0]/20 flex items-center justify-center text-[#1d9bf0] shadow-xs">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-[#0f1419] dark:text-white tracking-tight">
              {isRtl ? 'التعليقات والمناقشة' : 'Comments & Discussion'}
            </h2>
            <p className="text-xs text-[#536471] dark:text-[#8b98a5] font-medium">
              {isRtl
                ? 'شارك رأيك كضيف دون الحاجة لتسجيل الدخول'
                : 'Share your thoughts as a guest — no sign-in required'}
            </p>
          </div>
        </div>

        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#e8f5fe] dark:bg-[#1d9bf0]/15 text-[#1d9bf0] border border-[#1d9bf0]/30 shadow-2xs shrink-0">
          <Sparkles className="w-3.5 h-3.5" />
          <span>
            {totalCommentCount}{' '}
            {totalCommentCount === 1
              ? isRtl ? 'تعليق' : 'Comment'
              : isRtl ? 'تعليق' : 'Comments'}
          </span>
        </div>
      </div>

      {/* Notifications */}
      {errorNotice && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl text-xs text-red-600 dark:text-red-400 font-semibold flex items-center justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorNotice}</span>
          </div>
          <button
            onClick={() => setErrorNotice(null)}
            className="p-1 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {successNotice && (
        <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 font-semibold flex items-center justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{successNotice}</span>
          </div>
          <button
            onClick={() => setSuccessNotice(null)}
            className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-md"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Frictionless Guest Comment Form with 3D Popping Button */}
      <form
        onSubmit={handleSubmit}
        className="mb-8 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#15202b] border border-[#cfd9de] dark:border-[#2f3336] shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.3)] transition-all"
      >
        {/* Replying-to Active Indicator */}
        {replyingTo && (
          <div className="mb-3.5 px-3 py-2 rounded-xl bg-[#e8f5fe] dark:bg-[#1d9bf0]/15 border border-[#1d9bf0]/30 flex items-center justify-between gap-2 text-xs text-[#1d9bf0] dark:text-[#71c9f8] font-bold animate-in fade-in duration-150">
            <div className="flex items-center gap-1.5">
              <CornerDownRight className="w-3.5 h-3.5" />
              <span>
                {isRtl ? 'الرد على' : 'Replying to'}{' '}
                <strong className="underline underline-offset-2">
                  @{replyingTo.guestName}
                </strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="text-xs text-[#536471] hover:text-[#0f1419] dark:text-[#8b98a5] dark:hover:text-white inline-flex items-center gap-1 font-semibold"
            >
              <X className="w-3.5 h-3.5" />
              <span>{isRtl ? 'إلغاء' : 'Cancel'}</span>
            </button>
          </div>
        )}

        {/* Guest Name & Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 rtl:left-auto rtl:right-0 rtl:pr-3 flex items-center pointer-events-none text-[#8b98a5]">
              <User className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              maxLength={100}
              placeholder={isRtl ? 'اسمك (اختياري - الافتراضي: Anonymous)' : 'Your Name (optional, defaults to Anonymous)'}
              className="w-full pl-9 pr-3 rtl:pl-3 rtl:pr-9 py-2.5 text-xs sm:text-sm bg-[#f7f9f9] dark:bg-[#1e2732] border border-[#cfd9de] dark:border-[#2f3336] rounded-xl text-[#0f1419] dark:text-white placeholder-[#8b98a5] focus:outline-none focus:border-[#1d9bf0] focus:ring-2 focus:ring-[#1d9bf0]/20 transition-all font-medium"
            />
          </div>

          <div className="text-right text-[11px] font-semibold text-[#8b98a5] shrink-0">
            <span
              className={
                content.length > 900
                  ? 'text-amber-500 font-bold'
                  : content.length === 1000
                  ? 'text-red-500 font-bold'
                  : ''
              }
            >
              {content.length}/1000
            </span>
          </div>
        </div>

        {/* Content Textarea */}
        <div className="relative mb-3.5">
          <textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={1000}
            placeholder={
              replyingTo
                ? isRtl
                  ? `اكتب ردك على @${replyingTo.guestName}...`
                  : `Write your reply to @${replyingTo.guestName}...`
                : isRtl
                ? 'شارك برأيك في هذا المقال...'
                : 'Share your thoughts on this article...'
            }
            className="w-full p-3 text-xs sm:text-sm bg-[#f7f9f9] dark:bg-[#1e2732] border border-[#cfd9de] dark:border-[#2f3336] rounded-xl text-[#0f1419] dark:text-white placeholder-[#8b98a5] focus:outline-none focus:border-[#1d9bf0] focus:ring-2 focus:ring-[#1d9bf0]/20 transition-all resize-y min-h-[85px] leading-relaxed"
          />
        </div>

        {/* Hidden Honeypot Input: Invisible to humans, traps spambots */}
        <div className="hidden opacity-0 pointer-events-none absolute -left-[9999px]" aria-hidden="true">
          <label htmlFor="website">Leave this field blank</label>
          <input
            id="website"
            type="text"
            name="website"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
          />
        </div>

        {/* Submit Bar with 3D Popping Button */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-[11px] text-[#8b98a5] hidden sm:block">
            {isRtl
              ? 'الروابط غير مسموح بها للحفاظ على نظافة المحتوى.'
              : 'Direct links are filtered to keep discussion spam-free.'}
          </p>

          <button
            type="submit"
            disabled={submitting || !content.trim()}
            style={{
              background: 'linear-gradient(180deg, #3bb3ff, #007bff)',
              boxShadow:
                'inset 0px 2px 2px rgba(255, 255, 255, 0.3), inset 0px -4px 6px rgba(0, 0, 0, 0.2), 0px 6px 14px rgba(0, 123, 255, 0.45)',
              textShadow: '0px 1px 2px rgba(0,0,0,0.2)',
            }}
            className="ml-auto touch-target px-5 py-2.5 rounded-xl text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100 disabled:active:scale-100 cursor-pointer shrink-0"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{isRtl ? 'جارٍ الإرسال...' : 'Submitting...'}</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>
                  {replyingTo
                    ? isRtl ? 'إرسال الرد' : 'Submit Reply'
                    : isRtl ? 'إرسال التعليق' : 'Submit Comment'}
                </span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* Threaded Comments List */}
      {loading ? (
        <div className="py-12 text-center text-[#536471] dark:text-[#8b98a5]">
          <Loader2 className="w-7 h-7 animate-spin mx-auto text-[#1d9bf0] mb-2" />
          <p className="text-xs font-semibold">
            {isRtl ? 'جارٍ تحميل التعليقات...' : 'Loading comments...'}
          </p>
        </div>
      ) : comments.length === 0 ? (
        <div className="p-8 sm:p-12 text-center rounded-2xl bg-white/60 dark:bg-[#15202b]/60 border border-dashed border-[#cfd9de] dark:border-[#2f3336]">
          <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[#e8f5fe] dark:bg-[#1d9bf0]/15 flex items-center justify-center text-[#1d9bf0]">
            <MessageSquare className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#0f1419] dark:text-white mb-1">
            {isRtl ? 'لا توجد تعليقات بعد' : 'No comments yet'}
          </h3>
          <p className="text-xs text-[#536471] dark:text-[#8b98a5] max-w-sm mx-auto">
            {isRtl
              ? 'كن أول من يشارك رأيه أو يطرح سؤالاً حول هذا المقال!'
              : 'Be the first to share your thoughts or start the conversation!'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {comments.map((comment) => {
            const repliesInfo = repliesState[comment.id];
            const hasReplies = (comment.reply_count || 0) > 0;
            const isExpanded = repliesInfo?.expanded;
            const isLoadingReplies = repliesInfo?.loading;
            const loadedReplies = repliesInfo?.replies || [];

            return (
              <div
                key={comment.id}
                className="rounded-2xl transition-all p-4 sm:p-5 bg-white dark:bg-[#15202b] border border-[#cfd9de] dark:border-[#2f3336] shadow-[0_4px_16px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.25)]"
              >
                {/* Top-Level Comment Header */}
                <div className="flex items-start justify-between gap-3 mb-2.5">
                  <div className="flex items-center gap-2.5">
                    {/* 3D Skeuomorphic Avatar Circle */}
                    <div
                      style={{
                        background: getAvatarStyle(comment.guest_name),
                        boxShadow:
                          'inset 0px 1px 1px rgba(255,255,255,0.4), 0px 3px 6px rgba(0,0,0,0.2)',
                      }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-black uppercase shrink-0"
                    >
                      {comment.guest_name.charAt(0) || 'A'}
                    </div>

                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-[#0f1419] dark:text-white">
                          {comment.guest_name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#eff3f4] dark:bg-[#1e2732] text-[#536471] dark:text-[#8b98a5]">
                          {isRtl ? 'ضيف' : 'Guest'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-[#8b98a5] mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>{timeAgo(comment.created_at, currentLang)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 3D Reply Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingTo({
                        id: comment.id,
                        guestName: comment.guest_name,
                        rootParentId: comment.id,
                      });
                      document
                        .getElementById('comments-section')
                        ?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="touch-target px-3 py-1 rounded-lg text-xs font-bold border border-[#cfd9de] dark:border-[#2f3336] bg-[#f7f9f9] dark:bg-[#1e2732] hover:bg-[#e8f5fe] dark:hover:bg-[#1d9bf0]/20 text-[#536471] dark:text-[#8b98a5] hover:text-[#1d9bf0] dark:hover:text-[#3bb3ff] flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer shadow-2xs"
                  >
                    <CornerDownRight className="w-3.5 h-3.5" />
                    <span>{isRtl ? 'رد' : 'Reply'}</span>
                  </button>
                </div>

                {/* Comment Body */}
                <p className="text-xs sm:text-sm text-[#0f1419] dark:text-[#f7f9f9] leading-relaxed whitespace-pre-wrap break-words pl-11 rtl:pl-0 rtl:pr-11">
                  {comment.content}
                </p>

                {/* Lazy-Load Replies Accordion Button */}
                {hasReplies && (
                  <div className="mt-3.5 pl-11 rtl:pl-0 rtl:pr-11">
                    <button
                      type="button"
                      onClick={() => handleToggleReplies(comment.id)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1d9bf0] hover:text-[#1a8cd8] dark:text-[#3bb3ff] py-1 transition-colors cursor-pointer"
                    >
                      {isLoadingReplies ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>{isRtl ? 'جارٍ تحميل الردود...' : 'Loading replies...'}</span>
                        </>
                      ) : isExpanded ? (
                        <>
                          <ChevronUp className="w-3.5 h-3.5" />
                          <span>
                            {isRtl
                              ? `إخفاء ${comment.reply_count} ردود`
                              : `Hide ${comment.reply_count} ${comment.reply_count === 1 ? 'reply' : 'replies'}`}
                          </span>
                        </>
                      ) : (
                        <>
                          <ChevronDown className="w-3.5 h-3.5" />
                          <span>
                            {isRtl
                              ? `عرض ${comment.reply_count} ردود`
                              : `View ${comment.reply_count} ${comment.reply_count === 1 ? 'reply' : 'replies'}`}
                          </span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Nested Replies Section (Strict One-Level Deep - Mobile Friendly) */}
                {isExpanded && loadedReplies.length > 0 && (
                  <div className="mt-3.5 ml-2 sm:ml-6 pl-2 sm:pl-3 border-l-2 rtl:border-l-0 rtl:border-r-2 border-l-[#1d9bf0]/40 dark:border-l-[#3bb3ff]/30 rtl:border-r-[#1d9bf0]/40 rtl:dark:border-r-[#3bb3ff]/30 space-y-3">
                    {loadedReplies.map((reply) => (
                      <div
                        key={reply.id}
                        /* Visually separated distinct background shade for replies */
                        className="p-3 sm:p-3.5 rounded-xl bg-[#f0f4f9] dark:bg-[#1c2732] border border-[#d3dfea] dark:border-[#283747] border-l-4 rtl:border-l-0 rtl:border-r-4 border-l-[#1d9bf0] dark:border-l-[#3bb3ff] rtl:border-r-[#1d9bf0] rtl:dark:border-r-[#3bb3ff] shadow-2xs"
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-2">
                            {/* Smaller 3D Avatar */}
                            <div
                              style={{
                                background: getAvatarStyle(reply.guest_name),
                                boxShadow:
                                  'inset 0px 1px 1px rgba(255,255,255,0.4), 0px 2px 4px rgba(0,0,0,0.15)',
                              }}
                              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-black uppercase shrink-0"
                            >
                              {reply.guest_name.charAt(0) || 'A'}
                            </div>

                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-[#0f1419] dark:text-white">
                                  {reply.guest_name}
                                </span>
                              </div>
                              <span className="text-[10px] text-[#8b98a5] flex items-center gap-1">
                                <Clock className="w-2.5 h-2.5" />
                                {timeAgo(reply.created_at, currentLang)}
                              </span>
                            </div>
                          </div>

                          {/* Reply to this thread (Flattened under top-level parent) */}
                          <button
                            type="button"
                            onClick={() => {
                              setReplyingTo({
                                id: reply.id,
                                guestName: reply.guest_name,
                                rootParentId: comment.id, // Strict one-level-deep: Always references root comment!
                              });
                              document
                                .getElementById('comments-section')
                                ?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="touch-target px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#536471] hover:text-[#1d9bf0] dark:text-[#8b98a5] dark:hover:text-[#3bb3ff] flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <CornerDownRight className="w-3 h-3" />
                            <span>{isRtl ? 'رد' : 'Reply'}</span>
                          </button>
                        </div>

                        <p className="text-xs text-[#0f1419] dark:text-[#f7f9f9] leading-relaxed whitespace-pre-wrap break-words pl-9 rtl:pl-0 rtl:pr-9">
                          {reply.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
