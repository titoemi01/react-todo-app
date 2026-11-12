import { useState } from 'react'
import { Pencil, Trash2, Check, X } from 'lucide-react'
import { PRIORITIES, DEFAULT_PRIORITY } from '../constants'

// Editing state lives HERE, not in App, because only this row cares about it.
function TaskItem({ task, onToggle, onDelete, onSave }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(task.title)
  const [editPriority, setEditPriority] = useState(task.priority || DEFAULT_PRIORITY)

  function startEdit() {
    setEditText(task.title)
    setEditPriority(task.priority || DEFAULT_PRIORITY)
    setIsEditing(true)
  }

  function save() {
    if (editText.trim() === '') return
    onSave(task.id, { title: editText.trim(), priority: editPriority })
    setIsEditing(false)
  }

  const priority = task.priority || DEFAULT_PRIORITY

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
          <span className={task.completed ? 'completed' : ''}>{task.title}</span>

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
