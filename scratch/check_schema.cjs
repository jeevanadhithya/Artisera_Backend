const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function check() {
  const prodCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'products' 
    ORDER BY ordinal_position;
  `);
  console.log('Products columns:\n', prodCols.rows);

  const transCols = await pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'product_translations' 
    ORDER BY ordinal_position;
  `);
  console.log('\nProduct translations columns:\n', transCols.rows);

  await pool.end();
}

check().catch(console.error);
