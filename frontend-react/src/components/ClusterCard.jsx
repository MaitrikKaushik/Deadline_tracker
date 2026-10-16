import {
  clusterPath,
  countLabel,
  formatDate,
} from "../utils/clusterUtils";

function ClusterCard({ cluster, onDelete }) {
  const isImported = cluster.origin === "imported";
  const taskCount = (cluster.tasks || []).length;
  const date = formatDate(cluster.createdAt);

  return (
    <li className="cluster-card">
      <div className="cluster-card-top">
        <h3>{cluster.name}</h3>

        <span
          className={`badge ${
            isImported ? "badge-imported" : "badge-created"
          }`}
        >
          {isImported ? "Imported" : "Created by you"}
        </span>
      </div>

      <p className="cluster-meta">
        <span>{countLabel(taskCount)}</span>

        {date && (
          <span>
            {isImported ? "Imported" : "Created"} {date}
          </span>
        )}
      </p>

      <div className="cluster-card-actions">
        <a
          className="primary-btn link-btn"
          href={clusterPath.detail(cluster._id)}
          aria-label={`Open ${cluster.name}`}
        >
          Open
        </a>

        {!isImported && (
          <button
            type="button"
            className="delete-btn"
            aria-label={`Delete ${cluster.name}`}
            onClick={() => onDelete(cluster)}
          >
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

export default ClusterCard;
