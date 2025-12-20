-- JLS Lawn Tracker - Archive Table Migration
-- Run this in Supabase SQL Editor to add the archive system

-- 1. Create the archive table to store deleted jobs
CREATE TABLE IF NOT EXISTS public.job_archives (
    id bigint PRIMARY KEY,                              -- Same ID as the original job
    archived_at timestamp with time zone DEFAULT now(), -- When it was archived
    deleted_reason text DEFAULT 'cancelled',            -- Why it was deleted (cancelled, etc.)
    
    -- Original job data preserved as JSON
    original_data jsonb NOT NULL
);

-- 2. Add RLS policy for archives (same permissive policy as jobs table)
ALTER TABLE public.job_archives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable all access for all users on archives"
ON "public"."job_archives"
AS PERMISSIVE
FOR ALL
TO public
USING ( true )
WITH CHECK ( true );

-- 3. Optional: Create an index for faster archive lookups
CREATE INDEX IF NOT EXISTS idx_job_archives_archived_at 
ON public.job_archives(archived_at DESC);

-- ============================================================
-- NOTES:
-- - This table stores a complete snapshot of the job at deletion time
-- - The original_data column contains all job fields as JSON
-- - This allows you to view history without cluttering the main jobs table
-- ============================================================
