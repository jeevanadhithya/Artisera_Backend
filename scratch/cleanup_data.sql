-- ============================================================
-- Artisera Data Cleanup Script
-- Clears all transactional/uploaded data from all tables
-- KEEPS: auth.users (user accounts), profiles, rag_documents (seed knowledge)
-- SCHEMA: unchanged — no DROP TABLE, no ALTER TABLE
-- ============================================================

-- Disable triggers temporarily to avoid cascading issues during cleanup
-- (Service role bypasses RLS, so this runs cleanly)

-- Order matters: delete child tables first, then parents
-- to respect foreign key constraints

-- Child tables first (no dependents)
TRUNCATE TABLE public.marketing_assets       RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.ai_generation_jobs     RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.product_scores         RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.voice_notes            RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.product_translations   RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.product_images         RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.wishlists              RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.proposals              RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.inquiries              RESTART IDENTITY CASCADE;

-- Mid-level tables
TRUNCATE TABLE public.products               RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.buyer_requests         RESTART IDENTITY CASCADE;

-- Artisans table (parent of products, images, etc.)
-- NOTE: This removes artisan profile data but NOT auth.users accounts
-- Users can re-onboard and their login still works
TRUNCATE TABLE public.artisans               RESTART IDENTITY CASCADE;

-- KEEP: public.profiles  (user profile records linked to auth.users)
-- KEEP: public.rag_documents (KalaMitra seed knowledge base)
-- KEEP: auth.users (all user accounts — untouched)

-- Verify cleanup (optional — run manually to check)
-- SELECT 'artisans'           AS tbl, COUNT(*) FROM public.artisans
-- UNION ALL SELECT 'products',           COUNT(*) FROM public.products
-- UNION ALL SELECT 'product_images',     COUNT(*) FROM public.product_images
-- UNION ALL SELECT 'product_translations',COUNT(*) FROM public.product_translations
-- UNION ALL SELECT 'product_scores',     COUNT(*) FROM public.product_scores
-- UNION ALL SELECT 'ai_generation_jobs', COUNT(*) FROM public.ai_generation_jobs
-- UNION ALL SELECT 'voice_notes',        COUNT(*) FROM public.voice_notes
-- UNION ALL SELECT 'wishlists',          COUNT(*) FROM public.wishlists
-- UNION ALL SELECT 'inquiries',          COUNT(*) FROM public.inquiries
-- UNION ALL SELECT 'proposals',          COUNT(*) FROM public.proposals
-- UNION ALL SELECT 'buyer_requests',     COUNT(*) FROM public.buyer_requests
-- UNION ALL SELECT 'marketing_assets',   COUNT(*) FROM public.marketing_assets
-- UNION ALL SELECT 'profiles (KEPT)',    COUNT(*) FROM public.profiles
-- UNION ALL SELECT 'rag_documents (KEPT)',COUNT(*) FROM public.rag_documents;
