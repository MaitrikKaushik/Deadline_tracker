import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import {
  fail,
  makeTask,
  mockFetch,
  ok,
} from "../test/testUtils";
import CreateCluster from "./CreateCluster";

const existing = [
  makeTask({ _id: "a", title: "Alpha" }),
  makeTask({ _id: "b", title: "Beta", priority: "high" }),
];

const renderPage = () => {
  const handlers = {
    onNotify: vi.fn(),
    onSessionExpired: vi.fn(),
    onTasksChanged: vi.fn(),
  };

  const view = render(<CreateCluster {...handlers} />);

  return { ...handlers, ...view };
};

const nameInput = () => screen.getByLabelText("Cluster name");
const createButton = () =>
  screen.getByRole("button", { name: /^(Create Cluster|Creating\.\.\.)$/ });
const typeName = (value) =>
  fireEvent.change(nameInput(), { target: { value } });

const chooseExisting = () =>
  fireEvent.click(
    screen.getByRole("radio", { name: /select existing deadlines/i })
  );
const chooseNew = () =>
  fireEvent.click(
    screen.getByRole("radio", { name: /create new deadlines/i })
  );

// Fills the real V1 TaskForm and submits it.
const addDeadline = (container, title, deadline = "2026-12-01") => {
  fireEvent.change(
    screen.getByPlaceholderText("e.g. Complete DSA assignment"),
    { target: { name: "title", value: title } }
  );
  fireEvent.change(container.querySelector('input[name="deadline"]'), {
    target: { name: "deadline", value: deadline },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add Task" }));
};

// POST /api/tasks handler that returns the created task with a stable ID.
const taskCreator = () => ({ body }) =>
  ok({ _id: `new-${body.title}`, ...body }, 201);

describe("Create Cluster: name validation", () => {
  test("blocks submission and explains each invalid name, without calling the API", async () => {
    const { calls } = mockFetch({ "GET /api/tasks": ok(existing) });

    renderPage();

    fireEvent.click(createButton());
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /required/i
    );

    typeName("     ");
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /only spaces/i
    );

    typeName("a".repeat(101));
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /100 characters/i
    );

    fireEvent.click(createButton());

    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(nameInput().getAttribute("aria-invalid")).toBe("true");
  });

  test("shows a live character counter", () => {
    mockFetch({ "GET /api/tasks": ok([]) });

    renderPage();

    typeName("  Hello  ");

    expect(screen.getByText("5/100")).toBeTruthy();
  });
});

describe("Create Cluster: existing deadlines", () => {
  test("submits a trimmed name and the selected task IDs, without creating tasks", async () => {
    const { callsTo } = mockFetch({
      "GET /api/tasks": ok(existing),
      "POST /api/clusters": ok({ _id: "c9", name: "My Group" }, 201),
    });

    const { onNotify } = renderPage();

    typeName("  My Group  ");
    chooseExisting();

    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Alpha" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beta" }));

    expect(screen.getByText("2 deadlines selected")).toBeTruthy();

    fireEvent.click(createButton());

    await waitFor(() =>
      expect(callsTo("POST", "/api/clusters")).toHaveLength(1)
    );

    expect(callsTo("POST", "/api/clusters")[0].body).toEqual({
      name: "My Group",
      taskIds: ["a", "b"],
    });
    expect(callsTo("POST", "/api/tasks")).toHaveLength(0);

    await waitFor(() => expect(window.location.hash).toBe("#/clusters/c9"));
    expect(onNotify).toHaveBeenCalledWith('Cluster "My Group" created.');
  });

  test("a deselected deadline is not submitted", async () => {
    const { callsTo } = mockFetch({
      "GET /api/tasks": ok(existing),
      "POST /api/clusters": ok({ _id: "c9", name: "G" }, 201),
    });

    renderPage();

    typeName("G");
    chooseExisting();

    const alpha = await screen.findByRole("checkbox", { name: "Select Alpha" });

    fireEvent.click(alpha);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Beta" }));
    fireEvent.click(alpha);

    expect(alpha.checked).toBe(false);

    fireEvent.click(createButton());

    await waitFor(() =>
      expect(callsTo("POST", "/api/clusters")).toHaveLength(1)
    );

    expect(callsTo("POST", "/api/clusters")[0].body.taskIds).toEqual(["b"]);
  });

  test("an empty selection creates an empty cluster with taskIds: []", async () => {
    const { callsTo } = mockFetch({
      "GET /api/tasks": ok(existing),
      "POST /api/clusters": ok({ _id: "c1", name: "Empty" }, 201),
    });

    renderPage();

    typeName("Empty");

    expect(
      screen.getByText(/No deadlines selected yet.*add deadlines later/i)
    ).toBeTruthy();

    fireEvent.click(createButton());

    await waitFor(() =>
      expect(callsTo("POST", "/api/clusters")).toHaveLength(1)
    );

    expect(callsTo("POST", "/api/clusters")[0].body).toEqual({
      name: "Empty",
      taskIds: [],
    });
  });

  test("keeps the name and selection when switching between the two options", async () => {
    mockFetch({ "GET /api/tasks": ok(existing) });

    renderPage();

    typeName("Keep me");
    chooseExisting();

    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Alpha" }));

    chooseNew();
    expect(screen.getByPlaceholderText("e.g. Complete DSA assignment")).toBeTruthy();

    chooseExisting();

    expect(
      (await screen.findByRole("checkbox", { name: "Select Alpha" })).checked
    ).toBe(true);
    expect(nameInput().value).toBe("Keep me");
  });

  test("shows an empty state when the user has no deadlines", async () => {
    mockFetch({ "GET /api/tasks": ok([]) });

    renderPage();

    chooseExisting();

    expect(
      await screen.findByText("No existing deadlines to select")
    ).toBeTruthy();
  });

  test("shows a deadline-loading error and can retry", async () => {
    let attempts = 0;

    mockFetch({
      "GET /api/tasks": () => {
        attempts += 1;

        return attempts === 1 ? fail(500, "Failed to fetch tasks") : ok(existing);
      },
    });

    renderPage();

    chooseExisting();

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Failed to fetch tasks/
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("checkbox", { name: "Select Alpha" })).toBeTruthy();
  });

  test("surfaces the server's rejection of someone else's task instead of a false success", async () => {
    mockFetch({
      "GET /api/tasks": ok(existing),
      "POST /api/clusters": fail(403, "One or more tasks do not belong to you"),
    });

    const { onNotify } = renderPage();

    typeName("Nope");
    chooseExisting();

    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Alpha" }));
    fireEvent.click(createButton());

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /do not belong to you/
    );
    expect(onNotify).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");
    expect(createButton().disabled).toBe(false);
  });
});

