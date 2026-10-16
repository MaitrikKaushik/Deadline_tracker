import { vi } from "vitest";

import { API_URL } from "../services/api";

export const makeTask = (overrides = {}) => ({
  _id: "task-1",
  title: "Task One",
  description: "",
  deadline: "2026-12-01T00:00:00.000Z",
  priority: "medium",
  status: "pending",
  deadlineType: "general",
  referenceLink: "",
  reminderEnabled: true,
  ...overrides,
});

export const makeCluster = (overrides = {}) => ({
  _id: "cluster-1",
  name: "Cluster One",
  ownerId: "user-1",
  origin: "created",
  tasks: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  ...overrides,
});

export const ok = (body, status = 200) => ({ status, body });
export const fail = (status, message) => ({ status, body: { message } });

// Installs a fake fetch. `routes` maps "METHOD /path?query" to a response
// object or to a function ({ body, calls }) => response. Every request is
// recorded in `calls` so tests can assert URLs, bodies and credentials.
export function mockFetch(routes) {
  const calls = [];

  const fetchMock = vi.fn(async (url, options = {}) => {
    const method = (options.method || "GET").toUpperCase();
    const path = String(url).replace(API_URL, "");
    const body = options.body ? JSON.parse(options.body) : undefined;

    calls.push({ method, path, body, options });

    const handler = routes[`${method} ${path}`];

    // Handlers may return a promise, which lets tests hold a request
    // "in flight" and release it later.
    const result = await (handler
      ? typeof handler === "function"
        ? handler({ body, calls })
        : handler
      : fail(599, `Unmocked request: ${method} ${path}`));

    return {
      ok: result.status < 400,
      status: result.status,
      json: async () => result.body,
    };
  });

  vi.stubGlobal("fetch", fetchMock);

  return {
    calls,
    callsTo: (method, path) =>
      calls.filter((c) => c.method === method && c.path === path),
  };
}
