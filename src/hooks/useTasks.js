import { useState, useEffect, useCallback } from 'react'
import { api } from '../api'

const POLL_MS = 5000

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
    // Kick off the first load, then poll. Cleanup stops polling when the component unmounts.
    const first = setTimeout(refresh, 0)
    const timer = setInterval(refresh, POLL_MS)
    return () => {
      clearTimeout(first)
      clearInterval(timer)
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
    addTask: (title, priority) =>
      run(async () => {
        const task = await api.addTask(title, priority)
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
