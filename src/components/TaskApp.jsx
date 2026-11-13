import { useState } from 'react'
import { Check, LogOut, CalendarDays } from 'lucide-react'
import CalendarPanel from './CalendarPanel'
import TaskStats from './TaskStats'
import TaskForm from './TaskForm'
import TaskFilters from './TaskFilters'
import TaskItem from './TaskItem'
import useTasks from '../hooks/useTasks'

// The signed-in screen: this person's own tasks. It only exists while someone is signed in, so
// every device that signs in with the same account shows the same list.
function TaskApp({ user, onSignOut, onDeleteAccount, onUnauthorized }) {
  const {
    tasks,
    loading,
    error,
    addTask,
    toggleTask,
    updateTask,
    deleteTask,
    markAllComplete,
    clearCompleted,
    clearAll,
  } = useTasks(onUnauthorized)
  const [filter, setFilter] = useState('all')
  const [showCalendar, setShowCalendar] = useState(false)

  function handleDelete(id) {
    if (window.confirm('Are you sure you want to delete this task?')) deleteTask(id)
  }

  function handleClearCompleted() {
    if (window.confirm('Are you sure you want to clear all completed tasks?')) clearCompleted()
  }

  function handleClearAll() {
    if (window.confirm('Are you sure you want to delete ALL tasks?')) clearAll()
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Delete your account and ALL your tasks forever? This cannot be undone.')) return
    const password = window.prompt('Type your password to confirm:')
    if (!password) return
    try {
      await onDeleteAccount(password)
    } catch (err) {
      window.alert(err.message)
    }
  }

  const filteredTasks = tasks.filter((task) => {
    if (filter === 'active') return !task.completed
    if (filter === 'completed') return task.completed
    return true
  })

  const totalTasks = tasks.length
  const completedTasks = tasks.filter((task) => task.completed).length
  const remainingTasks = totalTasks - completedTasks
  const progressPercentage =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100)

  return (
    <main className="todo-content">
      <div className="user-bar">
        <span className="user-email" title={user.email}>
          {user.email}
        </span>
        <button
          type="button"
          className="user-logout"
          aria-expanded={showCalendar}
          onClick={() => setShowCalendar((open) => !open)}
        >
          <CalendarDays size={15} />
          Calendar
        </button>
        <button type="button" className="user-link" onClick={handleDeleteAccount}>
          Delete account
        </button>
        <button type="button" className="user-logout" onClick={onSignOut}>
          <LogOut size={15} />
          Log out
        </button>
      </div>

      {showCalendar && <CalendarPanel />}

      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      <TaskStats
        total={totalTasks}
        completed={completedTasks}
        remaining={remainingTasks}
        progress={progressPercentage}
      />

      <TaskForm onAdd={addTask} />

      <TaskFilters
        filter={filter}
        onChange={setFilter}
        counts={{ total: totalTasks, remaining: remainingTasks, completed: completedTasks }}
      />

      {totalTasks > 0 && (
        <div className="task-actions">
          {remainingTasks > 0 && (
            <button type="button" className="complete-all-button" onClick={markAllComplete}>
              <Check size={16} />
              Mark All Complete
            </button>
          )}

          <div className="task-actions-danger">
            {completedTasks > 0 && (
              <button type="button" className="clear-button" onClick={handleClearCompleted}>
                Clear Completed
              </button>
            )}

            <button type="button" className="clear-all-button" onClick={handleClearAll}>
              Clear All
            </button>
          </div>
        </div>
      )}

      <div className="task-list">
        {filteredTasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            onToggle={toggleTask}
            onDelete={handleDelete}
            onSave={updateTask}
          />
        ))}
      </div>

      {loading && <p className="empty-message">Loading tasks...</p>}

      {!loading && tasks.length === 0 && (
        <p className="empty-message">No tasks yet. Add your first task!</p>
      )}

      {tasks.length > 0 && filteredTasks.length === 0 && (
        <p className="empty-message">No tasks found in this filter.</p>
      )}
    </main>
  )
}

export default TaskApp
