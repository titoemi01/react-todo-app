import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api'

const POLL_MS = 8000

// Holds the signed-in person's tasks. The source of truth is the server, so the same list shows up
// on every device they sign in on. onUnauthorized is called if the server says the session is over.
export default function useTasks(onUnauthorized) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Keep the latest callback in a ref, so changing it never restarts the polling below.
  const onUnauthorizedRef = useRef(onUnauthorized)
  useEffect(() => {
    onUnauthorizedRef.current = onUnauthorized
  })

  // Ask the server for the latest list. Used on load and every few seconds,
  // which is how a change made on your phone shows up on your laptop.
  const refresh = useCallback(async () => {
    try {
      setTasks(await api.getTasks())
      setError('')
    } catch (err) {
      if (err.status === 401) onUnauthorizedRef.current?.()
      else setError('Cannot reach the server. Retrying...')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Load once, then poll, but ONLY while this tab is on screen. A hidden tab makes no requests
    // (saves the free hosting limits and lets the database sleep), and the moment you come back
    // to the tab it refreshes right away so you never see stale tasks.
    let timer = null
    const startPolling = () => {
      if (timer === null) timer = setInterval(refresh, POLL_MS)
    }
    const stopPolling = () => {
      clearInterval(timer)
      timer = null
    }
    const onVisibilityChange = () => {
      if (document.hidden) {
        stopPolling()
      } else {
        refresh()
        startPolling()
      }
    }

    const first = setTimeout(refresh, 0)
    if (!document.hidden) startPolling()
    document.addEventListener('visibilitychange', onVisibilityChange)

    // Cleanup runs when the component unmounts.
    return () => {
      clearTimeout(first)
      stopPolling()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [refresh])

  // Run an API call, then update state with what the server says. Show errors instead of crashing.
  async function run(action) {
    try {
      await action()
      setError('')
    } catch (err) {
      if (err.status === 401) onUnauthorizedRef.current?.()
      else setError(err.message)
    }
  }

  return {
    tasks,
    loading,
    error,
    addTask: (title, priority, dueDate) =>
      run(async () => {
        const task = await api.addTask(title, priority, dueDate)
        setTasks((prev) => [...prev, task])
      }),
    toggleTask: (task) =>
      run(async () => {
        const updated = await api.updateTask(task.id, { completed: !task.completed })
        setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)))
      }),
    updateTask: (id, changes) =>
      run(async () => {
        const updated = await api.updateTask(id, changes)
        setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)))
      }),
    deleteTask: (id) =>
      run(async () => {
        await api.deleteTask(id)
        setTasks((prev) => prev.filter((t) => t.id !== id))
      }),
    markAllComplete: () => run(async () => setTasks(await api.completeAll())),
    clearCompleted: () => run(async () => setTasks(await api.clearCompleted())),
    clearAll: () => run(async () => setTasks(await api.clearAll())),
  }
}
