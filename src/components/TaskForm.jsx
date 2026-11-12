import { useState } from 'react'
import { PRIORITIES, DEFAULT_PRIORITY } from '../constants'

// This component owns the text of the form. The parent only hears about finished tasks via onAdd.
function TaskForm({ onAdd }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(DEFAULT_PRIORITY)
  const [dueDate, setDueDate] = useState('') // '' means "no due date"

  function handleSubmit(event) {
    event.preventDefault()
    if (title.trim() === '') return

    onAdd(title.trim(), priority, dueDate)
    setTitle('')
    setPriority(DEFAULT_PRIORITY)
    setDueDate('')
  }

  return (
    <form className="task-form" onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Enter a new task..."
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />

      <select value={priority} onChange={(event) => setPriority(event.target.value)}>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p} Priority
          </option>
        ))}
      </select>

      <input
        type="date"
        aria-label="Due date (optional)"
        title="Due date (optional)"
        value={dueDate}
        onChange={(event) => setDueDate(event.target.value)}
      />

      <button type="submit">+ Add Task</button>
    </form>
  )
}

export default TaskForm
