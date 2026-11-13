// Preview-only diagnostics: tries several ways of reaching the database from inside the running
// function and reports what worked and how long it took. It exists to find WHY a connection fails
// on Vercel. It is switched off on the live production site, and it never returns the password
// or the connection string.
import net from 'node:net'
import dns from 'node:dns/promises'
import pg from 'pg'
import { neon, Pool as NeonPool } from '@neondatabase/serverless'
import { connectionUrl } from './db.js'

const LIMIT_MS = 9000

async function timed(name, work) {
  const started = Date.now()
  let timer
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`no answer after ${LIMIT_MS} ms`)), LIMIT_MS)
    })
    const info = await Promise.race([work(), timeout])
    return { step: name, ok: true, ms: Date.now() - started, ...(info !== undefined && { info }) }
  } catch (error) {
    const code = error.code ? ` (code ${error.code})` : ''
    return { step: name, ok: false, ms: Date.now() - started, error: `${error.name}: ${String(error.message).slice(0, 160)}${code}` }
  } finally {
    clearTimeout(timer)
  }
}

function tcpConnect(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port })
    socket.once('connect', () => {
      const address = socket.remoteAddress // read it before closing the socket
      socket.destroy()
      resolve(`connected to ${address}`)
    })
    socket.once('error', reject)
  })
}

async function pgQuery(Pool, url) {
  const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: LIMIT_MS - 1000 })
  pool.on('error', () => {})
  try {
    const { rows } = await pool.query('SELECT 1 AS one')
    return `query ok (${rows.length} row)`
  } finally {
    pool.end().catch(() => {})
  }
}

export default async function debugNet(req, res) {
  if (process.env.VERCEL_ENV === 'production') return res.status(404).json({ error: 'not found' })
  if (!connectionUrl) return res.json({ note: 'No DATABASE_URL is set, so the local database is in use.' })

  const host = new URL(connectionUrl).hostname
  const directHost = host.replace('-pooler', '')
  const urlFor = (h) => connectionUrl.replace(host, h)

  const results = await Promise.all([
    timed('DNS lookup of the pooled host', async () => {
      const found = await dns.lookup(host, { all: true })
      return found.map((a) => `IPv${a.family} ${a.address}`).join(', ')
    }),
    timed('TCP connect to pooled host, port 443', () => tcpConnect(host, 443)),
    timed('TCP connect to pooled host, port 5432', () => tcpConnect(host, 5432)),
    timed('HTTPS request to pooled host', async () => {
      const response = await fetch(`https://${host}/`, { signal: AbortSignal.timeout(LIMIT_MS - 500) })
      return `HTTP ${response.status}`
    }),
    timed('Neon HTTP query, pooled host', async () => {
      const rows = await neon(connectionUrl).query('SELECT 1 AS one')
      return `query ok (${rows.length} row)`
    }),
    timed('Neon HTTP query, direct (non-pooled) host', async () => {
      const rows = await neon(urlFor(directHost)).query('SELECT 1 AS one')
      return `query ok (${rows.length} row)`
    }),
    timed('Neon WebSocket pool query, pooled host', () => pgQuery(NeonPool, connectionUrl)),
    timed('Plain pg (TCP) query, pooled host', () => pgQuery(pg.Pool, connectionUrl)),
    timed('Plain pg (TCP) query, direct (non-pooled) host', () => pgQuery(pg.Pool, urlFor(directHost))),
  ])

  res.json({
    node: process.version,
    vercelRegion: process.env.VERCEL_REGION || '(not set)',
    pooledHost: host,
    results,
  })
}
