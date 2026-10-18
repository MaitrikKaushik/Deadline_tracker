import { describe, expect, test } from "vitest";

import { fail, mockFetch, ok } from "../test/testUtils";
import {
  ApiError,
  createBroadcast,
  getBroadcast,
  getBroadcasts,
  getMyBroadcasts,
  importBroadcast,
  revokeBroadcast,
  createCluster,
  createTask,
  deleteCluster,
  getClusters,
  isUnauthorized,
  updateCluster,
} from "./api";

describe("api client", () => {
  test("always sends credentials and uses the exact cluster endpoints", async () => {
    const { calls } = mockFetch({
      "GET /api/clusters?type=mine": ok([]),
      "POST /api/clusters": ok({ _id: "c" }, 201),
      "PUT /api/clusters/c1": ok({}),
      "DELETE /api/clusters/c1": ok({ message: "ok" }),
      "POST /api/tasks": ok({ _id: "t" }, 201),
    });

    await getClusters("mine");
    await createCluster({ name: "A", taskIds: ["t1"] });
    await updateCluster("c1", { name: "B" });
    await deleteCluster("c1");
    await createTask({ title: "T" });

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /api/clusters?type=mine",
      "POST /api/clusters",
      "PUT /api/clusters/c1",
      "DELETE /api/clusters/c1",
      "POST /api/tasks",
    ]);

    calls.forEach((call) =>
      expect(call.options.credentials).toBe("include")
    );

    expect(calls[1].body).toEqual({ name: "A", taskIds: ["t1"] });
  });


  test("uses the broadcast discovery, share, import, and revoke endpoints", async () => {
    const { calls } = mockFetch({
      "POST /api/clusters/c1/broadcast": ok({ code: "A1B2C3D4E5" }, 201),
      "GET /api/broadcasts?q=exam%20prep": ok([]),
      "GET /api/broadcasts/mine": ok([]),
      "GET /api/broadcasts/A1B2C3D4E5": ok({ code: "A1B2C3D4E5" }),
      "POST /api/broadcasts/A1B2C3D4E5/import": ok({ mode: "cluster" }, 201),
      "POST /api/broadcasts/b1/revoke": ok({ message: "revoked" }),
    });

    await createBroadcast("c1", { taskIds: ["t1"], description: "Note" });
    await getBroadcasts("exam prep");
    await getMyBroadcasts();
    await getBroadcast("A1B2C3D4E5");
    await importBroadcast("A1B2C3D4E5", { taskIds: ["t1"], mode: "cluster", reminderEnabled: false });
    await revokeBroadcast("b1");

    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      "POST /api/clusters/c1/broadcast",
      "GET /api/broadcasts?q=exam%20prep",
      "GET /api/broadcasts/mine",
      "GET /api/broadcasts/A1B2C3D4E5",
      "POST /api/broadcasts/A1B2C3D4E5/import",
      "POST /api/broadcasts/b1/revoke",
    ]);
    expect(calls[4].body).toEqual({ taskIds: ["t1"], mode: "cluster", reminderEnabled: false });
  });

  test("throws an ApiError carrying the server message and status", async () => {
    mockFetch({
      "GET /api/clusters?type=all": fail(400, "Invalid cluster type"),
    });

    await expect(getClusters("all")).rejects.toMatchObject({
      name: "ApiError",
      message: "Invalid cluster type",
      status: 400,
    });
  });

  test("detects an expired session", async () => {
    mockFetch({
      "GET /api/clusters?type=all": fail(401, "Not authenticated"),
    });

    const error = await getClusters("all").catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(isUnauthorized(error)).toBe(true);
    expect(isUnauthorized(new ApiError("x", 500))).toBe(false);
  });

  test("turns a network failure into a friendly error", async () => {
    globalThis.fetch = () => Promise.reject(new TypeError("offline"));

    const error = await getClusters("all").catch((e) => e);

    expect(error.status).toBe(0);
    expect(error.message).toMatch(/unable to reach the server/i);
  });
});
