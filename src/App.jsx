import { useState } from 'react'
import { Check } from 'lucide-react'
import './App.css'
import Header from './components/Header'
import TaskStats from './components/TaskStats'
import TaskForm from './components/TaskForm'
import TaskFilters from './components/TaskFilters'
import TaskItem from './components/TaskItem'
import useLocalStorage from './hooks/useLocalStorage'

// App now only owns the data (tasks, filter) and the actions that change it.
function App() {
  const [tasks, setTasks] = useLocalStorage('myTasks', [])
  const [filter, setFilter] = useState('all')

  function addTask(title, priority) {
    const task = { id: Date.now(), title, completed: false, priority }
    setTasks((previousTasks) => [...previousTasks, task])
  }

  function toggleTask(id) {
    setTasks((previousTasks) =>
      previousTasks.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    )
  }

  function updateTask(id, changes) {
    setTasks((previousTasks) =>
      previousTasks.map((task) => (task.id === id ? { ...task, ...changes } : task))
    )
  }

  function markAllComplete() {
    setTasks((previousTasks) => previousTasks.map((task) => ({ ...task, completed: true })))
  }

  function deleteTask(id) {
    if (!window.confirm('Are you sure you want to delete this task?')) return
    setTasks((previousTasks) => previousTasks.filter((task) => task.id !== id))
  }

  function clearCompletedTasks() {
    if (!window.confirm('Are you sure you want to clear all completed tasks?')) return
    setTasks((previousTasks) => previousTasks.filter((task) => !task.completed))
  }

  function clearAllTasks() {
    if (!window.confirm('Are you sure you want to delete ALL tasks?')) return
    setTasks([])
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
    <div className="app-container">
      <Header title="My Tasks" subtitle="Organize your day, one task at a time." />

      <main className="todo-content">
        <h2>My Daily Tasks</h2>

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
                <button type="button" className="clear-button" onClick={clearCompletedTasks}>
                  Clear Completed
                </button>
              )}

              <button type="button" className="clear-all-button" onClick={clearAllTasks}>
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
              onDelete={deleteTask}
              onSave={updateTask}
            />
          ))}
        </div>

        {tasks.length === 0 && (
          <p className="empty-message">No tasks yet. Add your first task!</p>
        )}

        {tasks.length > 0 && filteredTasks.length === 0 && (
          <p className="empty-message">No tasks found in this filter.</p>
        )}
      </main>
    </div>
  )
}

export default App
