-- Artisera Database Schema

-- 1. Artisans Table
CREATE TABLE IF NOT EXISTS public.artisans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    language TEXT NOT NULL,
    state TEXT NOT NULL,
    district TEXT NOT NULL,
    location TEXT,
    craft_type TEXT NOT NULL,
    cluster_id TEXT,
    profile_image TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id)
);

-- 2. Products Table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artisan_id UUID NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT,
    material TEXT,
    craft_type TEXT,
    region TEXT,
    price NUMERIC(10, 2),
    minimum_price NUMERIC(10, 2),
    maximum_price NUMERIC(10, 2),
    description_en TEXT,
    description_hi TEXT,
    keywords TEXT[],
    status TEXT DEFAULT 'draft'::text NOT NULL,
    image_url TEXT,
    primary_image_url TEXT,
    selected_image_url TEXT,
    original_image_url TEXT,
    enhanced_image_url TEXT,
    voice_transcript TEXT,
    voice_language TEXT,
    ai_generated BOOLEAN DEFAULT false NOT NULL,
    ai_confidence NUMERIC(4, 3),
    material_cost NUMERIC(10, 2),
    labor_cost NUMERIC(10, 2),
    production_cost NUMERIC(10, 2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Product Images Table
CREATE TABLE IF NOT EXISTS public.product_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    artisan_id UUID NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
    original_image_url TEXT NOT NULL,
    enhanced_image_url TEXT,
    selected_image_url TEXT,
    processing_status TEXT NOT NULL DEFAULT 'uploaded',
    analysis_status TEXT DEFAULT 'pending',
    enhancement_prompt TEXT,
    mime_type TEXT,
    file_size BIGINT,
    analysis_result JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_images_artisan_id ON public.product_images(artisan_id);
CREATE INDEX IF NOT EXISTS idx_product_images_status ON public.product_images(processing_status);

-- 4. Product Translations Table
CREATE TABLE IF NOT EXISTS public.product_translations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    language_code TEXT NOT NULL,
    title TEXT,
    short_description TEXT,
    description TEXT,
    keywords TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(product_id, language_code)
);

-- 5. Buyer Requests Table
CREATE TABLE IF NOT EXISTS public.buyer_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_category TEXT NOT NULL,
    description TEXT,
    quantity INTEGER NOT NULL,
    budget_per_unit NUMERIC(10, 2) NOT NULL,
    location TEXT NOT NULL,
    deadline DATE NOT NULL,
    status TEXT DEFAULT 'open'::text NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

-- 6. Set up Row Level Security (RLS)
ALTER TABLE public.artisans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_requests ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users (service role bypasses RLS automatically)
CREATE POLICY "Enable all access for authenticated users" ON public.artisans FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.products FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.product_images FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.product_translations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.buyer_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Allow anonymous reads for public marketplace
CREATE POLICY "Enable read access for all users" ON public.products FOR SELECT USING (status = 'published');
CREATE POLICY "Enable read access for all users" ON public.artisans FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON public.product_images FOR SELECT USING (true);
CREATE POLICY "Enable read access for all now" ON public.product_translations FOR SELECT USING (true);

-- 7. Wishlists Table
CREATE TABLE IF NOT EXISTS public.wishlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(user_id, product_id)
);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users" ON public.wishlists FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 8. Unified Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('artisan', 'buyer', 'admin')) DEFAULT 'artisan',
    full_name TEXT NOT NULL,
    phone TEXT,
    avatar_url TEXT,
    craft_type TEXT,
    state TEXT,
    district TEXT,
    village TEXT,
    languages TEXT[] DEFAULT ARRAY['en']::text[],
    years_experience INTEGER DEFAULT 1,
    craft_story TEXT,
    production_capacity_monthly INTEGER DEFAULT 10,
    preferred_buyer_types TEXT[] DEFAULT ARRAY['retail', 'wholesale']::text[],
    profile_completion_pct INTEGER DEFAULT 20,
    company_name TEXT,
    buyer_type TEXT CHECK (buyer_type IS NULL OR buyer_type IN ('retail_consumer', 'boutique', 'interior_designer', 'corporate', 'exporter')),
    gst_number TEXT,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 9. Product Scores Table
CREATE TABLE IF NOT EXISTS public.product_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE UNIQUE,
    overall_score NUMERIC(5, 2) NOT NULL,
    image_quality_score NUMERIC(5, 2) NOT NULL,
    catalog_quality_score NUMERIC(5, 2) NOT NULL,
    discoverability_score NUMERIC(5, 2) NOT NULL,
    pricing_competitiveness_score NUMERIC(5, 2) NOT NULL,
    market_fit_score NUMERIC(5, 2) NOT NULL,
    breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    recommendations TEXT[] DEFAULT ARRAY[]::text[],
    calculated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. AI Generation Jobs Table
CREATE TABLE IF NOT EXISTS public.ai_generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL CHECK (job_type IN (
      'image_enhancement', 'voice_catalog', 'pricing', 'product_score',
      'image_variation', 'product_video', 'ai_reel'
    )),
    status TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'cancelled')) DEFAULT 'queued',
    progress_pct INTEGER DEFAULT 0,
    input_payload JSONB DEFAULT '{}'::jsonb,
    result_data JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 11. Buyer Inquiries Table
CREATE TABLE IF NOT EXISTS public.inquiries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    artisan_id UUID NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    target_budget_per_unit NUMERIC(10, 2),
    message TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'proposal_sent', 'accepted', 'declined', 'closed')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. B2B Proposals Table
CREATE TABLE IF NOT EXISTS public.proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inquiry_id UUID REFERENCES public.inquiries(id) ON DELETE SET NULL,
    opportunity_id UUID REFERENCES public.buyer_requests(id) ON DELETE SET NULL,
    artisan_id UUID NOT NULL REFERENCES public.artisans(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    quoted_price_per_unit NUMERIC(10, 2) NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    lead_time_days INTEGER NOT NULL DEFAULT 14,
    terms_and_notes TEXT,
    ai_generated BOOLEAN DEFAULT true,
    artisan_edited BOOLEAN DEFAULT false,
    status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'accepted', 'declined')) DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 13. Marketing Assets Table
CREATE TABLE IF NOT EXISTS public.marketing_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL CHECK (asset_type IN (
      'variation_studio', 'variation_festive', 'variation_premium',
      'product_video', 'ai_reel', 'gem_package_pdf', 'gem_package_csv'
    )),
    asset_url TEXT NOT NULL,
    thumbnail_url TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);



