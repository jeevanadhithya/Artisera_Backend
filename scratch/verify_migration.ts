import { getPool } from '../src/services/db';

async function verify() {
  const pool = getPool();
  try {
    const res1 = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND table_name = 'products'
      AND column_name IN ('sku', 'mrp', 'stock_quantity', 'hsn_code')
      ORDER BY column_name;
    `);
    console.log('--- COLUMNS IN public.products ---');
    console.log(JSON.stringify(res1.rows, null, 2));

    const res2 = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('marketplace_templates', 'marketplace_exports')
      ORDER BY table_name;
    `);
    console.log('--- TABLES IN public ---');
    console.log(JSON.stringify(res2.rows, null, 2));

    const res3 = await pool.query(`
      SELECT indexname, tablename
      FROM pg_indexes
      WHERE schemaname = 'public'
      AND tablename = 'marketplace_exports';
    `);
    console.log('--- INDEXES ON marketplace_exports ---');
    console.log(JSON.stringify(res3.rows, null, 2));

    const res4 = await pool.query(`
      SELECT marketplace, template_name, category, version, active
      FROM public.marketplace_templates
      ORDER BY marketplace;
    `);
    console.log('--- SEEDED TEMPLATES ---');
    console.log(JSON.stringify(res4.rows, null, 2));
  } finally {
    await pool.end();
  }
}

verify().catch(e => {
  console.error('Verification failed:', e);
  process.exit(1);
});
