import { getPool } from '../src/services/db';

async function main() {
  try {
    const pool = getPool();
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public';
    `);
    console.log('Connected to DB! Tables found:', res.rows.map(r => r.table_name));
    process.exit(0);
  } catch (err) {
    console.error('DB Connection error:', err);
    process.exit(1);
  }
}

main();
