import { useState } from 'react'
import { PRIORITIES, DEFAULT_PRIORITY } from '../constants'

// This component owns the text of the form. The parent only hears about finished tasks via onAdd.
function TaskForm({ onAdd }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(DEFAULT_PRIORITY)
  const [dueDate, setDueDate] = useState('') // '' means "no due date"
  const [dueTime, setDueTime] = useState('') // '' means "no time of day"

  function handleSubmit(event) {
    event.preventDefault()
    if (title.trim() === '') return

    // A time only makes sense together with a date.
    onAdd(title.trim(), priority, dueDate, dueDate ? dueTime : '')
    setTitle('')
    setPriority(DEFAULT_PRIORITY)
    setDueDate('')
    setDueTime('')
  }

  function handleDateChange(event) {
    setDueDate(event.target.value)
    if (!event.target.value) setDueTime('') // no date, no time
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
        onChange={handleDateChange}
      />

      <input
        type="time"
        aria-label="Due time (optional, needs a date)"
        title={dueDate ? 'Due time (optional)' : 'Pick a due date first to add a time'}
        value={dueTime}
        disabled={!dueDate}
        onChange={(event) => setDueTime(event.target.value)}
      />

      <button type="submit">+ Add Task</button>
    </form>
  )
}

export default TaskForm