describe("Create Cluster: new deadlines (existing task form and API)", () => {
  test("creates tasks through POST /api/tasks with the V1 payload, then one cluster with their IDs", async () => {
    const { callsTo } = mockFetch({
      "GET /api/tasks": ok(existing),
      "POST /api/tasks": taskCreator(),
      "POST /api/clusters": ok({ _id: "c5", name: "Fresh" }, 201),
    });

    const { onTasksChanged, container } = renderPage();

    typeName("Fresh");

    addDeadline(container, "Write report");

    expect(await screen.findByText("New deadlines in this cluster")).toBeTruthy();

    addDeadline(container, "Submit form", "2026-12-05");

    await waitFor(() =>
      expect(callsTo("POST", "/api/tasks")).toHaveLength(2)
    );

    // Same fields the V1 form submits.
    expect(callsTo("POST", "/api/tasks")[0].body).toEqual({
      title: "Write report",
      description: "",
      deadline: "2026-12-01",
      priority: "medium",
      deadlineType: "general",
      referenceLink: "",
      reminderEnabled: true,
    });
    expect(callsTo("POST", "/api/tasks")[0].options.credentials).toBe("include");

    await screen.findByText("Submit form");
    expect(onTasksChanged).toHaveBeenCalledTimes(2);
    expect(screen.getByText(/2 deadlines will be added \(2 new, 0 existing\)/)).toBeTruthy();

    fireEvent.click(createButton());

    await waitFor(() =>
      expect(callsTo("POST", "/api/clusters")).toHaveLength(1)
    );

    expect(callsTo("POST", "/api/clusters")[0].body).toEqual({
      name: "Fresh",
      taskIds: ["new-Write report", "new-Submit form"],
    });
    expect(callsTo("POST", "/api/tasks")).toHaveLength(2);
  });

  test("the form is reset after each deadline so a new one can be entered", async () => {
    mockFetch({
      "GET /api/tasks": ok([]),
      "POST /api/tasks": taskCreator(),
    });

    const { container } = renderPage();

    addDeadline(container, "First");

    await screen.findByText("New deadlines in this cluster");

    expect(
      screen.getByPlaceholderText("e.g. Complete DSA assignment").value
    ).toBe("");
  });

  test("combines new and existing deadlines without duplicates", async () => {
    const { callsTo } = mockFetch({
      "GET /api/tasks": ok(existing),
      "POST /api/tasks": taskCreator(),
      "POST /api/clusters": ok({ _id: "c2", name: "Mix" }, 201),
    });

    const { container } = renderPage();

    typeName("Mix");
    addDeadline(container, "Brand new");
    await screen.findByText("New deadlines in this cluster");

    chooseExisting();

    fireEvent.click(await screen.findByRole("checkbox", { name: "Select Alpha" }));
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));

    fireEvent.click(createButton());

    await waitFor(() =>
      expect(callsTo("POST", "/api/clusters")).toHaveLength(1)
    );

    expect(callsTo("POST", "/api/clusters")[0].body.taskIds).toEqual([
      "new-Brand new",
      "a",
      "b",
    ]);
  });

  test("a failed task creation shows the error and adds nothing to the cluster", async () => {
    const { callsTo } = mockFetch({
      "GET /api/tasks": ok([]),
      "POST /api/tasks": fail(400, "Invalid deadline"),
    });

    const { container } = renderPage();

    addDeadline(container, "Broken");

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Invalid deadline/
    );

    expect(screen.queryByText("New deadlines in this cluster")).toBeNull();
    expect(callsTo("POST", "/api/clusters")).toHaveLength(0);
    // What the user typed is kept so they can correct it.
    expect(
      screen.getByPlaceholderText("e.g. Complete DSA assignment").value
    ).toBe("Broken");
  });

  test("a failed cluster save keeps the created tasks and a retry does not duplicate them", async () => {
    let clusterAttempts = 0;

    const { callsTo } = mockFetch({
      "GET /api/tasks": ok([]),
      "POST /api/tasks": taskCreator(),
      "POST /api/clusters": () => {
        clusterAttempts += 1;

        return clusterAttempts === 1
          ? fail(500, "Failed to create cluster")
          : ok({ _id: "c7", name: "Retry" }, 201);
      },
    });

    const { onNotify, container } = renderPage();

    typeName("Retry");
    addDeadline(container, "Only once");
    await screen.findByText("New deadlines in this cluster");

    fireEvent.click(createButton());

    expect((await screen.findByRole("alert")).textContent).toMatch(
      /Failed to create cluster/
    );
    expect(onNotify).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("");

    fireEvent.click(createButton());

    await waitFor(() => expect(window.location.hash).toBe("#/clusters/c7"));

    expect(callsTo("POST", "/api/tasks")).toHaveLength(1);
    expect(callsTo("POST", "/api/clusters")).toHaveLength(2);
    expect(callsTo("POST", "/api/clusters")[1].body.taskIds).toEqual([
      "new-Only once",
    ]);
    expect(onNotify).toHaveBeenCalledTimes(1);
  });

  test("a deadline can be removed from the cluster without being deleted", async () => {
    const { callsTo } = mockFetch({
      "GET /api/tasks": ok([]),
      "POST /api/tasks": taskCreator(),
      "POST /api/clusters": ok({ _id: "c3", name: "Rm" }, 201),
    });

    const { container } = renderPage();

    typeName("Rm");
    addDeadline(container, "Keep");
    await screen.findByText("New deadlines in this cluster");
    addDeadline(container, "Drop");
    await screen.findByRole("button", { name: "Remove Drop from cluster" });

    fireEvent.click(
      screen.getByRole("button", { name: "Remove Drop from cluster" })
    );

    fireEvent.click(createButton());

    await waitFor(() =>
      expect(callsTo("POST", "/api/clusters")).toHaveLength(1)
    );

    expect(callsTo("POST", "/api/clusters")[0].body.taskIds).toEqual([
      "new-Keep",
    ]);
    expect(callsTo("DELETE", "/api/tasks/new-Drop")).toHaveLength(0);
  });
});

