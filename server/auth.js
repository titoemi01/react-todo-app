// Accounts: sign up, log in, log out, "who am I", and delete my account.
//
// How it works, in plain words:
//   - A password is never stored. We store a salted one-way hash made with scrypt (built into
//     Node), so even someone who stole the database could not read the passwords.
//   - Logging in creates a random token. The browser keeps it in a cookie; the database keeps only
//     a hash of it. The cookie is HttpOnly (page scripts cannot read it), Secure on https, and
//     SameSite=Lax (other websites cannot make the browser send it with a form post).
//   - Repeated wrong passwords and mass sign-ups are slowed down with counters in the database.
import crypto from 'node:crypto'
import { promisify } from 'node:util'
import { Router } from 'express'
import { pool } from './db.js'
import { sendMail, siteUrl, mailConfigured } from './mail.js'

const scrypt = promisify(crypto.scrypt)

export const COOKIE_NAME = 'session'
const SESSION_DAYS = 30
const MAX_USERS = Number(process.env.MAX_USERS) || 500 // the sign-up is public, so cap it

// ---------- passwords ----------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16) // a different random salt for every user
  const key = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`
}

async function verifyPassword(password, stored) {
  const [scheme, saltText, keyText] = String(stored).split('$')
  if (scheme !== 'scrypt' || !saltText || !keyText) return false
  const expected = Buffer.from(keyText, 'base64')
  const actual = await scrypt(password, Buffer.from(saltText, 'base64'), expected.length)
  return crypto.timingSafeEqual(actual, expected) // constant-time compare
}

// When an email is unknown we still do the same amount of work, so the response time does not
// reveal which emails have accounts.
let dummyHash
async function wasteTimeLikeAHash(password) {
  dummyHash ??= await hashPassword('not-a-real-password')
  await verifyPassword(password, dummyHash)
}

// ---------- rate limits (counters in the database, so they work across serverless instances) ----------

async function countInWindow(key, windowSeconds) {
  const { rows } = await pool.query(
    `SELECT count FROM rate_limits
      WHERE key = $1 AND window_start > now() - make_interval(secs => $2::double precision)`,
    [key, windowSeconds]
  )
  return rows[0]?.count ?? 0
}

// Add one to a counter, starting a fresh window if the old one has expired.
async function recordHit(key, windowSeconds) {
  await pool.query(
    `INSERT INTO rate_limits (key, count, window_start) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                    THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                           THEN now() ELSE rate_limits.window_start END`,
    [key, windowSeconds]
  )
}

const clearKey = (key) => pool.query('DELETE FROM rate_limits WHERE key = $1', [key])

const LOGIN_WINDOW = 15 * 60 // seconds
const TOO_MANY = 'Too many attempts. Please wait 15 minutes and try again.'

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  return (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) || req.socket.remoteAddress || 'unknown'
}

// ---------- cookies and sessions ----------

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

function readCookie(req, name) {
  const header = req.headers.cookie
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index > -1 && part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim())
  }
  return null
}

const isHttps = (req) => Boolean(process.env.VERCEL) || req.secure || req.headers['x-forwarded-proto'] === 'https'

const cookieOptions = (req) => ({
  httpOnly: true, // page scripts cannot read it
  sameSite: 'lax', // not sent with cross-site form posts
  secure: isHttps(req),
  path: '/',
})

async function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url')
  await pool.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + make_interval(days => $3::int))`,
    [userId, hashToken(token), SESSION_DAYS]
  )
  res.cookie(COOKIE_NAME, token, { ...cookieOptions(req), maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000 })
  // Tidy up while we are here: forget expired sessions and old counters.
  await pool.query('DELETE FROM sessions WHERE expires_at < now()')
  await pool.query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'")
}

// ---------- middleware ----------

// Every route below this requires a signed-in user and sets req.user = { id, email }.
export async function requireAuth(req, res, next) {
  const token = readCookie(req, COOKIE_NAME)
  if (token) {
    const { rows } = await pool.query(
      `SELECT u.id, u.email
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1 AND s.expires_at > now()`,
      [hashToken(token)]
    )
    if (rows[0]) {
      req.user = rows[0]
      return next()
    }
  }
  res.status(401).json({ error: 'Please sign in.' })
}

// A second shield on top of SameSite: refuse changes that come from a page on another website.
export function sameOriginOnly(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.headers.origin
  if (origin) {
    let host = null
    try {
      host = new URL(origin).host
    } catch {
      // an unreadable Origin counts as foreign
    }
    // The page's address must be the address this request was sent to. A proxy (such as Vercel's
    // or the dev server's) may report that address in "x-forwarded-host" instead of "host".
    // A page on another website cannot set either header, so accepting both is safe.
    const forwarded = String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim()
    if (host === null || (host !== req.headers.host && host !== forwarded)) {
      return res.status(403).json({ error: 'Cross-site request blocked.' })
    }
  }
  next()
}

// ---------- input checks ----------

function readEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const ok = email.length > 0 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  return ok ? email : null
}

// ---------- routes ----------

export const authRouter = Router()

authRouter.post('/register', async (req, res) => {
  const ip = clientIp(req)
  if ((await countInWindow(`register:ip:${ip}`, 60 * 60)) >= 10) return res.status(429).json({ error: TOO_MANY })
  await recordHit(`register:ip:${ip}`, 60 * 60)

  const email = readEmail(req.body?.email)
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!email) return res.status(400).json({ error: 'Enter a valid email address.' })
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  if (password.length > 128) return res.status(400).json({ error: 'Password is too long (max 128 characters).' })

  const { rows: counted } = await pool.query('SELECT count(*)::int AS n FROM users')
  if (counted[0].n >= MAX_USERS) return res.status(403).json({ error: 'Sign-ups are closed for now.' })

  let user
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, await hashPassword(password)]
    )
    user = rows[0]
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' })
    throw error
  }

  // The very first account adopts any tasks made before accounts existed.
  if (counted[0].n === 0) await pool.query('UPDATE tasks SET user_id = $1 WHERE user_id IS NULL', [user.id])

  await startSession(req, res, user.id)
  res.status(201).json({ user })
})

