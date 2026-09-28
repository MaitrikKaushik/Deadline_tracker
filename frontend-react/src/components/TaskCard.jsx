function TaskCard({
  task,
  onEdit,
  onDelete,
  onToggleStatus,
}) {
  const isCompleted = task.status === "completed";

  const deadlineType =
    task.deadlineType || "general";

  return (
    <article
      className={`task-card ${
        isCompleted ? "completed" : ""
      }`}
    >
      <div className="task-main">

        {/* Title + Priority */}
        <div className="task-top">
          <h3>{task.title}</h3>

          <span
            className={`priority priority-${task.priority}`}
          >
            {task.priority}
          </span>
        </div>

        {/* Description */}
        {task.description && (
          <p className="task-description">
            {task.description}
          </p>
        )}

        {/* Deadline Type */}
        <div className="task-type">
          <span className="deadline-type">
            {deadlineType === "self-study"
              ? "Self Study Goal"
              : deadlineType.charAt(0).toUpperCase() +
                deadlineType.slice(1)}
          </span>
        </div>

        {/* Reference Link */}
        {task.referenceLink && (
          <a
            className="reference-link"
            href={task.referenceLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            View Reference ↗
          </a>
        )}

        {/* Metadata */}
        <div className="task-meta">
          <span>
            Deadline:{" "}
            {new Date(
              task.deadline
            ).toLocaleDateString()}
          </span>

          <span
            className={`status ${
              isCompleted
                ? "status-completed"
                : "status-pending"
            }`}
          >
            {isCompleted
              ? "Completed"
              : "Pending"}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="task-actions">
        <button
          className="complete-btn"
          onClick={() => onToggleStatus(task)}
        >
          {isCompleted
            ? "Mark Pending"
            : "Complete"}
        </button>

        <button
          className="edit-btn"
          onClick={() => onEdit(task)}
        >
          Edit
        </button>

        <button
          className="delete-btn"
          onClick={() => onDelete(task._id)}
        >
          Delete
        </button>
      </div>
    </article>
  );
}

export default TaskCard;