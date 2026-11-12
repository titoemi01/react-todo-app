import { useState } from 'react'
import { PRIORITIES, DEFAULT_PRIORITY } from '../constants'

// This component owns the text of the form. The parent only hears about finished tasks via onAdd.
function TaskForm({ onAdd }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState(DEFAULT_PRIORITY)

  function handleSubmit(event) {
    event.preventDefault()
    if (title.trim() === '') return

    onAdd(title.trim(), priority)
    setTitle('')
    setPriority(DEFAULT_PRIORITY)
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

      <button type="submit">+ Add Task</button>
    </form>
  )
}

export default TaskForm
