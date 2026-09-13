const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrate() {
  console.log('Running database schema updates on Supabase PostgreSQL...');

  // 1. Add missing columns to products
  await pool.query(`
    ALTER TABLE public.products
    ADD COLUMN IF NOT EXISTS wholesale_price numeric,
    ADD COLUMN IF NOT EXISTS export_price numeric,
    ADD COLUMN IF NOT EXISTS fair_price_explanation text,
    ADD COLUMN IF NOT EXISTS pricing_breakdown jsonb,
    ADD COLUMN IF NOT EXISTS voice_url text;
  `);
  console.log('Updated public.products columns successfully.');

  // 2. Add missing columns to product_translations
  await pool.query(`
    ALTER TABLE public.product_translations
    ADD COLUMN IF NOT EXISTS pricing_explanation text,
    ADD COLUMN IF NOT EXISTS price_formatted text;
  `);
  console.log('Updated public.product_translations columns successfully.');

  // 3. Ensure unique constraint on (product_id, language_code) for upserting
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_product_translations_product_lang'
      ) THEN
        ALTER TABLE public.product_translations
        ADD CONSTRAINT uq_product_translations_product_lang UNIQUE (product_id, language_code);
      END IF;
    END
    $$;
  `);
  console.log('Unique constraint uq_product_translations_product_lang verified.');

  // 4. Verify columns
  const prodCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'products' 
    AND column_name IN ('wholesale_price', 'export_price', 'fair_price_explanation', 'pricing_breakdown', 'voice_url');
  `);
  console.log('Verified products columns:', prodCols.rows.map(r => r.column_name));

  const transCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'product_translations' 
    AND column_name IN ('pricing_explanation', 'price_formatted');
  `);
  console.log('Verified translations columns:', transCols.rows.map(r => r.column_name));

  await pool.end();
  console.log('Migration completed successfully!');
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
