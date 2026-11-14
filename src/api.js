// All talking to the server happens here, so components never write fetch() themselves.
// The site and the API live at the same address (the Vite proxy in development, one Vercel project
// in production), which is what lets the browser send the login cookie automatically.
const BASE = import.meta.env.VITE_API_URL ?? ''

// An error that remembers the HTTP status, so callers can react to "401 = not signed in".
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${BASE}/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin', // send the session cookie
    ...options,
  })

  if (!response.ok) {
    // The server sends { error: '...' } for bad requests. Turn it into a real JS error.
    const body = await response.json().catch(() => ({}))
    throw new ApiError(body.error || `Request failed (${response.status})`, response.status)
  }

  // 204 means "success, nothing to send back"
  return response.status === 204 ? null : response.json()
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) })

export const api = {
  // accounts
  me: () => request('/auth/me'),
  register: (email, password) => post('/auth/register', { email, password }),
  login: (email, password) => post('/auth/login', { email, password }),
  forgotPassword: (email) => post('/auth/forgot', { email }),
  resetPassword: (token, password) => post('/auth/reset', { token, password }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  deleteAccount: (password) =>
    request('/auth/me', { method: 'DELETE', body: JSON.stringify({ password }) }),

  // my private calendar subscription link (asking creates it the first time; reset replaces it)
  calendarLink: () => request('/calendar/link'),
  resetCalendarLink: () => request('/calendar/reset', { method: 'POST' }),

  // tasks (private to the signed-in user)
  getTasks: () => request('/tasks'),
  addTask: (title, priority, dueDate, dueTime) => post('/tasks', { title, priority, dueDate, dueTime }),
  updateTask: (id, changes) =>
    request(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),
  deleteTask: (id) => request(`/tasks/${id}`, { method: 'DELETE' }),
  completeAll: () => request('/tasks/complete-all', { method: 'POST' }),
  clearCompleted: () => request('/tasks?completed=true', { method: 'DELETE' }),
  clearAll: () => request('/tasks', { method: 'DELETE' }),
}
