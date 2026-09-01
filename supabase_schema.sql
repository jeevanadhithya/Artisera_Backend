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


