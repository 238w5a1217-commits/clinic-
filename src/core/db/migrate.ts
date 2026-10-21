import fs from 'fs';
import path from 'path';
import { pool, query } from './client';

export async function runMigrations() {
  console.log('🔄 Running database migrations...');
  try {
    const schemaPath = path.join(process.cwd(), 'src', 'core', 'db', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf-8');

    // Execute schema DDL
    await query(sql);

    // Verify tables
    const tableRes = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('clinics', 'slots', 'bookings')
      ORDER BY table_name;
    `);

    console.log('✅ Migrations completed successfully! Verified tables:', tableRes.rows.map(r => r.table_name));
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// When run directly from CLI
if (require.main === module || process.argv[1]?.includes('migrate')) {
  runMigrations()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
