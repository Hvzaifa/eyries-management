import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

async function main() {
  const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DIRECT_URL or DATABASE_URL is not set in environment variables');
  }

  console.log('Connecting to PostgreSQL database...');
  const client = new Client({ connectionString });
  await client.connect();

  console.log('Reading db/schema.sql...');
  const schemaSql = readFileSync(join(process.cwd(), 'db', 'schema.sql'), 'utf-8');

  console.log('Executing schema migration SQL...');
  await client.query(schemaSql);
  console.log('Schema migration applied successfully!');

  await client.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
