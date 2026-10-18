import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  fail,
  makeCluster,
  makeTask,
  mockFetch,
  ok,
} from "../test/testUtils";
import ClusterDetails from "./ClusterDetails";

const t1 = makeTask({ _id: "t1", title: "Alpha", deadline: "2026-12-05T00:00:00.000Z" });
const t2 = makeTask({ _id: "t2", title: "Beta", deadline: "2026-12-01T00:00:00.000Z" });
const t3 = makeTask({ _id: "t3", title: "Gamma" });

const created = makeCluster({ _id: "c1", name: "Finals", tasks: [t1, t2] });
const imported = makeCluster({
  _id: "i1",
  name: "Shared",
  origin: "imported",
  tasks: [t1],
});

const renderPage = (clusterId) => {
  const handlers = {
    onNotify: vi.fn(),
    onSessionExpired: vi.fn(),
  };

  render(<ClusterDetails clusterId={clusterId} {...handlers} />);

  return handlers;
};

const startEdit = async () => {
  fireEvent.click(await screen.findByRole("button", { name: "Edit Cluster" }));
};

describe("Cluster details: viewing", () => {
  test("shows the cluster and its deadlines in deadline order, using the task cards", async () => {
    const { callsTo } = mockFetch({ "GET /api/clusters/c1": ok(created) });

    renderPage("c1");

    expect(screen.getByText("Loading cluster...")).toBeTruthy();

    expect(await screen.findByRole("heading", { name: "Finals" })).toBeTruthy();
    expect(callsTo("GET", "/api/clusters/c1")[0].options.credentials).toBe("include");
    expect(screen.getByText("2 deadlines")).toBeTruthy();
    expect(screen.getByText("Created by you")).toBeTruthy();

    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent)
      .filter((text) => ["Alpha", "Beta"].includes(text));

    expect(titles).toEqual(["Beta", "Alpha"]);
  });

  test("publishes only the selected deadlines and displays a share link", async () => {
    const { calls } = mockFetch({
      "GET /api/clusters/c1": ok(created),
      "POST /api/clusters/c1/broadcast": ok({ _id: "b1", code: "A1B2C3D4E5", name: "Finals", tasks: [t1] }, 201),
    });
    const { onNotify } = renderPage("c1");
    await screen.findByRole("heading", { name: "Finals" });
    fireEvent.click(screen.getByRole("button", { name: "Share Cluster" }));

    const betaCheckbox = screen.getByRole("checkbox", { name: /Beta/ });
    expect(betaCheckbox.checked).toBe(true);
    fireEvent.click(betaCheckbox);
    fireEvent.change(screen.getByLabelText(/Optional note/), { target: { value: "Study group" } });
    fireEvent.click(screen.getByRole("button", { name: "Create share link" }));

    await screen.findByLabelText("Share link");
    const call = calls.find((item) => item.method === "POST");
    expect(call.body).toEqual({ taskIds: ["t1"], description: "Study group" });
    expect(screen.getByLabelText("Share code").value).toBe("A1B2C3D4E5");
    expect(onNotify).toHaveBeenCalledWith("Share link created. Only the selected deadlines are included.");
  });

  test("task cards inside a cluster are read-only (no task actions)", async () => {
    mockFetch({ "GET /api/clusters/c1": ok(created) });

    renderPage("c1");

    await screen.findByText("Alpha");

    expect(screen.queryByRole("button", { name: "Complete" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeTruthy(); // cluster-level delete only
    expect(document.querySelectorAll(".task-actions")).toHaveLength(0);
  });

  test("an empty cluster shows an empty state", async () => {
    mockFetch({
      "GET /api/clusters/c1": ok(makeCluster({ _id: "c1", tasks: [] })),
    });

    renderPage("c1");

    expect(await screen.findByText("No deadlines in this cluster")).toBeTruthy();
  });

  test("imported clusters are clearly marked and have no edit or delete actions", async () => {
    mockFetch({ "GET /api/clusters/i1": ok(imported) });

    renderPage("i1");

    expect(await screen.findByRole("heading", { name: "Shared" })).toBeTruthy();
    expect(screen.getByText(/imported cluster, so it is view-only/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Cluster" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(screen.getByText("Alpha")).toBeTruthy();
  });

  test("shows the API error for a missing cluster, with a way back", async () => {
    mockFetch({ "GET /api/clusters/nope": fail(404, "Cluster not found") });

    renderPage("nope");

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Cluster not found/
    );
    expect(
      screen.getByRole("link", { name: /back to clusters/i }).getAttribute("href")
    ).toBe("#/clusters");
  });

  test("an expired session is reported to the app", async () => {
    mockFetch({ "GET /api/clusters/c1": fail(401, "Not authenticated") });

    const { onSessionExpired } = renderPage("c1");

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });
});

describe("Cluster details: editing", () => {
  test("renames the cluster and changes membership with one PUT, then shows the result", async () => {
    const updated = makeCluster({ _id: "c1", name: "Renamed", tasks: [t2, t3] });

    const { callsTo } = mockFetch({
      "GET /api/clusters/c1": ok(created),
      "GET /api/tasks": ok([t1, t2, t3]),
      "PUT /api/clusters/c1": ok(updated),
    });

    const { onNotify } = renderPage("c1");

    await startEdit();

    // Current members start checked.
    expect((await screen.findByRole("checkbox", { name: "Select Alpha" })).checked).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Select Beta" }).checked).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Select Gamma" }).checked).toBe(false);

    fireEvent.change(screen.getByLabelText("Cluster name"), {
      target: { value: "  Renamed  " },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Gamma" }));

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect(await screen.findByRole("heading", { name: "Renamed" })).toBeTruthy();

    expect(callsTo("PUT", "/api/clusters/c1")).toHaveLength(1);
    expect(callsTo("PUT", "/api/clusters/c1")[0].body).toEqual({
      name: "Renamed",
      taskIds: ["t2", "t3"],
    });
    expect(onNotify).toHaveBeenCalledWith("Cluster updated. Shared recipients will be asked before the rename is applied.");
    expect(screen.queryByRole("button", { name: "Save Changes" })).toBeNull();
  });

  test("rejects an invalid name locally without calling the API", async () => {
    const { callsTo } = mockFetch({
      "GET /api/clusters/c1": ok(created),
      "GET /api/tasks": ok([t1, t2]),
    });

    renderPage("c1");

    await startEdit();

    fireEvent.change(screen.getByLabelText("Cluster name"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(/only spaces/i);
    expect(callsTo("PUT", "/api/clusters/c1")).toHaveLength(0);
  });

  test("a failed save keeps the editor open, shows the error and reports no success", async () => {
    mockFetch({
      "GET /api/clusters/c1": ok(created),
      "GET /api/tasks": ok([t1, t2]),
      "PUT /api/clusters/c1": fail(403, "One or more tasks do not belong to you"),
    });

    const { onNotify } = renderPage("c1");

    await startEdit();
    await screen.findByRole("checkbox", { name: "Select Alpha" });

    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /do not belong to you/
    );
    expect(screen.getByRole("button", { name: "Save Changes" })).toBeTruthy();
    expect(onNotify).not.toHaveBeenCalled();
  });

  test("if deadlines cannot be loaded, renaming still works and never sends taskIds", async () => {
    const { callsTo } = mockFetch({
      "GET /api/clusters/c1": ok(created),
      "GET /api/tasks": fail(500, "Failed to fetch tasks"),
      "PUT /api/clusters/c1": ok(makeCluster({ _id: "c1", name: "Only name", tasks: [t1, t2] })),
    });

    renderPage("c1");

    await startEdit();

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Failed to fetch tasks/
    );

    fireEvent.change(screen.getByLabelText("Cluster name"), {
      target: { value: "Only name" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));

    await screen.findByRole("heading", { name: "Only name" });

    expect(callsTo("PUT", "/api/clusters/c1")[0].body).toEqual({
      name: "Only name",
    });
  });

  test("cancelling discards the changes", async () => {
    const { callsTo } = mockFetch({
      "GET /api/clusters/c1": ok(created),
      "GET /api/tasks": ok([t1, t2]),
    });

    renderPage("c1");

    await startEdit();

    fireEvent.change(screen.getByLabelText("Cluster name"), {
      target: { value: "Discarded" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: "Finals" })).toBeTruthy();
    expect(callsTo("PUT", "/api/clusters/c1")).toHaveLength(0);
  });

  test("prevents duplicate saves while a request is in progress", async () => {
    let release;

    const { callsTo } = mockFetch({
      "GET /api/clusters/c1": ok(created),
      "GET /api/tasks": ok([t1, t2]),
      "PUT /api/clusters/c1": () =>
        new Promise((resolve) => {
          release = () => resolve(ok(created));
        }),
    });

    renderPage("c1");

    await startEdit();
    await screen.findByRole("checkbox", { name: "Select Alpha" });

    const save = screen.getByRole("button", { name: "Save Changes" });

    fireEvent.click(save);
    fireEvent.click(save);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Saving..." }).disabled).toBe(true)
    );

    expect(callsTo("PUT", "/api/clusters/c1")).toHaveLength(1);

    release();
    await screen.findByRole("heading", { name: "Finals" });
  });
});

describe("Cluster details: deleting", () => {
  test("asks for confirmation, says tasks are kept, deletes and returns to the list", async () => {
    const { callsTo } = mockFetch({
      "GET /api/clusters/c1": ok(created),
      "DELETE /api/clusters/c1": ok({ message: "Cluster deleted successfully" }),
    });

    const { onNotify } = renderPage("c1");

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    const dialog = screen.getByRole("alertdialog");

    expect(dialog.textContent).toMatch(/2 deadlines will not be deleted/i);
    expect(callsTo("DELETE", "/api/clusters/c1")).toHaveLength(0);

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Cluster" }));

    await waitFor(() => expect(window.location.hash).toBe("#/clusters"));

    expect(callsTo("DELETE", "/api/clusters/c1")).toHaveLength(1);
    // Only the cluster is deleted; no task is touched.
    expect(callsTo("DELETE", "/api/tasks/t1")).toHaveLength(0);
    expect(onNotify).toHaveBeenCalledWith(
      expect.stringMatching(/Finals.*deleted.*deadlines were not deleted/)
    );
  });

  test("can explicitly remove imported copies when deleting the source cluster", async () => {
    const { callsTo } = mockFetch({
      "GET /api/clusters/c1": ok(created),
      "DELETE /api/clusters/c1": ok({ message: "Cluster and its imported copies deleted successfully" }),
    });

    renderPage("c1");
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(within(dialog).getByLabelText(/Remove imported copies too/i));
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete Cluster" }));

    await waitFor(() => expect(window.location.hash).toBe("#/clusters"));
    expect(callsTo("DELETE", "/api/clusters/c1")[0].body).toEqual({ removeImportedCopies: true });
  });

  test("a failed delete shows the error and does not navigate or report success", async () => {
    mockFetch({
      "GET /api/clusters/c1": ok(created),
      "DELETE /api/clusters/c1": fail(404, "Cluster not found or cannot be deleted through this endpoint"),
    });

    const { onNotify } = renderPage("c1");

    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Cluster" }));

    const dialog = screen.getByRole("alertdialog");

    expect(
      await within(dialog).findByText(/cannot be deleted through this endpoint/)
    ).toBeTruthy();

    expect(window.location.hash).toBe("");
    expect(onNotify).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Finals" })).toBeTruthy();
  });
});
