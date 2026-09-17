import http from 'http';
import app from '../src/app';
import { getPool } from '../src/services/db';
import ExcelJS from 'exceljs';

async function runAcceptanceTests() {
  const pool = getPool();

  // Find or create an artisan and product
  let artisan = (await pool.query('SELECT * FROM public.artisans LIMIT 1')).rows[0];
  if (!artisan) {
    const artRes = await pool.query(`
      INSERT INTO public.artisans (user_id, name, state, craft_type)
      VALUES ('00000000-0000-4000-8000-000000000010', 'Master Weaver', 'Uttar Pradesh', 'Handloom & Pottery')
      RETURNING *;
    `);
    artisan = artRes.rows[0];
  }

  let product = (await pool.query('SELECT * FROM public.products WHERE artisan_id = $1 LIMIT 1', [artisan.id])).rows[0];
  if (!product) {
    const prodRes = await pool.query(`
      INSERT INTO public.products (
        artisan_id, name, category, description_en, price, mrp, stock_quantity,
        sku, hsn_code, gst_rate, country_of_origin, image_url, status
      ) VALUES (
        $1, 'Handcrafted Terracotta Urn', 'Home & Living / Pottery',
        'Traditional handmade terracotta urn crafted with natural clay.',
        1850, 2400, 15, 'TC-URN-001', '69120010', 12.0, 'India',
        'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61', 'published'
      ) RETURNING *;
    `, [artisan.id]);
    product = prodRes.rows[0];
  }

  console.log(`Using Test Artisan: ${artisan.id} (user: ${artisan.user_id})`);
  console.log(`Using Test Product: ${product.id} (${product.name})`);

  // Start temporary server for acceptance tests
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  // Fake auth token helper: since app uses requireAuth, let's see what requireAuth expects
  // Let's check middleware/auth.ts to create a valid authorization header
}
