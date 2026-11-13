import { useState } from 'react'

// One form for both "log in" and "create an account". The server checks everything again; the
// checks here only give instant, friendly messages.
function AuthForm({ onSignIn, onSignUp }) {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const registering = mode === 'register'

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')

    if (registering && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setBusy(true)
    try {
      await (registering ? onSignUp(email, password) : onSignIn(email, password))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
    // On success this component disappears (the app shows the task list), so no cleanup is needed.
  }

  function switchMode() {
    setMode(registering ? 'login' : 'register')
    setError('')
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h2>{registering ? 'Create your account' : 'Welcome back'}</h2>
      <p className="auth-intro">
        {registering
          ? 'Your tasks are private and available on every device you sign in on.'
          : 'Sign in to see your tasks on this device.'}
      </p>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}

      <label htmlFor="auth-email">Email</label>
      <input
        id="auth-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />

      <label htmlFor="auth-password">Password</label>
      <input
        id="auth-password"
        type="password"
        autoComplete={registering ? 'new-password' : 'current-password'}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {registering && (
        <p className="auth-hint">
          At least 8 characters. There is no &quot;forgot password&quot; yet, so keep it somewhere safe.
        </p>
      )}

      <button type="submit" className="auth-submit" disabled={busy}>
        {busy ? 'Please wait...' : registering ? 'Create account' : 'Log in'}
      </button>

      <button type="button" className="auth-switch" onClick={switchMode}>
        {registering ? 'I already have an account' : 'Create an account'}
      </button>
    </form>
  )
}

export default AuthForm
