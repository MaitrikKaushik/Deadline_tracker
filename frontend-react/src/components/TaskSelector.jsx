import {
  formatDate,
  sortTasks,
  uniqueIds,
} from "../utils/clusterUtils";

// Multi-select list of existing deadlines. It only reports ID changes;
// it never creates or modifies tasks.
function TaskSelector({
  tasks,
  selectedIds,
  onChange,
  disabled = false,
}) {
  const selected = new Set(selectedIds);
  const sorted = sortTasks(tasks);

  const toggle = (taskId) => {
    if (selected.has(taskId)) {
      onChange(selectedIds.filter((id) => id !== taskId));
    } else {
      onChange(uniqueIds([...selectedIds, taskId]));
    }
  };

  const selectAll = () =>
    onChange(
      uniqueIds([...selectedIds, ...sorted.map((task) => task._id)])
    );

  const clearAll = () => onChange([]);

  return (
    <div className="selector">
      <div className="selector-toolbar">
        <p className="selector-count" aria-live="polite">
          {selectedIds.length}{" "}
          {selectedIds.length === 1 ? "deadline" : "deadlines"} selected
        </p>

        <div className="selector-buttons">
          <button
            type="button"
            className="secondary-btn"
            onClick={selectAll}
            disabled={disabled || sorted.length === 0}
          >
            Select all
          </button>

          <button
            type="button"
            className="secondary-btn"
            onClick={clearAll}
            disabled={disabled || selectedIds.length === 0}
          >
            Clear
          </button>
        </div>
      </div>

      <ul className="selector-list">
        {sorted.map((task) => {
          const isSelected = selected.has(task._id);

          return (
            <li key={task._id}>
              <label
                className={`selector-item ${
                  isSelected ? "selected" : ""
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={disabled}
                  onChange={() => toggle(task._id)}
                  aria-label={`Select ${task.title}`}
                />

                <span className="selector-details">
                  <span className="selector-title">{task.title}</span>

                  <span className="selector-meta">
                    <span>Due {formatDate(task.deadline)}</span>

                    <span
                      className={`priority priority-${task.priority}`}
                    >
                      {task.priority}
                    </span>

                    <span
                      className={`status ${
                        task.status === "completed"
                          ? "status-completed"
                          : "status-pending"
                      }`}
                    >
                      {task.status === "completed"
                        ? "Completed"
                        : "Pending"}
                    </span>
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default TaskSelector;
