import { useState, useEffect } from 'react'
import { api } from '../api'

// Knows who is signed in. On load it asks the server "who am I?" (the browser sends the cookie).
// 401 simply means "nobody", which is normal for a first visit.
export default function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState('') // set when the server could not be reached

  useEffect(() => {
    let cancelled = false
    api
      .me()
      .then((result) => {
        if (!cancelled) setUser(result.user)
      })
      .catch((error) => {
        if (!cancelled && error.status !== 401) setProblem('Cannot reach the server. Please try again.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // These throw an error with a readable message, which the sign-in form shows.
  async function signIn(email, password) {
    const result = await api.login(email, password)
    setUser(result.user)
  }

  async function signUp(email, password) {
    const result = await api.register(email, password)
    setUser(result.user)
  }

  async function resetPassword(token, password) {
    const result = await api.resetPassword(token, password)
    setUser(result.user)
  }

  async function signOut() {
    try {
      await api.logout()
    } finally {
      setUser(null)
    }
  }

  async function removeAccount(password) {
    await api.deleteAccount(password)
    setUser(null)
  }

  // Called when the server answers 401 to a task request (for example the session expired).
  const expire = () => setUser(null)

  return { user, loading, problem, signIn, signUp, resetPassword, signOut, removeAccount, expire }
}
