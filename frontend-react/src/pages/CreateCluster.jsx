import { useRef, useState } from "react";

import TaskForm from "../components/TaskForm";
import TaskSelector from "../components/TaskSelector";
import useAsyncData from "../hooks/useAsyncData";
import {
  createCluster,
  createTask,
  getTasks,
  isUnauthorized,
} from "../services/api";
import {
  CLUSTER_NAME_MAX,
  clusterPath,
  countLabel,
  emptyTaskForm,
  formatDate,
  navigate,
  uniqueIds,
  validateClusterName,
} from "../utils/clusterUtils";

function CreateCluster({ onNotify, onSessionExpired, onTasksChanged }) {
  // Step 1: details
  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const nameInputRef = useRef(null);

  // Step 2: deadlines (both modes keep their state when switching)
  const [mode, setMode] = useState("new");
  const [selectedIds, setSelectedIds] = useState([]);
  const [createdTasks, setCreatedTasks] = useState([]);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskError, setTaskError] = useState("");
  const [taskNotice, setTaskNotice] = useState("");
  const taskSavingRef = useRef(false);

  // Step 3: submit
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submittingRef = useRef(false);

  const {
    data: tasksData,
    error: tasksError,
    loading: tasksLoading,
    reload: reloadTasks,
  } = useAsyncData((signal) => getTasks({ signal }), "tasks", {
    onUnauthorized: onSessionExpired,
  });

  const createdIds = new Set(createdTasks.map((task) => task._id));

  // Tasks created in this workflow are listed in the "new" panel,
  // so keep them out of the "existing" picker.
  const existingTasks = (Array.isArray(tasksData) ? tasksData : []).filter(
    (task) => !createdIds.has(task._id)
  );

  const nameError = nameTouched ? validateClusterName(name) : "";

  const finalTaskIds = uniqueIds([
    ...createdTasks.map((task) => task._id),
    ...selectedIds,
  ]);

  const handleTaskChange = (event) => {
    const { name: field, value, type, checked } = event.target;

    setTaskForm((previous) => ({
      ...previous,
      [field]: type === "checkbox" ? checked : value,
    }));
  };

  // Uses the same endpoint and payload as the V1 task form.
  const handleTaskSubmit = async (event) => {
    event.preventDefault();

    if (taskSavingRef.current) {
      return;
    }

    taskSavingRef.current = true;
    setTaskSaving(true);
    setTaskError("");
    setTaskNotice("");

    try {
      const task = await createTask(taskForm);

      setCreatedTasks((previous) => [...previous, task]);
      setTaskForm(emptyTaskForm());
      setTaskNotice(`"${task.title}" was added to this cluster.`);

      // Keep the main task list and counter in sync.
      onTasksChanged();
    } catch (error) {
      if (isUnauthorized(error)) {
        onSessionExpired();
        return;
      }

      setTaskError(error.message);
    } finally {
      taskSavingRef.current = false;
      setTaskSaving(false);
    }
  };

  // Removes a deadline from the cluster being built. The task itself
  // stays in the user's task list.
  const removeCreatedTask = (taskId) => {
    setCreatedTasks((previous) =>
      previous.filter((task) => task._id !== taskId)
    );
    setTaskNotice("");
  };

  const handleCreate = async () => {
    if (submittingRef.current) {
      return;
    }

    setNameTouched(true);

    if (validateClusterName(name)) {
      nameInputRef.current?.focus();
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError("");

    try {
      const cluster = await createCluster({
        name: name.trim(),
        taskIds: finalTaskIds,
      });

      onNotify(`Cluster "${cluster.name}" created.`);
      navigate(clusterPath.detail(cluster._id));
      // Stay in the "submitting" state while navigating so the button
      // cannot be clicked a second time.
    } catch (error) {
      submittingRef.current = false;
      setSubmitting(false);

      if (isUnauthorized(error)) {
        onSessionExpired();
        return;
      }

      setSubmitError(error.message);
    }
  };

  return (
    <section className="cluster-page">
      <a className="back-link" href={clusterPath.list}>
        ← Back to clusters
      </a>

      <div className="page-header">
        <div>
          <p className="eyebrow eyebrow-dark">NEW CLUSTER</p>
          <h2>Create Cluster</h2>
        </div>
      </div>

      {/* STEP 1 */}
      <div className="form-card step-card">
        <h3>
          <span className="step-number">1</span> Cluster details
        </h3>

        <form onSubmit={(event) => event.preventDefault()} noValidate>
          <div className="form-group">
            <label htmlFor="cluster-name">Cluster name</label>

            <input
              id="cluster-name"
              ref={nameInputRef}
              type="text"
              placeholder="e.g. Semester 5 exams"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => setNameTouched(true)}
              aria-invalid={Boolean(nameError)}
              aria-describedby={
                nameError ? "cluster-name-error" : undefined
              }
            />

            <small className="char-count">
              {name.trim().length}/{CLUSTER_NAME_MAX}
            </small>

            {nameError && (
              <p
                id="cluster-name-error"
                className="form-error"
                role="alert"
              >
                {nameError}
              </p>
            )}
          </div>
        </form>
      </div>

      {/* STEP 2 */}
      <div className="form-card step-card">
        <h3>
          <span className="step-number">2</span> Add deadlines
        </h3>

        <div
          className="option-grid"
          role="radiogroup"
          aria-label="How do you want to add deadlines?"
        >
          <label
            className={`option-card ${mode === "new" ? "selected" : ""}`}
          >
            <input
              type="radio"
              name="populate-mode"
              value="new"
              checked={mode === "new"}
              onChange={() => setMode("new")}
            />

            <span>
              <strong>Create New Deadlines</strong>
              <small>Write new deadlines and add them straight in.</small>
            </span>
          </label>

          <label
            className={`option-card ${
              mode === "existing" ? "selected" : ""
            }`}
          >
            <input
              type="radio"
              name="populate-mode"
              value="existing"
              checked={mode === "existing"}
              onChange={() => setMode("existing")}
            />

            <span>
              <strong>Select Existing Deadlines</strong>
              <small>Pick from the deadlines you already have.</small>
            </span>
          </label>
        </div>

        {mode === "new" && (
          <div className="mode-panel">
            <p className="input-hint">
              Each new deadline is saved to your task list as soon as you
              add it.
            </p>

            <TaskForm
              formData={taskForm}
              editingId={null}
              onChange={handleTaskChange}
              onSubmit={handleTaskSubmit}
              onCancel={() => {}}
            />

            {taskSaving && (
              <p className="input-hint" role="status">
                Saving deadline...
              </p>
            )}

            {taskError && (
              <p className="form-error" role="alert">
                {taskError}
              </p>
            )}

            {taskNotice && (
              <p className="form-success" role="status">
                {taskNotice}
              </p>
            )}

            {createdTasks.length > 0 && (
              <div className="created-tasks">
                <h4>New deadlines in this cluster</h4>

                <ul>
                  {createdTasks.map((task) => (
                    <li key={task._id}>
                      <span>
                        <strong>{task.title}</strong>
                        <small>Due {formatDate(task.deadline)}</small>
                      </span>

                      <button
                        type="button"
                        className="secondary-btn"
                        aria-label={`Remove ${task.title} from cluster`}
                        onClick={() => removeCreatedTask(task._id)}
                      >
                        Remove from cluster
                      </button>
                    </li>
                  ))}
                </ul>

                <p className="input-hint">
                  Removing a deadline here only leaves it out of the
                  cluster. It stays in your task list.
                </p>
              </div>
            )}
          </div>
        )}

        {mode === "existing" && (
          <div className="mode-panel">
            {tasksLoading && (
              <p className="input-hint" role="status">
                Loading your deadlines...
              </p>
            )}

            {!tasksLoading && tasksError && (
              <div className="inline-error" role="alert">
                <p>Unable to load your deadlines: {tasksError.message}</p>

                <button
                  type="button"
                  className="secondary-btn"
                  onClick={reloadTasks}
                >
                  Try again
                </button>
              </div>
            )}

            {!tasksLoading && !tasksError && existingTasks.length === 0 && (
              <div className="empty-state">
                <h3>No existing deadlines to select</h3>
                <p>Create new deadlines instead.</p>

                <button
                  type="button"
                  className="secondary-btn retry-btn"
                  onClick={() => setMode("new")}
                >
                  Create New Deadlines
                </button>
              </div>
            )}

            {!tasksLoading && !tasksError && existingTasks.length > 0 && (
              <TaskSelector
                tasks={existingTasks}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
                disabled={submitting}
              />
            )}
          </div>
        )}
      </div>

      {/* STEP 3 */}
      <div className="form-card step-card">
        <h3>
          <span className="step-number">3</span> Review and create
        </h3>

        <p className="summary-line" aria-live="polite">
          {finalTaskIds.length === 0
            ? "No deadlines selected yet. You can create an empty cluster and add deadlines later."
            : `${countLabel(finalTaskIds.length)} will be added (${createdTasks.length} new, ${selectedIds.length} existing).`}
        </p>

        {submitError && (
          <p className="form-error" role="alert">
            {submitError}
          </p>
        )}

        <div className="form-actions">
          <button
            type="button"
            className="primary-btn"
            onClick={handleCreate}
            disabled={submitting}
          >
            {submitting ? "Creating..." : "Create Cluster"}
          </button>

          <a className="secondary-btn link-btn" href={clusterPath.list}>
            Cancel
          </a>
        </div>
      </div>
    </section>
  );
}

export default CreateCluster;
