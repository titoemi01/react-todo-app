// Sending email. Any email provider that offers SMTP works (Gmail, Brevo, Resend, ...): set
//   SMTP_HOST, SMTP_PORT (default 465), SMTP_USER, SMTP_PASS and MAIL_FROM (e.g. "My Tasks <me@gmail.com>").
// With none of those set, nothing is sent: in development the message is printed in the terminal
// so you can click the link yourself; on the live site the request still succeeds (see auth.js).
import nodemailer from 'nodemailer'

let transport // created on first use
let override // tests can replace sending with a fake

export const mailConfigured = () => Boolean(override || (process.env.SMTP_HOST && process.env.MAIL_FROM))
export const setMailOverride = (fn) => {
  override = fn
}

export async function sendMail({ to, subject, text }) {
  if (override) return override({ to, subject, text })

  if (!mailConfigured()) {
    if (!process.env.VERCEL) console.log(`\n[mail not configured] To: ${to}\nSubject: ${subject}\n${text}\n`)
    return false
  }

  const port = Number(process.env.SMTP_PORT) || 465
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    connectionTimeout: 8000,
    socketTimeout: 8000,
  })
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text })
  return true
}

// The address used in links inside emails. Never taken from the request headers: a stranger could
// forge those to make a reset email point at their own website.
export function siteUrl() {
  const fixed = process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (fixed) return /^https?:\/\//.test(fixed) ? fixed.replace(/\/$/, '') : `https://${fixed}`
  return 'http://localhost:5173'
}
