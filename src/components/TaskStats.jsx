// Purely presentational: it only displays the numbers it is given.
function TaskStats({ total, completed, remaining, progress }) {
  return (
    <>
      <div className="task-stats">
        <div className="stat-card">
          <h3>{total}</h3>
          <p>Total Tasks</p>
        </div>

        <div className="stat-card">
          <h3>{completed}</h3>
          <p>Completed</p>
        </div>

        <div className="stat-card">
          <h3>{remaining}</h3>
          <p>Remaining</p>
        </div>
      </div>

      <div className="progress-section">
        <div className="progress-info">
          <span>Your daily progress</span>
          <strong>{progress}%</strong>
        </div>

        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>

        <p>
          {completed} of {total} tasks completed
        </p>
      </div>
    </>
  )
}

export default TaskStats
