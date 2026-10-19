import { useRef, useState } from "react";

import ConfirmDialog from "../components/ConfirmDialog";
import TaskCard from "../components/TaskCard";
import TaskSelector from "../components/TaskSelector";
import useAsyncData from "../hooks/useAsyncData";
import {
  createBroadcast,
  deleteCluster,
  getCluster,
  getTasks,
  isUnauthorized,
  revokeBroadcast,
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
  const [removeImportedCopies, setRemoveImportedCopies] = useState(false);
  const deletingRef = useRef(false);

  const [shareOpen, setShareOpen] = useState(false);
  const [shareSelectedIds, setShareSelectedIds] = useState([]);
  const [shareDescription, setShareDescription] = useState("");
  const [shareError, setShareError] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState(null);
  const [revokingShare, setRevokingShare] = useState(false);
  const [shareRevoked, setShareRevoked] = useState(false);

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

      const renamed = payload.name !== cluster.name;
      const updated = await updateCluster(cluster._id, payload);

      mutate(() => updated);
      setEditing(false);
      let updateNotice = updated.managedUpdateWarning;
      if (!updateNotice && updated.managedSyncSummary) {
        const summary = updated.managedSyncSummary;
        if (summary.broadcastsFound === 0) {
          updateNotice = "Cluster saved, but no broadcast is linked to this source cluster. No recipient update could be prepared.";
        } else {
          const broadcastLabel = `${summary.broadcastsUpdated || 0} shared broadcast${summary.broadcastsUpdated === 1 ? "" : "s"}`;
          const proposalLabel = `${summary.proposalsCreated || 0} recipient update proposal${summary.proposalsCreated === 1 ? "" : "s"}`;
          updateNotice = `Cluster saved. Updated ${broadcastLabel} and prepared ${proposalLabel} across ${summary.activeImportsFound || 0} connected imported cluster${summary.activeImportsFound === 1 ? "" : "s"}.`;
        }
      }
      onNotify(
        updateNotice || (renamed
          ? "Cluster updated. Shared recipients will be asked before the rename is applied."
          : "Cluster updated.")
      );
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

  const openShareDialog = () => {
    setShareSelectedIds(taskIdsOf(cluster));
    setShareDescription("");
    setShareError("");
    setShareResult(null);
    setShareRevoked(false);
    setShareOpen(true);
  };

  const handleCreateBroadcast = async (event) => {
    event.preventDefault();
    if (sharing || shareSelectedIds.length === 0) return;
    setSharing(true);
    setShareError("");
    try {
      const result = await createBroadcast(cluster._id, {
        taskIds: shareSelectedIds,
        description: shareDescription,
      });
      setShareResult(result);
      onNotify("Share link created. Only the selected deadlines are included.");
    } catch (failure) {
      if (isUnauthorized(failure)) {
        onSessionExpired();
        return;
      }
      setShareError(failure.message);
    } finally {
      setSharing(false);
    }
  };

  const handleCopyShareLink = async () => {
    const link = `${window.location.origin}${window.location.pathname}${clusterPath.broadcast(shareResult.code)}`;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable. Select the share link and copy it manually.");
      }
      await navigator.clipboard.writeText(link);
      onNotify("Share link copied to clipboard.");
    } catch (error) {
      setShareError(error.message || "Unable to copy the share link. Select and copy it manually.");
    }
  };

  const handleRevokeBroadcast = async () => {
    if (!shareResult || revokingShare) return;
    setRevokingShare(true);
    setShareError("");
    try {
      await revokeBroadcast(shareResult._id);
      setShareRevoked(true);
      onNotify("Sharing revoked. The share code can no longer be used for new imports.");
    } catch (failure) {
      if (isUnauthorized(failure)) {
        onSessionExpired();
        return;
      }
      setShareError(failure.message);
    } finally {
      setRevokingShare(false);
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
      await deleteCluster(cluster._id, { removeImportedCopies });

      onNotify(
        removeImportedCopies
          ? `Cluster "${cluster.name}" and its mapped imported copies were deleted.`
          : `Cluster "${cluster.name}" deleted. Its deadlines were not deleted; existing imported copies were preserved.`
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
                    onClick={openShareDialog}
                    disabled={tasks.length === 0}
                  >
                    Share Cluster
                  </button>

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
                      setRemoveImportedCopies(false);
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

      {shareOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section className="dialog broadcast-dialog" role="dialog" aria-modal="true" aria-labelledby="share-dialog-title">
            <h2 id="share-dialog-title">Share {cluster.name}</h2>
            {!shareResult ? (
              <form onSubmit={handleCreateBroadcast}>
                <p>Choose which deadlines other people can preview and import. Your original tasks remain private and unchanged.</p>
                <div className="broadcast-task-options">
                  {tasks.map((task) => {
                    const id = String(task._id);
                    return (
                      <label className="broadcast-task-option" key={id}>
                        <input
                          type="checkbox"
                          checked={shareSelectedIds.includes(id)}
                          onChange={() => setShareSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])}
                        />
                        <span><strong>{task.title}</strong><small>{formatDate(task.deadline)}</small></span>
                      </label>
                    );
                  })}
                </div>
                <div className="form-group">
                  <label htmlFor="share-description">Optional note (up to 500 characters)</label>
                  <textarea id="share-description" rows="3" maxLength={500} value={shareDescription} onChange={(event) => setShareDescription(event.target.value)} />
                </div>
                {shareError && <p className="form-error" role="alert">{shareError}</p>}
                <div className="form-actions">
                  <button type="submit" className="primary-btn" disabled={sharing || shareSelectedIds.length === 0}>{sharing ? "Creating link..." : "Create share link"}</button>
                  <button type="button" className="secondary-btn" disabled={sharing} onClick={() => setShareOpen(false)}>Cancel</button>
                </div>
              </form>
            ) : (
              <div>
                {shareRevoked ? (
                  <p className="readonly-banner">Sharing has been revoked. This link can no longer be used for new imports.</p>
                ) : (
                  <>
                    <p>Your share link is ready. Anyone with the link can preview the selected deadlines.</p>
                    <div className="form-group">
                      <label htmlFor="share-code">Share code</label>
                      <input id="share-code" readOnly value={shareResult.code} />
                    </div>
                    <div className="form-group">
                      <label htmlFor="share-link">Share link</label>
                      <input id="share-link" readOnly value={`${window.location.origin}${window.location.pathname}${clusterPath.broadcast(shareResult.code)}`} onFocus={(event) => event.target.select()} />
                    </div>
                    <div className="form-actions">
                      <button type="button" className="primary-btn" onClick={handleCopyShareLink}>Copy share link</button>
                      <button type="button" className="delete-btn" disabled={revokingShare} onClick={handleRevokeBroadcast}>{revokingShare ? "Revoking..." : "Revoke sharing"}</button>
                    </div>
                  </>
                )}
                {shareError && <p className="form-error" role="alert">{shareError}</p>}
                <div className="form-actions">
                  <button type="button" className="secondary-btn" onClick={() => setShareOpen(false)}>Close</button>
                </div>
              </div>
            )}
          </section>
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
            Its {countLabel(tasks.length)} will not be deleted from your personal task list.
            Sharing links for this cluster will be revoked.
          </p>
          <fieldset className="managed-delete-options">
            <legend>What should happen to imported copies?</legend>
            <label>
              <input
                type="radio"
                name="cluster-delete-policy-detail"
                checked={!removeImportedCopies}
                onChange={() => setRemoveImportedCopies(false)}
                disabled={deleting}
              />
              <span><strong>Keep existing copies</strong><small>People keep their copies, but receive no future updates from this source.</small></span>
            </label>
            <label>
              <input
                type="radio"
                name="cluster-delete-policy-detail"
                checked={removeImportedCopies}
                onChange={() => setRemoveImportedCopies(true)}
                disabled={deleting}
              />
              <span><strong>Remove imported copies too</strong><small>Delete copied tasks and imported clusters created from this source across recipients.</small></span>
            </label>
          </fieldset>
        </ConfirmDialog>
      )}
    </section>
  );
}

export default ClusterDetails;
