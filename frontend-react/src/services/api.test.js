import { describe, expect, test } from "vitest";

import { fail, mockFetch, ok } from "../test/testUtils";
import {
  ApiError,
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
