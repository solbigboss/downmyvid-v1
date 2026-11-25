-- =========================================================================
-- Migration: 001_create_comments_table.sql
-- Description: Guest comment system for blog section with Adjacency List pattern
-- Target Databases: PostgreSQL, Supabase, Neon, CockroachDB, SQLite (with types adapted)
-- =========================================================================

-- 1. Create Comment Status Enum Type (for PostgreSQL/Supabase)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'comment_status') THEN
        CREATE TYPE comment_status AS ENUM ('approved', 'pending', 'rejected', 'spam');
    END IF;
END$$;

-- 2. Create Comments Table using Adjacency List Pattern
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_slug VARCHAR(255) NOT NULL,
    parent_id UUID NULL,
    guest_name VARCHAR(100) NOT NULL DEFAULT 'Anonymous',
    content TEXT NOT NULL CHECK (char_length(content) > 0 AND char_length(content) <= 1000),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('approved', 'pending', 'rejected', 'spam')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Foreign key to self for Adjacency List pattern:
    -- If a parent comment is deleted, cascade delete its direct replies
    CONSTRAINT fk_comments_parent
        FOREIGN KEY (parent_id)
        REFERENCES comments(id)
        ON DELETE CASCADE
);

-- 3. Indexes for High-Performance Queries
-- Index by post_slug to fetch all comments for a specific article
CREATE INDEX IF NOT EXISTS idx_comments_post_slug ON comments (post_slug);

-- Composite index to fetch only approved comments for an article sorted by timestamp
CREATE INDEX IF NOT EXISTS idx_comments_post_slug_approved ON comments (post_slug, created_at DESC)
WHERE status = 'approved';

-- Index by parent_id for lazy-loading threaded replies under a comment
CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments (parent_id);

-- Index for top-level comments (parent_id IS NULL)
CREATE INDEX IF NOT EXISTS idx_comments_top_level ON comments (post_slug, created_at DESC)
WHERE parent_id IS NULL AND status = 'approved';

-- Index by status for admin moderation queries
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments (status);

-- 4. Trigger to automatically update updated_at timestamp on row update
CREATE OR REPLACE FUNCTION update_comments_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_comments_updated_at ON comments;
CREATE TRIGGER trg_comments_updated_at
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_comments_timestamp();

-- 5. Helpful Documentation Comments
COMMENT ON TABLE comments IS 'Guest comments on blog articles using Adjacency List pattern';
COMMENT ON COLUMN comments.id IS 'Unique UUID identifier of the comment';
COMMENT ON COLUMN comments.post_slug IS 'URL slug of the associated blog article';
COMMENT ON COLUMN comments.parent_id IS 'Adjacency list parent reference; NULL for top-level comments';
COMMENT ON COLUMN comments.guest_name IS 'Author display name, defaults to Anonymous';
COMMENT ON COLUMN comments.content IS 'Comment text up to 1000 characters';
COMMENT ON COLUMN comments.status IS 'Moderation state: approved, pending, rejected, or spam';
COMMENT ON COLUMN comments.created_at IS 'Timestamp of submission';
