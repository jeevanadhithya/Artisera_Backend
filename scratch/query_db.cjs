const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('Connecting to PostgreSQL database...');
    const tables = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' ORDER BY table_name;
    `);
    console.log('Tables:', tables.rows.map(r => r.table_name));

    const categories = await pool.query(`
      SELECT DISTINCT category, count(*) as count 
      FROM public.products 
      GROUP BY category 
      ORDER BY count DESC;
    `);
    console.log('Categories in products:', categories.rows);

    const products = await pool.query(`
      SELECT id, name, category, status, price, created_at 
      FROM public.products 
      ORDER BY created_at DESC 
      LIMIT 10;
    `);
    console.log('Recent products:', products.rows);

    await pool.end();
  } catch (err) {
    console.error('DB Error:', err);
    process.exit(1);
  }
}

run();