authRouter.post('/login', async (req, res) => {
  const ip = clientIp(req)
  const email = readEmail(req.body?.email)
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const emailKey = `login:email:${email}`

  if ((await countInWindow(`login:ip:${ip}`, LOGIN_WINDOW)) >= 30) return res.status(429).json({ error: TOO_MANY })
  if (email && (await countInWindow(emailKey, LOGIN_WINDOW)) >= 5) return res.status(429).json({ error: TOO_MANY })
  await recordHit(`login:ip:${ip}`, LOGIN_WINDOW)

  const { rows } = email
    ? await pool.query('SELECT id, email, password_hash FROM users WHERE email = $1', [email])
    : { rows: [] }
  const found = rows[0]

  let valid = false
  if (found && password.length > 0 && password.length <= 128) valid = await verifyPassword(password, found.password_hash)
  else await wasteTimeLikeAHash(password.slice(0, 128))

  if (!valid) {
    if (email) await recordHit(emailKey, LOGIN_WINDOW) // only FAILED tries count toward the lockout
    // The same message whether the email or the password was wrong: no hints for guessers.
    return res.status(401).json({ error: 'Incorrect email or password.' })
  }

  await clearKey(emailKey)
  await startSession(req, res, found.id)
  res.json({ user: { id: found.id, email: found.email } })
})

// "Forgot password": always answers the same, whether or not the email has an account.
const RESET_MINUTES = 60
const forgotAnswer = { ok: true, message: 'If that email has an account, a reset link is on its way. It works for 1 hour.' }

authRouter.post('/forgot', async (req, res) => {
  const ip = clientIp(req)
  const email = readEmail(req.body?.email)
  if (!email) return res.status(400).json({ error: 'Enter a valid email address.' })

  // About the site's setup, not about any account, so saying so leaks nothing.
  if (!mailConfigured() && process.env.VERCEL) {
    return res.status(503).json({ error: 'Password reset by email is not set up yet.' })
  }

  const WINDOW = 60 * 60
  if ((await countInWindow(`forgot:ip:${ip}`, WINDOW)) >= 10) return res.status(429).json({ error: TOO_MANY })
  if ((await countInWindow(`forgot:email:${email}`, WINDOW)) >= 3) return res.json(forgotAnswer) // quietly stop
  await recordHit(`forgot:ip:${ip}`, WINDOW)
  await recordHit(`forgot:email:${email}`, WINDOW)

  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('base64url')
    await pool.query('DELETE FROM password_resets WHERE user_id = $1 OR expires_at < now()', [rows[0].id])
    await pool.query(
      `INSERT INTO password_resets (token_hash, user_id, expires_at)
       VALUES ($1, $2, now() + make_interval(mins => $3::int))`,
      [hashToken(token), rows[0].id, RESET_MINUTES]
    )
    try {
      await sendMail({
        to: email,
        subject: 'Reset your password',
        text:
          `Someone asked to reset the password for your To-Do account.\n\n` +
          `Open this link within ${RESET_MINUTES} minutes to choose a new password:\n` +
          `${siteUrl()}/#reset=${token}\n\n` +
          `If this was not you, ignore this email. Your password stays the same.`,
      })
    } catch (error) {
      console.error('reset email failed:', error.message) // the person still sees the same answer
    }
  }
  res.json(forgotAnswer)
})

authRouter.post('/reset', async (req, res) => {
  const ip = clientIp(req)
  if ((await countInWindow(`reset:ip:${ip}`, 60 * 60)) >= 20) return res.status(429).json({ error: TOO_MANY })
  await recordHit(`reset:ip:${ip}`, 60 * 60)

  const token = typeof req.body?.token === 'string' ? req.body.token : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' })
  if (password.length > 128) return res.status(400).json({ error: 'Password is too long (max 128 characters).' })

  // Delete-and-return makes the link single-use even if two requests arrive together.
  const { rows } = await pool.query(
    'DELETE FROM password_resets WHERE token_hash = $1 AND expires_at > now() RETURNING user_id',
    [hashToken(token)]
  )
  if (!rows[0]) return res.status(400).json({ error: 'This reset link is invalid or has expired. Ask for a new one.' })

  const userId = rows[0].user_id
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(password), userId])
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]) // sign out everywhere else
  const { rows: users } = await pool.query('SELECT id, email FROM users WHERE id = $1', [userId])
  await clearKey(`login:email:${users[0].email}`)
  await startSession(req, res, userId)
  res.json({ user: users[0] })
})

authRouter.post('/logout', async (req, res) => {
  const token = readCookie(req, COOKIE_NAME)
  if (token) await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)])
  res.clearCookie(COOKIE_NAME, cookieOptions(req))
  res.status(204).end()
})

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

// Delete my account and everything in it. Requires the password again.
authRouter.delete('/me', requireAuth, async (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  const key = `login:email:${req.user.email}`
  if ((await countInWindow(key, LOGIN_WINDOW)) >= 5) return res.status(429).json({ error: TOO_MANY })

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id])
  const valid = password.length > 0 && password.length <= 128 && (await verifyPassword(password, rows[0].password_hash))
  if (!valid) {
    await recordHit(key, LOGIN_WINDOW)
    return res.status(401).json({ error: 'Incorrect password.' })
  }

  await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]) // tasks and sessions go with it
  res.clearCookie(COOKIE_NAME, cookieOptions(req))
  res.status(204).end()
})
