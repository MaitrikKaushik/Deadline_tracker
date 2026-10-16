import { useState } from "react";

import ClusterCard from "../components/ClusterCard";
import ConfirmDialog from "../components/ConfirmDialog";
import useAsyncData from "../hooks/useAsyncData";
import { deleteCluster, getClusters, isUnauthorized } from "../services/api";
import {
  CLUSTER_FILTERS,
  clusterPath,
  countLabel,
} from "../utils/clusterUtils";

const EMPTY_MESSAGES = {
  mine: {
    title: "No clusters created yet",
    text: "Group related deadlines together by creating your first cluster.",
    cta: true,
  },
  imported: {
    title: "No imported clusters",
    text: "Clusters you import will appear here.",
    cta: false,
  },
  all: {
    title: "No clusters yet",
    text: "Group related deadlines together by creating your first cluster.",
    cta: true,
  },
};

function Clusters({ onNotify, onSessionExpired }) {
  const [filter, setFilter] = useState("all");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const { data, error, loading, reload, mutate } = useAsyncData(
    (signal) => getClusters(filter, { signal }),
    filter,
    { onUnauthorized: onSessionExpired }
  );

  const clusters = Array.isArray(data) ? data : [];

  const closeDialog = () => {
    if (deleting) {
      return;
    }

    setPendingDelete(null);
    setDeleteError("");
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete || deleting) {
      return;
    }

    setDeleting(true);
    setDeleteError("");

    try {
      await deleteCluster(pendingDelete._id);

      const deletedId = pendingDelete._id;

      // Only remove the cluster from the list after the API confirms.
      mutate((current) =>
        (current || []).filter((cluster) => cluster._id !== deletedId)
      );

      onNotify(
        `Cluster "${pendingDelete.name}" deleted. Its deadlines were not deleted.`
      );

      setPendingDelete(null);
    } catch (deleteFailure) {
      if (isUnauthorized(deleteFailure)) {
        onSessionExpired();
        return;
      }

      setDeleteError(deleteFailure.message);
    } finally {
      setDeleting(false);
    }
  };

  const empty = EMPTY_MESSAGES[filter];

  return (
    <section className="cluster-page">
      <div className="page-header">
        <div>
          <p className="eyebrow eyebrow-dark">CLUSTERS</p>
          <h2>Your Clusters</h2>
        </div>

        <a className="primary-btn link-btn" href={clusterPath.create}>
          Create Cluster
        </a>
      </div>

      <div
        className="filter-group"
        role="group"
        aria-label="Filter clusters"
      >
        {CLUSTER_FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`filter-btn ${
              filter === option.value ? "active" : ""
            }`}
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="empty-state" role="status">
          <p>Loading clusters...</p>
        </div>
      )}

      {!loading && error && (
        <div className="empty-state" role="alert">
          <div className="empty-icon">!</div>
          <h3>Unable to load clusters</h3>
          <p>{error.message}</p>

          <button
            type="button"
            className="secondary-btn retry-btn"
            onClick={reload}
          >
            Try again
          </button>
        </div>
      )}

      {!loading && !error && clusters.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">▦</div>
          <h3>{empty.title}</h3>
          <p>{empty.text}</p>

          {empty.cta && (
            <a
              className="primary-btn link-btn empty-cta"
              href={clusterPath.create}
            >
              Create Cluster
            </a>
          )}
        </div>
      )}

      {!loading && !error && clusters.length > 0 && (
        <ul className="cluster-list">
          {clusters.map((cluster) => (
            <ClusterCard
              key={cluster._id}
              cluster={cluster}
              onDelete={setPendingDelete}
            />
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this cluster?"
          confirmLabel="Delete Cluster"
          busyLabel="Deleting..."
          busy={deleting}
          error={deleteError}
          onConfirm={handleConfirmDelete}
          onCancel={closeDialog}
        >
          <p>
            <strong>{pendingDelete.name}</strong> will be removed.
          </p>
          <p>
            Its {countLabel((pendingDelete.tasks || []).length)} will{" "}
            <strong>not</strong> be deleted and will stay in your task
            list.
          </p>
        </ConfirmDialog>
      )}
    </section>
  );
}

export default Clusters;
