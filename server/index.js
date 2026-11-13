// Local development launcher. In production Vercel runs api/index.js instead.
import app, { ready } from './app.js'
import { closeDb, databaseKind } from './db.js'

const PORT = process.env.PORT || 3001

await ready() // locally, fail fast at startup if the database cannot be opened
const server = app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}, database: ${databaseKind}`)
})

// When asked to stop (Ctrl+C, or a host shutting the app down): stop taking requests,
// close the database cleanly, then exit.
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) {
  process.on(signal, async () => {
    console.log(`${signal} received, shutting down...`)
    server.close()
    await closeDb()
    process.exit(0)
  })
}
