import express from 'express'
import cors from 'cors'
import { pool, initDb, listTasks, databaseKind, TASK_COLUMNS } from './db.js'
import debugNet from './debug.js'

// This file builds the Express app and nothing else: it never calls listen().
// Two things use it:
//   - server/index.js  -> starts it on a port for local development
//   - api/index.js     -> Vercel runs it as a serverless function in production
export const app = express()

const PRIORITIES = ['High', 'Medium', 'Low']
const MAX_TASKS = 500 // the list is public, so cap it: nobody can fill the database

app.use(cors())
app.use(express.json({ limit: '10kb' })) // refuse huge request bodies

// DIAGNOSTICS: preview deployments only (answers 404 on the live site). It is registered BEFORE
// the "database ready" check below on purpose: it has to work exactly when the database does not.
app.get('/api/debug-net', debugNet)

// Create the table before the first request is handled. In production every cold start of the
// function runs this once; it is safe to repeat because it only creates what is missing.
export const ready = initDb()
ready.catch((error) => console.error('Database setup failed:', error))
app.use(async (req, res, next) => {
  await ready // if setup failed this throws, and the error handler below answers with a 500
  next()
})

// Never let a browser or CDN cache API answers: every poll must see the latest list.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

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

// READ
app.get('/api/tasks', async (req, res) => {
  res.json(await listTasks())
})

// CREATE
app.post('/api/tasks', async (req, res) => {
  const error = validate(req.body ?? {})
  if (error) return res.status(400).json({ error })

  const { rows: counted } = await pool.query('SELECT count(*)::int AS n FROM tasks')
  if (counted[0].n >= MAX_TASKS) {
    return res.status(400).json({ error: `the list is full (max ${MAX_TASKS} tasks)` })
  }

  const { rows } = await pool.query(
    `INSERT INTO tasks (title, priority, due_date) VALUES ($1, $2, $3::date)
     RETURNING ${TASK_COLUMNS}`,
    [req.body.title.trim(), req.body.priority ?? 'Medium', dateOrNull(req.body.dueDate)]
  )
  res.status(201).json(rows[0])
})

// BULK: mark everything complete
app.post('/api/tasks/complete-all', async (req, res) => {
  await pool.query('UPDATE tasks SET completed = true')
  res.json(await listTasks())
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
      WHERE id = $6
      RETURNING ${TASK_COLUMNS}`,
    [
      title?.trim() ?? null,
      priority ?? null,
      completed ?? null,
      dueDateSent,
      dateOrNull(dueDate),
      id,
    ]
  )
  if (rows.length === 0) return res.status(404).json({ error: 'task not found' })
  res.json(rows[0])
})

// DELETE one
app.delete('/api/tasks/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' })

  const { rowCount } = await pool.query('DELETE FROM tasks WHERE id = $1', [id])
  if (rowCount === 0) return res.status(404).json({ error: 'task not found' })
  res.status(204).end()
})

// DELETE many: ?completed=true clears finished tasks, no query clears everything
app.delete('/api/tasks', async (req, res) => {
  if (req.query.completed === 'true') {
    await pool.query('DELETE FROM tasks WHERE completed = true')
  } else {
    await pool.query('DELETE FROM tasks')
  }
  res.json(await listTasks())
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
