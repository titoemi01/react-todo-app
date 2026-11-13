import { useState, useEffect, useRef } from 'react'
import { api } from '../api'

// Shows the private calendar link. Subscribe to it ONCE in Google Calendar, Apple Calendar or
// Outlook and every unfinished task that has a due date appears there and stays up to date.
function CalendarPanel() {
  const [link, setLink] = useState(null) // { url, webcalUrl }
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    api
      .calendarLink()
      .then((result) => {
        if (!cancelled) setLink(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url)
      setMessage('Link copied.')
    } catch {
      // Some browsers block clipboard access: select the text so the person can press Ctrl+C.
      inputRef.current?.select()
      setMessage('Press Ctrl+C (or long-press) to copy the selected link.')
    }
  }

  async function reset() {
    const ok = window.confirm(
      'Make a new link? Your old link will stop working, so you will need to subscribe again with the new one.'
    )
    if (!ok) return
    try {
      setLink(await api.resetCalendarLink())
      setMessage('New link created. The old one no longer works.')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="calendar-panel" aria-label="Calendar link">
      <h3>Your calendar link</h3>
      <p>
        Subscribe to this link once in your calendar app. Every unfinished task with a due date will
        show up there, with an alert, and stay up to date.
      </p>

      {error && (
        <p className="calendar-error" role="alert">
          {error}
        </p>
      )}

      {link && (
        <>
          <input
            ref={inputRef}
            className="calendar-link"
            type="text"
            readOnly
            value={link.url}
            aria-label="Private calendar link"
            onFocus={(event) => event.target.select()}
          />

          <div className="calendar-actions">
            <button type="button" className="calendar-primary" onClick={copy}>
              Copy link
            </button>
            <a className="calendar-secondary" href={link.webcalUrl}>
              Open in calendar app
            </a>
            <button type="button" className="calendar-reset" onClick={reset}>
              Make a new link
            </button>
          </div>

          {message && (
            <p className="calendar-message" role="status">
              {message}
            </p>
          )}
        </>
      )}

      <p className="calendar-warning">
        Treat this link like a password: anyone who has it can see your task titles and dates.
      </p>

      <details className="calendar-help">
        <summary>How to add it to my calendar</summary>
        <ul>
          <li>
            <strong>Google Calendar (computer):</strong> on the left, next to &quot;Other calendars&quot; click
            +, choose &quot;From URL&quot;, paste the link, then &quot;Add calendar&quot;. It then appears on your
            phone too. Google can take several hours to show changes, and you set its alerts under that
            calendar&apos;s settings, &quot;Event notifications&quot;.
          </li>
          <li>
            <strong>iPhone / iPad:</strong> Settings, Calendar, Accounts, Add Account, Other, &quot;Add
            Subscribed Calendar&quot;, paste the link.
          </li>
          <li>
            <strong>Mac Calendar:</strong> File, &quot;New Calendar Subscription&quot;, paste the link.
          </li>
          <li>
            <strong>Outlook:</strong> Add calendar, &quot;Subscribe from web&quot;, paste the link.
          </li>
        </ul>
        <p>
          Tasks with a time ring 15 minutes before and at the time. Tasks with only a date ring at 9:00
          that morning. Finished tasks disappear from the calendar. The sound is your phone&apos;s own
          alert sound, and silent mode or Do Not Disturb still apply.
        </p>
      </details>
    </section>
  )
}

export default CalendarPanel
