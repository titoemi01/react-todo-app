import { useState, useEffect } from 'react'
import usePush from '../hooks/usePush'
import { api } from '../api'

const LEAD_CHOICES = [
  [0, 'No heads-up'],
  [5, '5 minutes before'],
  [15, '15 minutes before'],
  [30, '30 minutes before'],
  [60, '1 hour before'],
]

// Turn phone / computer alerts on or off for THIS device. When a task's due time arrives, the
// server sends an alert, and it shows up even when the app is closed.
function AlertsPanel() {
  const { state, busy, message, enable, disable, sendTest } = usePush()
  const [lead, setLead] = useState(15) // the heads-up setting belongs to the account, not the device
  const [leadError, setLeadError] = useState('')

  useEffect(() => {
    api.getAlertSettings().then((s) => setLead(s.leadMinutes)).catch(() => {})
  }, [])

  async function changeLead(event) {
    const minutes = Number(event.target.value)
    const before = lead
    setLead(minutes)
    setLeadError('')
    try {
      await api.setAlertSettings(minutes)
    } catch (error) {
      setLead(before)
      setLeadError(error.message || 'Could not save that.')
    }
  }

  return (
    <section className="calendar-panel" aria-label="Task alerts">
      <h3>Task alerts on this device</h3>

      {state === 'needs-install' && (
        <>
          <p>
            On an iPhone or iPad, alerts only work after you add this site to your Home Screen:
          </p>
          <ol className="alerts-steps">
            <li>Open this site in Safari.</li>
            <li>Tap the Share button, then <strong>Add to Home Screen</strong>.</li>
            <li>Open My Tasks from the new icon on your Home Screen, log in, and come back to this panel.</li>
          </ol>
        </>
      )}

      {state === 'unsupported' && <p>This browser cannot show alerts. Try Chrome, Edge, Firefox or Safari.</p>}

      {state === 'blocked' && (
        <p>
          Alerts are blocked for this site. Allow notifications for it in your browser or phone settings, then
          reload this page.
        </p>
      )}

      {state === 'off' && (
        <>
          <p>
            Get an alert the moment a task is due. A task with a date but no time alerts you at 9:00 that morning.
          </p>
          <div className="calendar-actions">
            <button type="button" className="calendar-primary" onClick={enable} disabled={busy}>
              {busy ? 'Please wait...' : 'Turn on alerts'}
            </button>
          </div>
        </>
      )}

      {state === 'on' && (
        <>
          <p>Alerts are <strong>on</strong> for this device. Turn them on in each device you want them on.</p>
          <div className="calendar-actions">
            <button type="button" className="calendar-primary" onClick={sendTest} disabled={busy}>
              Send a test alert
            </button>
            <button type="button" className="calendar-reset" onClick={disable} disabled={busy}>
              Turn off
            </button>
          </div>
        </>
      )}

      <p>
        <label>
          Heads-up alert:{' '}
          <select value={lead} onChange={changeLead}>
            {LEAD_CHOICES.map(([minutes, label]) => (
              <option key={minutes} value={minutes}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <br />
        <small>You also get an alert when the task is actually due. Tasks with no time are not warned early.</small>
      </p>
      {leadError && (
        <p className="error-message" role="alert">
          {leadError}
        </p>
      )}

      {message && (
        <p className="calendar-message" role="status">
          {message}
        </p>
      )}

      <p className="calendar-warning">
        A website cannot override your phone&apos;s silent mode or Do Not Disturb. For the loudest alert, keep
        notifications for this site turned on with sound.
      </p>
    </section>
  )
}

export default AlertsPanel
