// All talking to the server happens here, so components never write fetch() themselves.
// In development BASE is '' (the Vite proxy handles /api).
// In production you set VITE_API_URL to the deployed API address.
const BASE = import.meta.env.VITE_API_URL ?? ''

async function request(path, options = {}) {
  const response = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!response.ok) {
    // The server sends { error: '...' } for bad requests. Turn it into a real JS error.
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${response.status})`)
  }

  // 204 means "success, nothing to send back"
  return response.status === 204 ? null : response.json()
}

export const api = {
  getTasks: () => request('/tasks'),
  addTask: (title, priority, dueDate) =>
    request('/tasks', { method: 'POST', body: JSON.stringify({ title, priority, dueDate }) }),
  updateTask: (id, changes) =>
    request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  completeAll: () => request('/tasks/complete-all', { method: 'POST' }),
  clearCompleted: () => request('/tasks?completed=true', { method: 'DELETE' }),
  clearAll: () => request('/tasks', { method: 'DELETE' }),
}
