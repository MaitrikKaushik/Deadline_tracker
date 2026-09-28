import TaskCard from "./TaskCard";

function TaskList({
  tasks,
  loading,
  onEdit,
  onDelete,
  onToggleStatus,
}) {
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

  const sortedTasks = [...tasks].sort((a, b) => {
    // First: deadline
    const dateDifference =
      new Date(a.deadline) - new Date(b.deadline);

    if (dateDifference !== 0) {
      return dateDifference;
    }

    // Second: priority
    return (
      priorityOrder[a.priority] -
      priorityOrder[b.priority]
    );
  });

  return (
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
  );
}

export default TaskList;