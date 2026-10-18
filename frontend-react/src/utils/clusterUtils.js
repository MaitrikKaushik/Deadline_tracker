export const CLUSTER_NAME_MAX = 100;

export const CLUSTER_FILTERS = [
  { value: "mine", label: "My Clusters" },
  { value: "imported", label: "Imported Clusters" },
  { value: "all", label: "All Clusters" },
];

// Mirrors the V1 task form defaults (see App.jsx) so that tasks created
// inside the cluster workflow behave exactly like tasks created normally.
export const emptyTaskForm = () => ({
  title: "",
  description: "",
  deadline: "",
  priority: "medium",
  deadlineType: "general",
  referenceLink: "",
  reminderEnabled: true,
});

// Returns an error message, or "" when the name is valid.
export function validateClusterName(name) {
  if (typeof name !== "string" || name.length === 0) {
    return "Cluster name is required.";
  }

  const trimmed = name.trim();

  if (!trimmed) {
    return "Cluster name cannot be only spaces.";
  }

  if (trimmed.length > CLUSTER_NAME_MAX) {
    return `Cluster name must be ${CLUSTER_NAME_MAX} characters or fewer.`;
  }

  return "";
}

// Removes duplicates and empty values while keeping the original order.
export const uniqueIds = (ids) => [
  ...new Set((ids || []).filter(Boolean).map(String)),
];

// A populated cluster holds task documents; a freshly created one holds IDs.
export const taskIdsOf = (cluster) =>
  uniqueIds(
    ((cluster && cluster.tasks) || []).map((task) =>
      typeof task === "string" ? task : task && task._id
    )
  );

const PRIORITY_ORDER = { high: 1, medium: 2, low: 3 };

// Same ordering the V1 task list uses: deadline, then priority.
export const sortTasks = (tasks) =>
  [...(tasks || [])].sort((a, b) => {
    const difference = new Date(a.deadline) - new Date(b.deadline);

    if (difference !== 0) {
      return difference;
    }

    return (
      (PRIORITY_ORDER[a.priority] || 4) -
      (PRIORITY_ORDER[b.priority] || 4)
    );
  });

export const formatDate = (value) => {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const countLabel = (count) =>
  `${count} ${count === 1 ? "deadline" : "deadlines"}`;

// ---- Hash routing (no router library; works on static hosting) ----

export const clusterPath = {
  list: "#/clusters",
  create: "#/clusters/new",
  detail: (id) => `#/clusters/${encodeURIComponent(id)}`,
  broadcasts: "#/broadcasts",
  managedUpdates: "#/managed-updates",
  broadcast: (code) => `#/broadcasts/${encodeURIComponent(code)}`,
};

export function parseRoute(hash) {
  const path =
    (hash || "").replace(/^#/, "").replace(/\/+$/, "") || "/";

  if (path === "/clusters") {
    return { name: "clusters" };
  }

  if (path === "/clusters/new") {
    return { name: "cluster-new" };
  }

  if (path === "/broadcasts") {
    return { name: "broadcasts" };
  }

  if (path === "/managed-updates") {
    return { name: "managed-updates" };
  }

  const broadcastMatch = path.match(/^\/broadcasts\/([^/]+)$/);
  if (broadcastMatch) {
    let code = broadcastMatch[1];
    try { code = decodeURIComponent(code); } catch { /* keep raw code for API validation */ }
    return { name: "broadcast-detail", code };
  }

  const match = path.match(/^\/clusters\/([^/]+)$/);

  if (match) {
    let id = match[1];

    try {
      id = decodeURIComponent(id);
    } catch {
      // keep the raw value; the API will reject it with a clear message
    }

    return { name: "cluster-detail", id };
  }

  return { name: "tasks" };
}

export const navigate = (hash) => {
  window.location.hash = hash;
};
