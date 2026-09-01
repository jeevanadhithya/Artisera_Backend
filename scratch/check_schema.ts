import { getPool } from '../src/services/db';

async function main() {
  try {
    const pool = getPool();
    const cols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'products';
    `);
    console.log('Products columns:', cols.rows);

    const imgCols = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'product_images';
    `);
    console.log('Product_images columns:', imgCols.rows);
  } catch (e) {
    console.error(e);
  }
}

main();
