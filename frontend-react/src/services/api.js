// Thin wrapper around fetch for the Deadline Tracker API.
//
// Authentication is cookie based (HTTP-only JWT cookie), so every request
// uses `credentials: "include"`. No tokens are read or stored here.

export const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export const isUnauthorized = (error) =>
  Boolean(error) && error.status === 401;

async function request(path, { method = "GET", body, signal } = {}) {
  let response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      headers:
        body !== undefined
          ? { "Content-Type": "application/json" }
          : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw error;
    }

    throw new ApiError(
      "Unable to reach the server. Check your connection and try again.",
      0
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      (data && data.message) ||
        "Something went wrong. Please try again.",
      response.status
    );
  }

  return data;
}

// ---- Tasks (existing V1 endpoints) ----

export const getTasks = ({ signal } = {}) =>
  request("/api/tasks", { signal });

// Same endpoint and payload shape that the V1 task form uses.
export const createTask = (task) =>
  request("/api/tasks", { method: "POST", body: task });

// ---- Clusters (Phase 1 endpoints) ----

export const getClusters = (type = "all", { signal } = {}) =>
  request(`/api/clusters?type=${encodeURIComponent(type)}`, { signal });

export const getCluster = (id, { signal } = {}) =>
  request(`/api/clusters/${encodeURIComponent(id)}`, { signal });

export const createCluster = ({ name, taskIds }) =>
  request("/api/clusters", {
    method: "POST",
    body: { name, taskIds },
  });

export const updateCluster = (id, payload) =>
  request(`/api/clusters/${encodeURIComponent(id)}`, {
    method: "PUT",
    body: payload,
  });

export const deleteCluster = (id) =>
  request(`/api/clusters/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

// ---- Cluster broadcasts (Phase 3) ----

export const createBroadcast = (clusterId, payload) =>
  request(`/api/clusters/${encodeURIComponent(clusterId)}/broadcast`, {
    method: "POST",
    body: payload,
  });

export const getBroadcasts = (query = "", { signal } = {}) =>
  request(`/api/broadcasts?q=${encodeURIComponent(query)}`, { signal });

export const getMyBroadcasts = ({ signal } = {}) =>
  request("/api/broadcasts/mine", { signal });

export const getBroadcast = (code, { signal } = {}) =>
  request(`/api/broadcasts/${encodeURIComponent(code)}`, { signal });

export const importBroadcast = (code, payload) =>
  request(`/api/broadcasts/${encodeURIComponent(code)}/import`, {
    method: "POST",
    body: payload,
  });

export const revokeBroadcast = (id) =>
  request(`/api/broadcasts/${encodeURIComponent(id)}/revoke`, { method: "POST" });
