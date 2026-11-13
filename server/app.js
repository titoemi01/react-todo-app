import express from 'express'
import { pool, initDb, listTasks, databaseKind, TASK_COLUMNS } from './db.js'
import { authRouter, requireAuth, sameOriginOnly } from './auth.js'

// This file builds the Express app and nothing else: it never calls listen().
// Two things use it:
//   - server/index.js  -> starts it on a port for local development
//   - api/index.js     -> Vercel runs it as a serverless function in production
export const app = express()

const PRIORITIES = ['High', 'Medium', 'Low']
const MAX_TASKS = 500 // per person: nobody can fill the database

// The site and the API share one address (Vercel, and the Vite proxy in development), so no
// cross-site access (CORS) is allowed or needed.
app.use(express.json({ limit: '10kb' })) // refuse huge request bodies

// Create the tables before the first real request is handled.
//
// Two rules learned the hard way on Vercel:
//   1. Do it LAZILY, inside a request, not while the file is first loaded. Network calls made at
//      load time (before any request exists) were timing out on Vercel.
//   2. Never remember a FAILURE. The old version stored the failed attempt forever, so one hiccup
//      broke every request until Vercel threw the instance away. Now a failed setup is forgotten
//      and the next request simply tries again. Only a success is kept.
// It is safe to repeat because it only creates what is missing.
let setupPromise = null
export function ready() {
  if (!setupPromise) {
    setupPromise = initDb().catch((error) => {
      setupPromise = null // forget the failure so the next request retries
      console.error('Database setup failed:', error)
      throw error
    })
  }
  return setupPromise
}

app.use(async (req, res, next) => {
  await ready() // if setup failed this throws, and the error handler below answers with a 500
  next()
})

// Never let a browser or CDN cache API answers: every poll must see the latest list.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

// Refuse changes that were sent from a page on a different website.
app.use('/api', sameOriginOnly)

// A due date is "" / null (no date) or a real calendar day written YYYY-MM-DD.
function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  // Rejects things like 2026-02-31, which JavaScript would silently roll into March.
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

// Check the data a client sends. Never trust the client.
function validate({ title, priority, dueDate }, { partial = false } = {}) {
  if (title !== undefined || !partial) {
    if (typeof title !== 'string' || title.trim() === '') return 'title is required'
    if (title.length > 200) return 'title is too long (max 200 characters)'
  }
  if (priority !== undefined && !PRIORITIES.includes(priority)) {
    return `priority must be one of: ${PRIORITIES.join(', ')}`
  }
  if (dueDate !== undefined && dueDate !== null && dueDate !== '') {
    if (typeof dueDate !== 'string' || !isValidDate(dueDate)) {
      return 'dueDate must be a real date written as YYYY-MM-DD'
    }
  }
  return null
}

// "" and null both mean "no due date". The database stores that as NULL.
const dateOrNull = (value) => (value ? value : null)

// Every query below uses $1, $2... placeholders and passes values separately.
// NEVER build SQL by gluing user text into a string: that is how SQL injection happens.

// HEALTH: a tiny check that the database answers. It reveals nothing about the data or the
// connection string, only which driver is in use.
app.get('/api/health', async (req, res) => {
  const started = Date.now()
  await pool.query('SELECT 1')
  res.json({ ok: true, database: databaseKind, ms: Date.now() - started })
})

// ACCOUNTS: /api/auth/register, /login, /logout, /me
app.use('/api/auth', authRouter)

// EVERYTHING BELOW IS PRIVATE. requireAuth answers 401 unless the browser has a valid session,
// and otherwise sets req.user. Every query then filters by req.user.id, so a person can only ever
// read or change their OWN tasks: someone else's task id behaves exactly like one that does not exist.
app.use('/api/tasks', requireAuth)

// READ
app.get('/api/tasks', async (req, res) => {
  res.json(await listTasks(req.user.id))
})