describe("Create Cluster: submission safety", () => {
  test("prevents duplicate submissions while a request is in progress", async () => {
    let release;

    const { callsTo } = mockFetch({
      "GET /api/tasks": ok([]),
      "POST /api/clusters": () =>
        new Promise((resolve) => {
          release = () => resolve(ok({ _id: "c4", name: "Slow" }, 201));
        }),
    });

    renderPage();

    typeName("Slow");

    fireEvent.click(createButton());
    fireEvent.click(createButton());
    fireEvent.click(createButton());

    await waitFor(() => expect(createButton().disabled).toBe(true));

    expect(createButton().textContent).toBe("Creating...");
    expect(callsTo("POST", "/api/clusters")).toHaveLength(1);

    release();

    await waitFor(() => expect(window.location.hash).toBe("#/clusters/c4"));
    expect(callsTo("POST", "/api/clusters")).toHaveLength(1);
  });

  test("an expired session is reported to the app instead of a generic error", async () => {
    mockFetch({
      "GET /api/tasks": ok([]),
      "POST /api/clusters": fail(401, "Not authenticated"),
    });

    const { onSessionExpired, onNotify } = renderPage();

    typeName("Whoops");
    fireEvent.click(createButton());

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
    expect(onNotify).not.toHaveBeenCalled();
  });
});
