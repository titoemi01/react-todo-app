import { useState } from 'react'
import { Check } from 'lucide-react'
import './App.css'
import Header from './components/Header'
import TaskStats from './components/TaskStats'
import TaskForm from './components/TaskForm'
import TaskFilters from './components/TaskFilters'
import TaskItem from './components/TaskItem'
import useTasks from './hooks/useTasks'

// App owns the filter and wires UI events to the actions from useTasks.
// The tasks themselves now live on the server, so everyone with the link shares them.
function App() {
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
  } = useTasks()
  const [filter, setFilter] = useState('all')

  function handleDelete(id) {
    if (window.confirm('Are you sure you want to delete this task?')) deleteTask(id)
  }

  function handleClearCompleted() {
    if (window.confirm('Are you sure you want to clear all completed tasks?')) clearCompleted()
  }

  function handleClearAll() {
    if (window.confirm('Are you sure you want to delete ALL tasks?')) clearAll()
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
    </div>
  )
}

export default App
