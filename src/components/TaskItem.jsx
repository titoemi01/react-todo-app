import { useState } from 'react'
import { Pencil, Trash2, Check, X, CalendarDays } from 'lucide-react'
import { PRIORITIES, DEFAULT_PRIORITY } from '../constants'
import { describeDue } from '../dates'

// Editing state lives HERE, not in App, because only this row cares about it.
function TaskItem({ task, onToggle, onDelete, onSave }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(task.title)
  const [editPriority, setEditPriority] = useState(task.priority || DEFAULT_PRIORITY)
  const [editDueDate, setEditDueDate] = useState(task.dueDate || '')
  const [editDueTime, setEditDueTime] = useState(task.dueTime || '')

  function startEdit() {
    setEditText(task.title)
    setEditPriority(task.priority || DEFAULT_PRIORITY)
    setEditDueDate(task.dueDate || '')
    setEditDueTime(task.dueTime || '')
    setIsEditing(true)
  }

  function save() {
    if (editText.trim() === '') return
    onSave(task.id, {
      title: editText.trim(),
      priority: editPriority,
      dueDate: editDueDate,
      dueTime: editDueDate ? editDueTime : '', // a time only makes sense with a date
    })
    setIsEditing(false)
  }

  function handleEditDateChange(event) {
    setEditDueDate(event.target.value)
    if (!event.target.value) setEditDueTime('')
  }

  const priority = task.priority || DEFAULT_PRIORITY
  // Old tasks saved before this feature have no dueDate, so this stays null for them.
  const due = task.dueDate ? describeDue(task.dueDate, task.completed, task.dueTime) : null

  return (
    <div className="task-item">
      <input type="checkbox" checked={task.completed} onChange={() => onToggle(task)} />

      {isEditing ? (
        <div className="edit-area">
          <input
            type="text"
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
          />

          <select
            value={editPriority}
            onChange={(event) => setEditPriority(event.target.value)}
          >
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
            value={editDueDate}
            onChange={handleEditDateChange}
          />

          <input
            type="time"
            aria-label="Due time (optional, needs a date)"
            title={editDueDate ? 'Due time (optional)' : 'Pick a due date first to add a time'}
            value={editDueTime}
            disabled={!editDueDate}
            onChange={(event) => setEditDueTime(event.target.value)}
          />

          <button type="button" onClick={save} aria-label="Save changes" title="Save changes">
            <Check size={17} />
          </button>

          <button
            type="button"
            onClick={() => setIsEditing(false)}
            aria-label="Cancel editing"
            title="Cancel editing"
          >
            <X size={17} />
          </button>
        </div>
      ) : (
        <>
          <div className="task-main">
            <span className={`task-title${task.completed ? ' completed' : ''}`}>{task.title}</span>

            {due && (
              <span className={`due-chip due-${due.tone}`}>
                <CalendarDays size={13} aria-hidden="true" />
                {due.text}
              </span>
            )}

            {/* Opens a one-event calendar file (needs the login cookie, which the browser sends). */}
            {due && !task.completed && (
              <a className="add-to-calendar" href={`/api/tasks/${task.id}/calendar.ics`} download>
                Add to calendar
              </a>
            )}
          </div>

          <span className={`priority-badge priority-${priority.toLowerCase()}`}>{priority}</span>

          <button
            type="button"
            className="icon-button edit-button"
            onClick={startEdit}
            aria-label="Edit task"
            title="Edit task"
          >
            <Pencil size={17} />
          </button>

          <button
            type="button"
            className="icon-button delete-button"
            onClick={() => onDelete(task.id)}
            aria-label="Delete task"
            title="Delete task"
          >
            <Trash2 size={17} />
          </button>
        </>
      )}
    </div>
  )
}

export default TaskItem
