import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'

// Two ways to run, same SQL either way:
//   1. DATABASE_URL set (a real Postgres, e.g. Neon)  -> used in production.
//   2. Not set                                        -> PGlite: real Postgres running inside
//      this Node process, saving to the server/data folder. No install, no account, no secrets.
//
// The template value from .env.example counts as "not set", so copying the template by itself
// can never break the server.
const url = process.env.DATABASE_URL
const hasRealUrl = Boolean(url) && !url.includes('USER:PASSWORD@HOST')

export let databaseKind

// Both options expose the same small interface: pool.query(sql, params) -> { rows, rowCount }
export let pool

if (hasRealUrl) {
  databaseKind = 'Postgres (DATABASE_URL)'
  pool = new pg.Pool({ connectionString: url })
} else {
  databaseKind = 'local PGlite (server/data)'
  const { PGlite } = await import('@electric-sql/pglite')
  // Default: <server folder>/data/pglite, no matter which folder the server was started from.
  // PGLITE_DIR lets you point somewhere else (handy for tests: one folder can only be open
  // in one running server at a time).
  const dataDir = process.env.PGLITE_DIR || path.join(import.meta.dirname, 'data', 'pglite')
  fs.mkdirSync(path.dirname(dataDir), { recursive: true }) // PGlite makes the folder, not its parent
  const local = new PGlite(dataDir)

  pool = {
    async query(sql, params) {
      const result = await local.query(sql, params)
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length }
    },
  }
}

// Create the table the first time the server starts. Safe to run every time.
export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      completed  BOOLEAN NOT NULL DEFAULT false,
      priority   TEXT NOT NULL DEFAULT 'Medium'
                 CHECK (priority IN ('High', 'Medium', 'Low')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
}

export async function listTasks() {
  const { rows } = await pool.query(
    'SELECT id, title, completed, priority FROM tasks ORDER BY id'
  )
  return rows
}
