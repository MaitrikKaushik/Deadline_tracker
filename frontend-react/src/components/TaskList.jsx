import { useState } from "react";
import TaskCard from "./TaskCard";

function TaskList({
  tasks,
  loading,
  onEdit,
  onDelete,
  onToggleStatus,
}) {
  const [filterType, setFilterType] = useState("all");

  if (loading) {
    return (
      <div className="empty-state">
        <p>Loading tasks...</p>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">✓</div>

        <h3>No tasks yet</h3>

        <p>
          Add your first task using the form above.
        </p>
      </div>
    );
  }

  const priorityOrder = {
    high: 1,
    medium: 2,
    low: 3,
  };

  // Filter tasks by deadline type
  const filteredTasks =
    filterType === "all"
      ? tasks
      : tasks.filter(
          (task) =>
            (task.deadlineType || "general") ===
            filterType
        );

  // Keep existing sorting:
  // Deadline → Priority
  const sortedTasks = [...filteredTasks].sort(
    (a, b) => {
      const dateDifference =
        new Date(a.deadline) -
        new Date(b.deadline);

      if (dateDifference !== 0) {
        return dateDifference;
      }

      return (
        priorityOrder[a.priority] -
        priorityOrder[b.priority]
      );
    }
  );

  return (
    <>
      <div className="task-sort">
        <label htmlFor="deadline-filter">
          Show:
        </label>

        <select
          id="deadline-filter"
          value={filterType}
          onChange={(e) =>
            setFilterType(e.target.value)
          }
        >
          <option value="all">
            All Deadlines
          </option>

          <option value="work">
            Work
          </option>

          <option value="exam">
            Exam
          </option>

          <option value="general">
            General
          </option>

          <option value="assignment">
            Assignment
          </option>

          <option value="self-study">
            Self-study
          </option>
        </select>
      </div>

      {sortedTasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">!</div>

          <h3>No matching deadlines</h3>

          <p>
            There are no {filterType} deadlines
            right now.
          </p>
        </div>
      ) : (
        <div className="task-list">
          {sortedTasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleStatus={onToggleStatus}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default TaskList;