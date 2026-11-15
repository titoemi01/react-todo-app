// Phone / computer alerts ("web push") for tasks that are due.
//
// How it works, in plain words:
//   - A browser that wants alerts gives us a private "mailbox address" (a subscription). We store it.
//   - Something outside (a scheduler such as cron-job.org) calls /api/cron/remind every minute.
//     That finds tasks whose due moment has arrived and drops a message in the mailbox, and the
//     phone shows it even when the app is closed. Each due moment is announced only once.
//   - Due times are "wall clock" times (9:30 means 9:30 where you are), so we also keep each
//     person's time zone, sent by their browser when they turn alerts on.
// Needs these settings on the server: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET.
import crypto from 'node:crypto'
import { Router } from 'express'
import * as webpush from 'web-push'
import { pool } from './db.js'
import { requireAuth, countInWindow, recordHit } from './auth.js'

let override // tests replace the real sending with a fake
export const setPushOverride = (fn) => {
  override = fn
}

export const pushConfigured = () =>
  Boolean(override || (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT))

let vapidSet = false
async function deliver(subscription, payload) {
  if (override) return override(subscription, payload)
  if (!vapidSet) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
    vapidSet = true
  }
  await webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 3600, urgency: 'high' })
}

const toSubscription = (row) => ({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } })

// Send to every device of one person. Returns how many accepted it. Dead subscriptions
// (the person removed the app or revoked permission) are forgotten.
async function notifyUser(userId, payload) {
  const { rows } = await pool.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [userId])
  let delivered = 0
  for (const row of rows) {
    try {
      await deliver(toSubscription(row), payload)
      delivered++
    } catch (error) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [row.id])
      } else {
        console.error('push failed:', error.statusCode ?? error.message)
      }
    }
  }
  return { delivered, attempted: rows.length }
}

// The reminder job. `now` is only for tests.
export async function sendDueReminders() {
  // A task is due at its date + time, in its owner's time zone. A task with a date but no time
  // rings at 9:00 that morning (like the calendar's alert). Anything missed by more than 6 hours
  // is skipped, so a long outage never wakes you up with old news.
  const { rows: due } = await pool.query(`
    SELECT id, user_id, title, key FROM (
      SELECT t.id, t.user_id, t.title, t.reminded_for,
             to_char(t.due_date, 'YYYY-MM-DD') || ' ' || COALESCE(to_char(t.due_time, 'HH24:MI'), 'all-day') AS key,
             (t.due_date + COALESCE(t.due_time, TIME '09:00')) AT TIME ZONE COALESCE(u.tz, 'UTC') AS due_at
        FROM tasks t JOIN users u ON u.id = t.user_id
       WHERE NOT t.completed AND t.due_date IS NOT NULL
         AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = t.user_id)
    ) x
    WHERE due_at <= now() AND due_at > now() - interval '6 hours' AND reminded_for IS DISTINCT FROM key
    ORDER BY due_at
    LIMIT 200
  `)

  let sent = 0
  for (const task of due) {
    // Claim it first: if two job runs overlap, only one gets the row back and sends.
    const claim = await pool.query(
      'UPDATE tasks SET reminded_for = $1 WHERE id = $2 AND reminded_for IS DISTINCT FROM $1 RETURNING id',
      [task.key, task.id]
    )
    if (claim.rows.length === 0) continue

    const timeText = task.key.endsWith('all-day') ? 'today' : `at ${task.key.slice(-5)}`
    const { delivered, attempted } = await notifyUser(task.user_id, {
      title: 'Task due now',
      body: `${task.title.slice(0, 120)} (due ${timeText})`,
      tag: `task-${task.id}`,
      url: '/',
    })
    if (delivered > 0) sent++
    else if (attempted > 0) await pool.query('UPDATE tasks SET reminded_for = NULL WHERE id = $1', [task.id]) // try again next minute
  }
  return { due: due.length, sent }
}

// ---------- routes ----------

export const pushRouter = Router()

pushRouter.get('/key', (req, res) => {
  if (!pushConfigured()) return res.status(503).json({ error: 'Phone alerts are not set up on the server yet.' })
  res.json({ key: process.env.VAPID_PUBLIC_KEY ?? 'test-key' })
})

function validTimeZone(value) {
  if (typeof value !== 'string' || value.length > 64) return null
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return value
  } catch {
    return null
  }
}

pushRouter.post('/subscribe', requireAuth, async (req, res) => {
  const sub = req.body?.subscription
  const tz = validTimeZone(req.body?.timeZone)
  const endpoint = sub?.endpoint
  const p256dh = sub?.keys?.p256dh
  const auth = sub?.keys?.auth
  const text = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max
  if (!tz) return res.status(400).json({ error: 'Unknown time zone.' })
  if (!text(endpoint, 600) || !/^https:\/\//.test(endpoint) || !text(p256dh, 200) || !text(auth, 100)) {
    return res.status(400).json({ error: 'That alert subscription is not valid.' })
  }

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM push_subscriptions WHERE user_id = $1', [req.user.id])
  const { rows: mine } = await pool.query('SELECT 1 FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.id])
  if (rows[0].n >= 10 && mine.length === 0) return res.status(400).json({ error: 'Too many devices. Turn alerts off on one first.' })

  // The same browser address always belongs to whoever subscribed it last (e.g. after a log-out/in).
  await pool.query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, p256dh = $3, auth = $4`,
    [req.user.id, endpoint, p256dh, auth]
  )
  await pool.query('UPDATE users SET tz = $1 WHERE id = $2', [tz, req.user.id])
  res.status(201).json({ ok: true })
})

pushRouter.post('/unsubscribe', requireAuth, async (req, res) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : ''
  await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [endpoint, req.user.id])
  res.status(204).end()
})

pushRouter.post('/test', requireAuth, async (req, res) => {
  if (!pushConfigured()) return res.status(503).json({ error: 'Phone alerts are not set up on the server yet.' })
  const key = `push-test:${req.user.id}`
  if ((await countInWindow(key, 60 * 60)) >= 10) return res.status(429).json({ error: 'Too many tests. Try again later.' })
  await recordHit(key, 60 * 60)

  const { delivered, attempted } = await notifyUser(req.user.id, {
    title: 'Test alert',
    body: 'It works! Your task alerts will look like this.',
    tag: 'test',
    url: '/',
  })
  if (attempted === 0) return res.status(400).json({ error: 'No device has alerts turned on yet.' })
  if (delivered === 0) return res.status(502).json({ error: 'The alert could not be delivered. Turn alerts off and on again.' })
  res.json({ delivered })
})

// The scheduler calls this every minute. The secret keeps strangers from poking it.
export async function cronRemind(req, res) {
  // Trim both sides: a stray space or line break from copy-and-paste must not lock the job out.
  const secret = (process.env.CRON_SECRET ?? '').trim()
  if (!secret || secret.length < 16) return res.status(503).json({ error: 'Reminder job is not set up.' })
  const given = String(req.headers.authorization ?? '').replace(/^\s*Bearer\s+/i, '').trim()
  const sha = (s) => crypto.createHash('sha256').update(s).digest()
  if (!crypto.timingSafeEqual(sha(given), sha(secret))) {
    // Temporary hint for setup: lengths only, never the secret itself.
    return res.status(401).json({
      error: 'Not allowed.',
      hint: { headerSeen: Boolean(req.headers.authorization), sentLength: given.length, expectedLength: secret.length },
    })
  }
  if (!pushConfigured()) return res.status(503).json({ error: 'Phone alerts are not set up on the server yet.' })
  res.json(await sendDueReminders())
}
