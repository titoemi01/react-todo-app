// Due dates are stored as plain "YYYY-MM-DD" strings (what <input type="date"> gives us).
// We compare whole calendar days in the user's local time zone, so "today" means
// the user's today and there are no time-zone surprises.

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

export function todayISO() {
  return toISO(new Date())
}

// Whole days from today until the due date. Negative = in the past.
export function daysUntil(iso) {
  return Math.round((parseISO(iso) - parseISO(todayISO())) / MS_PER_DAY)
}

function formatDate(iso) {
  const date = parseISO(iso)
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

// What to show for a task's due date: some text and a "tone" the CSS uses for color.
// Finished tasks are never flagged as overdue.
export function describeDue(iso, completed) {
  const days = daysUntil(iso)

  if (completed) return { text: `Due ${formatDate(iso)}`, tone: 'done' }
  if (days < 0) {
    const late = -days === 1 ? '1 day' : `${-days} days`
    return { text: `Overdue by ${late}`, tone: 'overdue' }
  }
  if (days === 0) return { text: 'Due today', tone: 'today' }
  if (days === 1) return { text: 'Due tomorrow', tone: 'soon' }
  return { text: `Due ${formatDate(iso)}`, tone: 'later' }
}
