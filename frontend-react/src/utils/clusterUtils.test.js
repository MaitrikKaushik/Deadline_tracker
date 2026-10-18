import { describe, expect, test } from "vitest";

import {
  CLUSTER_NAME_MAX,
  parseRoute,
  sortTasks,
  taskIdsOf,
  uniqueIds,
  validateClusterName,
} from "./clusterUtils";

describe("validateClusterName", () => {
  test("accepts a normal name and a name of exactly 100 characters", () => {
    expect(validateClusterName("Exams")).toBe("");
    expect(validateClusterName("a".repeat(CLUSTER_NAME_MAX))).toBe("");
  });

  test("rejects empty, whitespace-only and non-string names", () => {
    expect(validateClusterName("")).toMatch(/required/i);
    expect(validateClusterName("    ")).toMatch(/only spaces/i);
    expect(validateClusterName(undefined)).toMatch(/required/i);
    expect(validateClusterName(42)).toMatch(/required/i);
  });

  test("measures length after trimming", () => {
    expect(validateClusterName(`  ${"a".repeat(100)}  `)).toBe("");
    expect(validateClusterName("a".repeat(101))).toMatch(/100 characters/);
  });
});

describe("uniqueIds / taskIdsOf", () => {
  test("removes duplicates and empty values, keeping order", () => {
    expect(uniqueIds(["b", "a", "b", "", null, "a", "c"])).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  test("reads IDs from populated documents and plain ID strings", () => {
    expect(
      taskIdsOf({ tasks: [{ _id: "x" }, "y", { _id: "x" }] })
    ).toEqual(["x", "y"]);
    expect(taskIdsOf({})).toEqual([]);
  });
});

describe("sortTasks", () => {
  test("orders by deadline, then priority, without mutating input", () => {
    const input = [
      { _id: "late", deadline: "2026-12-10", priority: "high" },
      { _id: "low", deadline: "2026-12-01", priority: "low" },
      { _id: "high", deadline: "2026-12-01", priority: "high" },
    ];

    expect(sortTasks(input).map((t) => t._id)).toEqual([
      "high",
      "low",
      "late",
    ]);
    expect(input[0]._id).toBe("late");
  });
});

describe("parseRoute", () => {
  test.each([
    ["", { name: "tasks" }],
    ["#/", { name: "tasks" }],
    ["#/unknown", { name: "tasks" }],
    ["#/clusters", { name: "clusters" }],
    ["#/clusters/", { name: "clusters" }],
    ["#/clusters/new", { name: "cluster-new" }],
    ["#/clusters/abc123", { name: "cluster-detail", id: "abc123" }],
    ["#/broadcasts", { name: "broadcasts" }],
    ["#/managed-updates", { name: "managed-updates" }],
    ["#/broadcasts/A1B2C3D4E5", { name: "broadcast-detail", code: "A1B2C3D4E5" }],
  ])("%s", (hash, expected) => {
    expect(parseRoute(hash)).toEqual(expected);
  });

  test("does not throw on a malformed encoded ID", () => {
    expect(parseRoute("#/clusters/%E0%A4%A")).toEqual({
      name: "cluster-detail",
      id: "%E0%A4%A",
    });
  });
});
