import { useState } from 'react'
import { api } from '../api'

// One form for "log in", "create an account", "forgot password" and "choose a new password".
// The server checks everything again; the checks here only give instant, friendly messages.
// resetToken is set when the person arrived from the link in the reset email.
function AuthForm({ onSignIn, onSignUp, onReset, resetToken }) {
  const [mode, setMode] = useState(resetToken ? 'reset' : 'login') // 'login' | 'register' | 'forgot' | 'reset'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const registering = mode === 'register'
  const forgot = mode === 'forgot'
  const resetting = mode === 'reset'
  const needsNewPassword = registering || resetting

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (needsNewPassword && password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    setBusy(true)
    try {
      if (forgot) {
        const result = await api.forgotPassword(email)
        setNotice(result.message)
        setBusy(false)
        return
      }
      await (resetting ? onReset(resetToken, password) : registering ? onSignUp(email, password) : onSignIn(email, password))
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
    // On success this component disappears (the app shows the task list), so no cleanup is needed.
  }

  function goTo(next) {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
  }

  const title = resetting ? 'Choose a new password' : forgot ? 'Reset your password' : registering ? 'Create your account' : 'Welcome back'
  const intro = resetting
    ? 'Pick a new password for your account. You will be signed in right after.'
    : forgot
      ? 'Enter your email and we will send you a link to choose a new password.'
      : registering
        ? 'Your tasks are private and available on every device you sign in on.'
        : 'Sign in to see your tasks on this device.'

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <h2>{title}</h2>
      <p className="auth-intro">{intro}</p>

      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="auth-notice" role="status">
          {notice}
        </p>
      )}

      {!resetting && (
        <>
          <label htmlFor="auth-email">Email</label>
          <input
            id="auth-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </>
      )}

      {!forgot && (
        <>
          <label htmlFor="auth-password">{resetting ? 'New password' : 'Password'}</label>
          <input
            id="auth-password"
            type="password"
            autoComplete={needsNewPassword ? 'new-password' : 'current-password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
          {needsNewPassword && <p className="auth-hint">At least 8 characters.</p>}
        </>
      )}

      <button type="submit" className="auth-submit" disabled={busy}>
        {busy
          ? 'Please wait...'
          : resetting
            ? 'Save new password'
            : forgot
              ? 'Send reset link'
              : registering
                ? 'Create account'
                : 'Log in'}
      </button>

      {mode === 'login' && (
        <button type="button" className="auth-switch" onClick={() => goTo('forgot')}>
          Forgot your password?
        </button>
      )}

      <button type="button" className="auth-switch" onClick={() => goTo(registering || forgot || resetting ? 'login' : 'register')}>
        {registering || forgot || resetting ? 'Back to log in' : 'Create an account'}
      </button>
    </form>
  )
}

export default AuthForm
