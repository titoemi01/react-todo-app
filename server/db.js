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

let local // the PGlite instance, when we use it (so closeDb can shut it down cleanly)

// PGlite keeps its data in a folder that only ONE running server may use. Two servers writing to
// the same folder corrupt it. So the first server writes its process id into a lock file, and a
// second server refuses to start while that process is alive. If the old process is gone (it
// crashed or was killed), the lock is stale and the new server simply takes over.
function claimDataDir(dataDir) {
  const lockFile = `${dataDir}.lock`
  try {
    const owner = Number(fs.readFileSync(lockFile, 'utf8'))
    if (owner && owner !== process.pid) {
      let alive = true
      try {
        process.kill(owner, 0) // signal 0 = "does this process exist?", it doesn't kill anything
      } catch (error) {
        alive = error.code === 'EPERM' // exists but belongs to someone else
      }
      if (alive) {
        console.error(
          `Another server (process ${owner}) is already using the local database.\n` +
            'Stop that server first (only one can use it at a time).\n' +
            `If you are sure no other server is running, delete ${lockFile} and try again.`
        )
        process.exit(1)
      }
    }
  } catch {
    // no lock file yet: nobody owns the database
  }

  fs.writeFileSync(lockFile, String(process.pid))
  process.on('exit', () => {
    try {
      if (Number(fs.readFileSync(lockFile, 'utf8')) === process.pid) fs.unlinkSync(lockFile)
    } catch {
      // already gone
    }
  })
}

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
  claimDataDir(dataDir)
  local = new PGlite(dataDir)

  pool = {
    async query(sql, params) {
      const result = await local.query(sql, params)
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length }
    },
  }
}

// The columns we send to the browser. A DATE would arrive as a JavaScript Date object (and can
// shift by a day with time zones), so we ask Postgres for plain "YYYY-MM-DD" text instead and
// name it dueDate, the field the React app already uses.
export const TASK_COLUMNS = `id, title, completed, priority, to_char(due_date, 'YYYY-MM-DD') AS "dueDate"`

// Create the table on first start, and add columns that older copies of the table are missing.
// Both statements are safe to run every time.
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

  // A tiny "migration": due dates were added after the table first existed.
  await pool.query('ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE')
}

// Close the database cleanly (used when the server is asked to stop, e.g. Ctrl+C).
export async function closeDb() {
  if (hasRealUrl) await pool.end()
  else await local.close()
}

export async function listTasks() {
  const { rows } = await pool.query(`SELECT ${TASK_COLUMNS} FROM tasks ORDER BY id`)
  return rows
}
