import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

const POLL_MS = 8000

// Replaces useLocalStorage. Same job (hold the tasks), but the source of truth is the server.
export default function useTasks() {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Ask the server for the latest list. Used on load and every few seconds,
  // which is how you see what your friend added.
  const refresh = useCallback(async () => {
    try {
      setTasks(await api.getTasks())
      setError('')
    } catch {
      setError('Cannot reach the server. Retrying...')
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
      setError(err.message)
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
