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
// DATABASE_URL is the usual name; Vercel's Neon integration may provide POSTGRES_URL instead.
const rawUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL

// Copy-paste into a settings form often adds invisible trouble: spaces or a newline around the
// value, wrapping quotes, or the "channel_binding" option that this driver does not need.
// Clean those up so a harmless paste mistake cannot break the connection.
function cleanUrl(value) {
  if (!value) return value
  return value
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .replace(/([?&])channel_binding=[^&]*&?/, '$1')
    .replace(/[?&]$/, '')
}

// A description of the connection string that is safe to put in logs: it never includes the
// password, only the parts that help find a typo (host, database, option names, length).
function describeUrl(value) {
  const text = value ?? ''
  const info = {
    length: text.length,
    hadOuterWhitespaceOrQuotes: text !== text.trim() || /^['"]|['"]$/.test(text.trim()),
    hadChannelBinding: /channel_binding/.test(text),
  }
  try {
    const u = new URL(text.trim().replace(/^['"]+|['"]+$/g, ''))
    return {
      ...info,
      scheme: u.protocol,
      user: u.username,
      hasPassword: u.password.length > 0,
      host: u.hostname,
      port: u.port || '(default)',
      database: u.pathname.replace('/', ''),
      options: [...u.searchParams.keys()],
    }
  } catch {
    return { ...info, parseable: false, startsWith: text.trim().slice(0, 12) }
  }
}

const url = cleanUrl(rawUrl)
export const connectionUrl = url // used only by the preview-only diagnostics in debug.js
const hasRealUrl = Boolean(url) && !url.includes('USER:PASSWORD@HOST')

if (process.env.VERCEL && hasRealUrl) {
  console.log('Database connection string as received:', JSON.stringify(describeUrl(rawUrl)))
}

// On Vercel the disk is read-only and wiped between runs, so the local PGlite database can never
// work there. Fail loudly instead of with a confusing file-system error.
if (process.env.VERCEL && !hasRealUrl) {
  throw new Error(
    'No database configured: add a Neon database to this Vercel project (Storage tab) so that ' +
      'DATABASE_URL is set, then redeploy.'
  )
}

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

// Each serverless instance keeps only a few connections: many instances can run at once,
// and the database has a limit on total connections.
// connectionTimeoutMillis makes a stuck connection fail in 10 seconds instead of hanging.
const poolOptions = { connectionString: url, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 }

function isNeonHost(value) {
  try {
    return new URL(value).hostname.endsWith('.neon.tech')
  } catch {
    return false
  }
}

if (hasRealUrl && isNeonHost(url)) {
  // Neon's own driver. A normal Postgres connection (TCP on port 5432) from a serverless function
  // was timing out; this driver tunnels the same protocol over a WebSocket on the ordinary secure
  // web port (443), which is the route Neon recommends for serverless hosts like Vercel.
  databaseKind = 'Neon (serverless driver)'
  const { Pool, neonConfig } = await import('@neondatabase/serverless')
  const { default: ws } = await import('ws')
  neonConfig.webSocketConstructor = ws
  pool = new Pool(poolOptions)
} else if (hasRealUrl) {
  databaseKind = 'Postgres (DATABASE_URL)'
  pool = new pg.Pool(poolOptions)
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
