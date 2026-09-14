import fs from 'fs';
import path from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../.env') });

const dbUrl = process.env.DATABASE_URL;

if (!dbUrl) {
  console.error('ERROR: DATABASE_URL is not set in .env');
  process.exit(1);
}

console.log('Connecting to PostgreSQL database via connection pooling URL...');

const client = new Client({
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function runMigration() {
  try {
    await client.connect();
    console.log('Connected to PostgreSQL database successfully!');

    const schemaPath = path.join(__dirname, '../supabase_schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log(`Executing SQL script from ${schemaPath} (${sql.length} characters)...`);
    
    await client.query(sql);

    console.log('SUCCESS! All database tables, indexes, RLS policies, triggers, and seed records have been applied!');
  } catch (err: any) {
    console.error('Error executing schema migration:', err.message || err);
    // Print detail if available
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    if (err.position) console.error('Position:', err.position);
  } finally {
    await client.end();
  }
}

runMigration();
