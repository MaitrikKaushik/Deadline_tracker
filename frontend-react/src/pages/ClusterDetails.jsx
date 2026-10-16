import { useRef, useState } from "react";

import ConfirmDialog from "../components/ConfirmDialog";
import TaskCard from "../components/TaskCard";
import TaskSelector from "../components/TaskSelector";
import useAsyncData from "../hooks/useAsyncData";
import {
  deleteCluster,
  getCluster,
  getTasks,
  isUnauthorized,
  updateCluster,
} from "../services/api";
import {
  CLUSTER_NAME_MAX,
  clusterPath,
  countLabel,
  formatDate,
  navigate,
  sortTasks,
  taskIdsOf,
  uniqueIds,
  validateClusterName,
} from "../utils/clusterUtils";

function ClusterDetails({ clusterId, onNotify, onSessionExpired }) {
  const { data: cluster, error, loading, reload, mutate } =
    useAsyncData((signal) => getCluster(clusterId, { signal }), clusterId, {
      onUnauthorized: onSessionExpired,
    });

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editIds, setEditIds] = useState([]);
  const [nameTouched, setNameTouched] = useState(false);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const [allTasks, setAllTasks] = useState({
    status: "idle",
    data: [],
    error: "",
  });

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deletingRef = useRef(false);

  const loadAllTasks = async () => {
    setAllTasks({ status: "loading", data: [], error: "" });

    try {
      const tasks = await getTasks();

      setAllTasks({
        status: "ready",
        data: Array.isArray(tasks) ? tasks : [],
        error: "",
      });
    } catch (taskError) {
      if (isUnauthorized(taskError)) {
        onSessionExpired();
        return;
      }

      setAllTasks({
        status: "error",
        data: [],
        error: taskError.message,
      });
    }
  };

  const startEditing = () => {
    setEditName(cluster.name);
    setEditIds(taskIdsOf(cluster));
    setNameTouched(false);
    setEditError("");
    setEditing(true);
    loadAllTasks();
  };

  const cancelEditing = () => {
    if (saving) {
      return;
    }

    setEditing(false);
    setEditError("");
  };

  const nameError = nameTouched ? validateClusterName(editName) : "";

  const handleSave = async (event) => {
    event.preventDefault();

    if (savingRef.current) {
      return;
    }

    setNameTouched(true);

    if (validateClusterName(editName)) {
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setEditError("");

    try {
      const payload = { name: editName.trim() };

      // Only send membership when the full task list was loaded, so a
      // failed task fetch can never wipe out the cluster's deadlines.
      if (allTasks.status === "ready") {
        payload.taskIds = uniqueIds(editIds);
      }

      const updated = await updateCluster(cluster._id, payload);

      mutate(() => updated);
      setEditing(false);
      onNotify("Cluster updated.");
    } catch (saveError) {
      if (isUnauthorized(saveError)) {
        onSessionExpired();
        return;
      }

      setEditError(saveError.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deletingRef.current) {
      return;
    }

    deletingRef.current = true;
    setDeleting(true);
    setDeleteError("");

    try {
      await deleteCluster(cluster._id);

      onNotify(
        `Cluster "${cluster.name}" deleted. Its deadlines were not deleted.`
      );

      navigate(clusterPath.list);
    } catch (deleteFailure) {
      if (isUnauthorized(deleteFailure)) {
        onSessionExpired();
        return;
      }

      setDeleteError(deleteFailure.message);
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <section className="cluster-page">
        <div className="empty-state" role="status">
          <p>Loading cluster...</p>
        </div>
      </section>
    );
  }

  if (error || !cluster) {
    return (
      <section className="cluster-page">
        <a className="back-link" href={clusterPath.list}>
          ← Back to clusters
        </a>

        <div className="empty-state" role="alert">
          <div className="empty-icon">!</div>
          <h3>Unable to load this cluster</h3>
          <p>{error ? error.message : "Cluster not found."}</p>

          <button
            type="button"
            className="secondary-btn retry-btn"
            onClick={reload}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  const isImported = cluster.origin === "imported";
  const tasks = sortTasks(cluster.tasks || []);
  const createdDate = formatDate(cluster.createdAt);

  return (
    <section className="cluster-page">
      <a className="back-link" href={clusterPath.list}>
        ← Back to clusters
      </a>

      <div className="form-card cluster-detail-card">
        {!editing && (
          <>
            <div className="page-header">
              <div>
                <p className="eyebrow eyebrow-dark">CLUSTER</p>
                <h2>{cluster.name}</h2>

                <p className="cluster-meta">
                  <span
                    className={`badge ${
                      isImported ? "badge-imported" : "badge-created"
                    }`}
                  >
                    {isImported ? "Imported" : "Created by you"}
                  </span>

                  <span>{countLabel(tasks.length)}</span>

                  {createdDate && (
                    <span>
                      {isImported ? "Imported" : "Created"} {createdDate}
                    </span>
                  )}
                </p>
              </div>

              {!isImported && (
                <div className="page-actions">
                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={startEditing}
                  >
                    Edit Cluster
                  </button>

                  <button
                    type="button"
                    className="delete-btn"
                    onClick={() => {
                      setDeleteError("");
                      setConfirmingDelete(true);
                    }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            {isImported && (
              <p className="readonly-banner">
                This is an imported cluster, so it is view-only.
              </p>
            )}
          </>
        )}

        {editing && (
          <form onSubmit={handleSave} noValidate>
            <div className="form-header">
              <p className="eyebrow eyebrow-dark">UPDATE</p>
              <h2>Edit Cluster</h2>
            </div>

            <div className="form-group">
              <label htmlFor="edit-cluster-name">Cluster name</label>

              <input
                id="edit-cluster-name"
                type="text"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                onBlur={() => setNameTouched(true)}
                aria-invalid={Boolean(nameError)}
                aria-describedby={
                  nameError ? "edit-cluster-name-error" : undefined
                }
              />

              <small className="char-count">
                {editName.trim().length}/{CLUSTER_NAME_MAX}
              </small>

              {nameError && (
                <p
                  id="edit-cluster-name-error"
                  className="form-error"
                  role="alert"
                >
                  {nameError}
                </p>
              )}
            </div>

            <div className="form-group">
              <label>Deadlines in this cluster</label>

              {allTasks.status === "loading" && (
                <p className="input-hint" role="status">
                  Loading your deadlines...
                </p>
              )}

              {allTasks.status === "error" && (
                <div className="inline-error" role="alert">
                  <p>
                    Unable to load your deadlines: {allTasks.error}. You
                    can still rename the cluster.
                  </p>

                  <button
                    type="button"
                    className="secondary-btn"
                    onClick={loadAllTasks}
                  >
                    Try again
                  </button>
                </div>
              )}

              {allTasks.status === "ready" &&
                (allTasks.data.length === 0 ? (
                  <p className="input-hint">
                    You don't have any deadlines yet.
                  </p>
                ) : (
                  <TaskSelector
                    tasks={allTasks.data}
                    selectedIds={editIds}
                    onChange={setEditIds}
                    disabled={saving}
                  />
                ))}
            </div>

            {editError && (
              <p className="form-error" role="alert">
                {editError}
              </p>
            )}

            <div className="form-actions">
              <button
                type="submit"
                className="primary-btn"
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>

              <button
                type="button"
                className="secondary-btn"
                onClick={cancelEditing}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {!editing && (
        <div className="cluster-tasks">
          <h3>Deadlines</h3>

          {tasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">✓</div>
              <h3>No deadlines in this cluster</h3>
              <p>
                {isImported
                  ? "This imported cluster has no deadlines."
                  : "Use Edit Cluster to add deadlines."}
              </p>
            </div>
          ) : (
            <div className="task-list">
              {tasks.map((task) => (
                <TaskCard key={task._id} task={task} readOnly />
              ))}
            </div>
          )}
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this cluster?"
          confirmLabel="Delete Cluster"
          busyLabel="Deleting..."
          busy={deleting}
          error={deleteError}
          onConfirm={handleDelete}
          onCancel={() => {
            if (!deleting) {
              setConfirmingDelete(false);
            }
          }}
        >
          <p>
            <strong>{cluster.name}</strong> will be removed.
          </p>
          <p>
            Its {countLabel(tasks.length)} will <strong>not</strong> be
            deleted and will stay in your task list.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

export default ClusterDetails;
