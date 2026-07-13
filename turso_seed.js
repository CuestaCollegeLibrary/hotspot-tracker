// ============================================================
// TURSO SEED SCRIPT
// Run with: node turso_seed.js
//
// What this does:
//   1. Creates the hotspot_state table in your Turso database
//   2. Migrates your existing data from Supabase into Turso
//
// Requirements:  node 18+  (uses built-in fetch)
//   npm install @libsql/client
// ============================================================

const { createClient } = require('@libsql/client');
const fs = require('fs');

const TURSO_URL   = 'libsql://hotspot-tracker-cuestacollegelibrary.aws-us-west-2.turso.io';
const TURSO_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODM5ODEwODcsImlkIjoiMDE5ZjVkOGUtNmIwMS03MTA2LTg2ODgtYTViYWVlYWEyZmU2Iiwia2lkIjoiMktaRFFnQUt0ZEo5MXZvRURuZER6N2laTktYUDNUUnRfYXhKY0EzcEdZMCIsInJpZCI6IjVhY2MyNGVjLTA1ZGQtNDljNy04OWM1LWZiYWI1NTczNDJlOCJ9.nZDHSOpdUz-I1VpakXZksBvNrVGU5M5WrnYKDqlRdt5uShWBbS3Vvrb56NOqhLT_xf2Vo7u1DKrTmWU71IhWAQ';

// Load the exported Supabase data (saved alongside this script)
const DATA_FILE = './state_data_raw.json';

async function main() {
  console.log('Connecting to Turso…');
  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  // ── Step 1: Create tables ─────────────────────────────────────────────────
  console.log('Creating tables…');
  await db.execute(`
    CREATE TABLE IF NOT EXISTS hotspot_state (
      id          TEXT PRIMARY KEY,
      data        TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // hotspot_snapshots is referenced in the codebase but the app
  // no longer uses it (snapshots live in localStorage). Create it
  // anyway so the schema matches Supabase exactly.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS hotspot_snapshots (
      id          TEXT PRIMARY KEY,
      data        TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  console.log('✓ Tables ready');

  // ── Step 2: Load existing data ────────────────────────────────────────────
  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ Could not find ' + DATA_FILE);
    console.error('   Make sure state_data_raw.json is in the same folder as this script.');
    process.exit(1);
  }

  const raw = fs.readFileSync(DATA_FILE, 'utf8');

  // Validate it's real JSON before sending
  try {
    const parsed = JSON.parse(raw);
    console.log('✓ Data file valid — ' + (parsed.hotspots?.length ?? '?') + ' hotspots, '
      + (parsed.profiles?.length ?? '?') + ' profiles, '
      + (parsed.changeHistory?.length ?? '?') + ' change records');
  } catch(e) {
    console.error('❌ state_data_raw.json is not valid JSON:', e.message);
    process.exit(1);
  }

  console.log('Seeding hotspot_state…');
  await db.execute({
    sql: `INSERT INTO hotspot_state (id, data, updated_at)
          VALUES ('main', ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    args: [raw],
  });
  console.log('✓ Data seeded into Turso');

  // ── Step 3: Verify ────────────────────────────────────────────────────────
  const check = await db.execute(`SELECT length(data) AS len FROM hotspot_state WHERE id = 'main'`);
  const len = check.rows[0]?.len ?? 0;
  console.log('✓ Verified — stored row size: ' + len.toLocaleString() + ' chars');

  console.log('\n✅ Migration complete! Your app is ready to use Turso.');
  db.close();
}

main().catch(e => {
  console.error('❌ Migration failed:', e.message);
  process.exit(1);
});
