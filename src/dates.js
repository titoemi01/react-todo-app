// Due dates are stored as plain "YYYY-MM-DD" strings (what <input type="date"> gives us) and the
// optional due time as "HH:MM" in 24-hour form (what <input type="time"> gives us).
// We compare whole calendar days in the user's local time zone, so "today" means the user's today
// and there are no time-zone surprises. Every function takes an optional `now`, so it can be tested
// with a made-up clock.

const MS_PER_DAY = 24 * 60 * 60 * 1000

function toISO(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

// "2026-11-12" -> a Date at local midnight. (new Date("2026-11-12") would use UTC and can be off by a day.)
function parseISO(iso) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function todayISO(now = new Date()) {
  return toISO(now)
}

// Whole days from today until the due date. Negative = in the past.
export function daysUntil(iso, now = new Date()) {
  return Math.round((parseISO(iso) - parseISO(todayISO(now))) / MS_PER_DAY)
}

function formatDate(iso, now) {
  const date = parseISO(iso)
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

// "14:05" -> "2:05 PM" (or "14:05" on computers that use a 24-hour clock)
export function formatTime(hhmm) {
  const [hour, minute] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

const minutesOf = (hhmm) => {
  const [hour, minute] = hhmm.split(':').map(Number)
  return hour * 60 + minute
}

// What to show for a task's due date and time: some text and a "tone" the CSS uses for color.
// Finished tasks are never flagged as overdue.
export function describeDue(iso, completed, time = null, now = new Date()) {
  const days = daysUntil(iso, now)
  const at = time ? ` at ${formatTime(time)}` : ''

  if (completed) return { text: `Due ${formatDate(iso, now)}${time ? `, ${formatTime(time)}` : ''}`, tone: 'done' }
  if (days < 0) {
    const late = -days === 1 ? '1 day' : `${-days} days`
    return { text: `Overdue by ${late}`, tone: 'overdue' }
  }
  if (days === 0) {
    // Due today: with a time, it turns overdue the minute the time passes.
    if (time && now.getHours() * 60 + now.getMinutes() >= minutesOf(time)) {
      return { text: `Overdue since ${formatTime(time)}`, tone: 'overdue' }
    }
    return { text: `Due today${at}`, tone: 'today' }
  }
  if (days === 1) return { text: `Due tomorrow${at}`, tone: 'soon' }
  return { text: `Due ${formatDate(iso, now)}${time ? `, ${formatTime(time)}` : ''}`, tone: 'later' }
}
