function TaskForm({
  formData,
  editingId,
  onChange,
  onSubmit,
  onCancel,
}) {
  return (
    <div className="form-card">
      <div className="form-header">
        <div>
          <p className="eyebrow">
            {editingId ? "UPDATE" : "NEW TASK"}
          </p>

          <h2>
            {editingId ? "Edit Task" : "Add a Task"}
          </h2>
        </div>
      </div>

      <form onSubmit={onSubmit}>
        {/* Title */}
        <div className="form-group">
          <label>Title</label>

          <input
            type="text"
            name="title"
            placeholder="e.g. Complete DSA assignment"
            value={formData.title}
            onChange={onChange}
            required
          />
        </div>

        {/* Description */}
        <div className="form-group">
          <label>Description</label>

          <textarea
            name="description"
            placeholder="Add some details about this task..."
            value={formData.description}
            onChange={onChange}
            rows="4"
          />
        </div>

        {/* Deadline + Priority */}
        <div className="form-row">
          <div className="form-group">
            <label>Deadline</label>

            <input
              type="date"
              name="deadline"
              value={formData.deadline}
              onChange={onChange}
              required
            />
          </div>

          <div className="form-group">
            <label>Priority</label>

            <select
              name="priority"
              value={formData.priority}
              onChange={onChange}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        {/* Deadline Type */}
        <div className="form-group">
          <label>Deadline Type</label>

          <select
            name="deadlineType"
            value={formData.deadlineType}
            onChange={onChange}
          >
            <option value="general">General</option>
            <option value="assignment">Assignment</option>
            <option value="exam">Exam</option>
            <option value="work">Work</option>
            <option value="self-study">
              Self Study Goal
            </option>
          </select>
        </div>

        {/* Reference Link */}
        <div className="form-group">
          <label>Reference Link</label>

          <input
            type="url"
            name="referenceLink"
            placeholder="Paste a YouTube, article, email, or other link"
            value={formData.referenceLink}
            onChange={onChange}
          />

          <small className="input-hint">
            Optional — add a resource you'll need to complete this task.
          </small>
        </div>

        {/* Buttons */}
        <div className="form-actions">
          <button
            className="primary-btn"
            type="submit"
          >
            {editingId ? "Update Task" : "Add Task"}
          </button>

          {editingId && (
            <button
              className="secondary-btn"
              type="button"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

export default TaskForm;