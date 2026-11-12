import express from 'express'
import cors from 'cors'
import { pool, initDb, listTasks, databaseKind } from './db.js'

const app = express()
const PORT = process.env.PORT || 3001
const PRIORITIES = ['High', 'Medium', 'Low']

app.use(cors())
app.use(express.json())

// Small helper: check the data a client sends. Never trust the client.
function validate({ title, priority }, { partial = false } = {}) {
  if (title !== undefined || !partial) {
    if (typeof title !== 'string' || title.trim() === '') return 'title is required'
    if (title.length > 200) return 'title is too long (max 200 characters)'
  }
  if (priority !== undefined && !PRIORITIES.includes(priority)) {
    return `priority must be one of: ${PRIORITIES.join(', ')}`
  }
  return null
}

// Every query below uses $1, $2... placeholders and passes values separately.
// NEVER build SQL by gluing user text into a string: that is how SQL injection happens.

// READ
app.get('/api/tasks', async (req, res) => {
  res.json(await listTasks())
})

// CREATE
app.post('/api/tasks', async (req, res) => {
  const error = validate(req.body)
  if (error) return res.status(400).json({ error })

  const { rows } = await pool.query(
    `INSERT INTO tasks (title, priority) VALUES ($1, $2)
     RETURNING id, title, completed, priority`,
    [req.body.title.trim(), req.body.priority ?? 'Medium']
  )
  res.status(201).json(rows[0])
})

// BULK: mark everything complete
app.post('/api/tasks/complete-all', async (req, res) => {
  await pool.query('UPDATE tasks SET completed = true')
  res.json(await listTasks())
})

// UPDATE: only change the fields the client sent. COALESCE keeps the old value when $n is null.
app.patch('/api/tasks/:id', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' })

  const { title, priority, completed } = req.body
  const error = validate({ title, priority }, { partial: true })
  if (error) return res.status(400).json({ error })
  if (completed !== undefined && typeof completed !== 'boolean') {
    return res.status(400).json({ error: 'completed must be true or false' })
  }

  const { rows } = await pool.query(
    `UPDATE tasks
        SET title     = COALESCE($1, title),
            priority  = COALESCE($2, priority),
            completed = COALESCE($3, completed)
      WHERE id = $4
      RETURNING id, title, completed, priority`,
    [title?.trim() ?? null, priority ?? null, completed ?? null, id]
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
  console.error(err)
  if (res.headersSent) return next(err)
  res.status(500).json({ error: 'Something went wrong on the server' })
})

await initDb()
app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}, database: ${databaseKind}`)
})