// CREATE
app.post('/api/tasks', async (req, res) => {
  const error = validate(req.body ?? {})
  if (error) return res.status(400).json({ error })

  const { rows: counted } = await pool.query('SELECT count(*)::int AS n FROM tasks WHERE user_id = $1', [req.user.id])
  if (counted[0].n >= MAX_TASKS) {
    return res.status(400).json({ error: `the list is full (max ${MAX_TASKS} tasks)` })
  }

  const { rows } = await pool.query(
    `INSERT INTO tasks (user_id, title, priority, due_date) VALUES ($1, $2, $3, $4::date)
     RETURNING ${TASK_COLUMNS}`,
    [req.user.id, req.body.title.trim(), req.body.priority ?? 'Medium', dateOrNull(req.body.dueDate)]
  )
  res.status(201).json(rows[0])
})

// BULK: mark everything of mine complete
app.post('/api/tasks/complete-all', async (req, res) => {
  await pool.query('UPDATE tasks SET completed = true WHERE user_id = $1', [req.user.id])
  res.json(await listTasks(req.user.id))
})

// UPDATE: only change the fields the client sent.
// COALESCE keeps the old value when the client sent nothing for that field. A due date needs a
// separate "was it sent?" flag, because sending "" must be able to CLEAR the date.
app.patch('/api/tasks/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' })

  const { title, priority, completed, dueDate } = req.body ?? {}
  const error = validate({ title, priority, dueDate }, { partial: true })
  if (error) return res.status(400).json({ error })
  if (completed !== undefined && typeof completed !== 'boolean') {
    return res.status(400).json({ error: 'completed must be true or false' })
  }

  const dueDateSent = dueDate !== undefined

  const { rows } = await pool.query(
    `UPDATE tasks
        SET title     = COALESCE($1, title),
            priority  = COALESCE($2, priority),
            completed = COALESCE($3, completed),
            due_date  = CASE WHEN $4::boolean THEN $5::date ELSE due_date END
      WHERE id = $6 AND user_id = $7
      RETURNING ${TASK_COLUMNS}`,
    [
      title?.trim() ?? null,
      priority ?? null,
      completed ?? null,
      dueDateSent,
      dateOrNull(dueDate),
      id,
      req.user.id,
    ]
  )
  if (rows.length === 0) return res.status(404).json({ error: 'task not found' })
  res.json(rows[0])
})

// DELETE one of mine
app.delete('/api/tasks/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' })

  const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1 AND user_id = $2', [id, req.user.id])
  if (rowCount === 0) return res.status(404).json({ error: 'task not found' })
  res.status(204).end()
})

// DELETE many of mine: ?completed=true clears finished tasks, no query clears all my tasks
app.delete('/api/tasks', async (req, res) => {
  if (req.query.completed === 'true') {
    await pool.query('DELETE FROM tasks WHERE completed = true AND user_id = $1', [req.user.id])
  } else {
    await pool.query('DELETE FROM tasks WHERE user_id = $1', [req.user.id])
  }
  res.json(await listTasks(req.user.id))
})

// Error handler: Express 5 sends errors from async routes here automatically.
// The client gets a generic message; the details stay in the server log.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err)
  // express.json() reports a too-big or malformed body with its own status (413, 400).
  // That is the client's mistake, not a server fault, so it gets a short log line, not a stack trace.
  if (err.status && err.status < 500) {
    console.warn(`${req.method} ${req.originalUrl}: ${err.type || 'bad request'}`)
    return res.status(err.status).json({ error: 'invalid request body' })
  }
  console.error(err)
  // On Vercel PREVIEW deployments (and on a developer's computer) include the real reason in the
  // answer, so a failure can be understood from the browser without digging through logs.
  // The live production site never does: there the client only gets the generic message.
  const body = { error: 'Something went wrong on the server' }
  if (process.env.VERCEL_ENV !== 'production') {
    body.detail = `${err.name}: ${String(err.message).slice(0, 300)}${err.code ? ` (code ${err.code})` : ''}`
  }
  res.status(500).json(body)
})

export default app
