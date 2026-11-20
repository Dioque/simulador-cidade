import {readFile} from 'node:fs/promises';
import {db,transaction} from './db.ts';

try {
  await transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(48136)');
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY)');
    const applied = await client.query('SELECT version FROM schema_migrations WHERE version = 1');
    if (!applied.rowCount) {
      await client.query(await readFile(new URL('../migrations/001_initial.sql', import.meta.url),'utf8'));
      await client.query('INSERT INTO schema_migrations VALUES (1)');
    }
  });
  console.log('Migrações aplicadas.');
} finally {
  await db.end();
}
