function TaskFilters({ filter, onChange, counts }) {
  const options = [
    { value: 'all', label: 'All', count: counts.total },
    { value: 'active', label: 'Active', count: counts.remaining },
    { value: 'completed', label: 'Completed', count: counts.completed },
  ]

  return (
    <div className="task-filters">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={filter === option.value ? 'active-filter' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label} ({option.count})
        </button>
      ))}
    </div>
  )
}

export default TaskFilters
