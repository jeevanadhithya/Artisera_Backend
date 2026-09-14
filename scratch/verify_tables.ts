import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false },
});

async function verify() {
  await client.connect();
  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);

  console.log('Tables in public schema:');
  console.table(res.rows.map(r => r.table_name));

  const ragCount = await client.query(`SELECT count(*) FROM public.rag_documents;`);
  console.log(`RAG Documents count: ${ragCount.rows[0].count}`);

  await client.end();
}

verify();
