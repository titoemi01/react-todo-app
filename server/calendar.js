// Calendar support: turns tasks that have a due date into a standard ".ics" calendar file.
//
// Two ways to use it:
//   1. A private subscription link. You add it ONCE to Google Calendar, Apple Calendar or Outlook,
//      and every unfinished task with a due date shows up there and stays up to date. Calendar apps
//      cannot send a login cookie, so the link itself contains a long random secret (about 256
//      bits, impossible to guess). Anyone who has the link can read your task titles and dates,
//      so it can be reset at any time, which makes the old link stop working.
//   2. "Add to calendar" for a single task: a one-event file you open to import it right away.
//
// Times are "floating": 9:00 means 9:00 on whatever clock your calendar app is set to, with no time
// zone attached. For personal reminders that is what people expect, and it avoids time zone bugs.
import crypto from 'node:crypto'
import { Router } from 'express'
import { pool, TASK_COLUMNS } from './db.js'
import { requireAuth } from './auth.js'

const CRLF = '\r\n' // the calendar format requires Windows-style line endings

// ---------- building the file ----------

// Commas, semicolons, backslashes and line breaks have special meaning in calendar text.
const escapeText = (value) =>
  String(value)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n')

// Lines must be at most 75 BYTES long; longer ones continue on the next line starting with a space.
// Counting bytes (not letters) matters for Arabic and emoji, which take 2-4 bytes each.
const encoder = new TextEncoder()
function fold(line) {
  if (encoder.encode(line).length <= 75) return line
  const lines = []
  let current = ''
  let bytes = 0
  for (const character of line) {
    const size = encoder.encode(character).length
    if (bytes + size > 75) {
      lines.push(current)
      current = ' ' // the continuation marker counts toward the 75
      bytes = 1
    }
    current += character
    bytes += size
  }
  lines.push(current)
  return lines.join(CRLF)
}

const compactDate = (iso) => iso.replaceAll('-', '') // 2026-12-01 -> 20261201

function addDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number)
  const moved = new Date(Date.UTC(year, month - 1, day + days))
  return moved.toISOString().slice(0, 10)
}

// Start and end of a timed task as floating local times. Reminders get a 30 minute slot.
function timedRange(isoDate, time) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const format = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '')
  const start = new Date(Date.UTC(year, month - 1, day, hour, minute))
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  return { start: format(start), end: format(end) }
}

const utcStamp = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

function eventLines(task, stamp) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:task-${task.id}@react-todo-app`, // the same task keeps the same id, so updates replace it
    `DTSTAMP:${stamp}`,
  ]

  if (task.dueTime) {
    const { start, end } = timedRange(task.dueDate, task.dueTime)
    lines.push(`DTSTART:${start}`, `DTEND:${end}`)
  } else {
    // An all-day event ends on the NEXT day (the end date is exclusive).
    lines.push(`DTSTART;VALUE=DATE:${compactDate(task.dueDate)}`, `DTEND;VALUE=DATE:${compactDate(addDays(task.dueDate, 1))}`)
  }

  lines.push(
    `SUMMARY:${escapeText(task.title)}`,
    `DESCRIPTION:${escapeText(`Priority: ${task.priority}`)}`,
    'STATUS:CONFIRMED',
    'TRANSP:TRANSPARENT' // a reminder, not a meeting: it should not mark you as busy
  )

  // Alerts. Calendar apps play their own alert sound. Timed tasks ring 15 minutes before and at the
  // time; all-day tasks ring at 9:00 that morning.
  const alarms = task.dueTime ? ['-PT15M', 'PT0S'] : ['PT9H']
  for (const trigger of alarms) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(task.title)}`, `TRIGGER:${trigger}`, 'END:VALARM')
  }

  lines.push('END:VEVENT')
  return lines
}

export function buildCalendar(tasks, now = new Date()) {
  const stamp = utcStamp(now)
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//react-todo-app//Tasks//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:My Tasks',
    'X-PUBLISHED-TTL:PT15M', // asks the calendar app to refresh every 15 minutes (it may refresh less often)
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
  ]
  for (const task of tasks) lines.push(...eventLines(task, stamp))
  lines.push('END:VCALENDAR')
  return lines.map(fold).join(CRLF) + CRLF
}

// ---------- the private link ----------

const newToken = () => crypto.randomBytes(32).toString('base64url') // 43 characters, 256 bits
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/

async function tokenFor(userId, { reset = false } = {}) {
  // COALESCE keeps an existing token; a reset replaces it, so the old link stops working.
  const { rows } = await pool.query(
    reset
      ? 'UPDATE users SET calendar_token = $2 WHERE id = $1 RETURNING calendar_token'
      : 'UPDATE users SET calendar_token = COALESCE(calendar_token, $2) WHERE id = $1 RETURNING calendar_token',
    [userId, newToken()]
  )
  return rows[0].calendar_token
}

// The public address of this site, as the browser sees it (behind Vercel's proxy as well).
function siteBase(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0].trim()
  const host = String(req.headers['x-forwarded-host'] || req.headers.host).split(',')[0].trim()
  return `${proto}://${host}`
}

function linkFor(req, token) {
  const url = `${siteBase(req)}/api/calendar/${token}.ics`
  return { url, webcalUrl: url.replace(/^https?:/, 'webcal:') }
}

async function dueTasks(userId) {
  const { rows } = await pool.query(
    `SELECT ${TASK_COLUMNS} FROM tasks
      WHERE user_id = $1 AND completed = false AND due_date IS NOT NULL
      ORDER BY due_date, due_time NULLS FIRST, id`,
    [userId]
  )
  return rows
}

export const calendarRouter = Router()

// Show my subscription link (creating it the first time).
calendarRouter.get('/link', requireAuth, async (req, res) => {
  res.json(linkFor(req, await tokenFor(req.user.id)))
})

// Make a new link. The old one stops working immediately.
calendarRouter.post('/reset', requireAuth, async (req, res) => {
  res.json(linkFor(req, await tokenFor(req.user.id, { reset: true })))
})

// The feed itself. No login: the secret in the address is the proof.
calendarRouter.get('/:token.ics', async (req, res) => {
  const token = req.params.token
  if (!TOKEN_FORMAT.test(token)) return res.status(404).type('text/plain').send('Not found')

  const { rows } = await pool.query('SELECT id FROM users WHERE calendar_token = $1', [token])
  if (rows.length === 0) return res.status(404).type('text/plain').send('Not found')

  res.set('Content-Type', 'text/calendar; charset=utf-8')
  res.set('Content-Disposition', 'inline; filename="my-tasks.ics"')
  res.send(buildCalendar(await dueTasks(rows[0].id)))
})

// A one-event file for "Add to calendar" on a single task (needs the normal login).
export async function singleTaskCalendar(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' })

  const { rows } = await pool.query(`SELECT ${TASK_COLUMNS} FROM tasks WHERE id = $1 AND user_id = $2`, [id, req.user.id])
  if (rows.length === 0) return res.status(404).json({ error: 'task not found' })
  if (!rows[0].dueDate) return res.status(400).json({ error: 'This task has no due date to add to a calendar.' })

  res.set('Content-Type', 'text/calendar; charset=utf-8')
  res.set('Content-Disposition', `attachment; filename="task-${id}.ics"`)
  res.send(buildCalendar([rows[0]]))
}
