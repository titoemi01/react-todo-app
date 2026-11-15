import usePush from '../hooks/usePush'

// Turn phone / computer alerts on or off for THIS device. When a task's due time arrives, the
// server sends an alert, and it shows up even when the app is closed.
function AlertsPanel() {
  const { state, busy, message, enable, disable, sendTest } = usePush()

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
