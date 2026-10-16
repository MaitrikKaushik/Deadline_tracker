import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { describe, expect, test } from "vitest";

import App from "./App";
import {
  fail,
  makeCluster,
  makeTask,
  mockFetch,
  ok,
} from "./test/testUtils";

const user = { name: "Maitrik", email: "m@example.com" };

const baseRoutes = (tasks) => ({
  "GET /api/auth/me": ok({ user }),
  "GET /api/tasks": () => ok(tasks),
});

describe("App (V1 behaviour and cluster navigation)", () => {
  test("V1 task view still works: welcome, task form, task list and count", async () => {
    mockFetch(baseRoutes([makeTask({ _id: "t1", title: "Finish DSA" })]));

    render(<App />);

    expect(await screen.findByText("Welcome, Maitrik")).toBeTruthy();
    expect(await screen.findByText("Finish DSA")).toBeTruthy();
    expect(screen.getByText("Add a Task")).toBeTruthy();
    expect(screen.getByText("Your Tasks")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Logout" })).toBeTruthy();

    // Task actions on the main list are unchanged.
    expect(screen.getByRole("button", { name: "Complete" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy();
  });

  test("V1 task creation still posts to /api/tasks and updates the list", async () => {
    const tasks = [];

    const { callsTo } = mockFetch({
      "GET /api/auth/me": ok({ user }),
      "GET /api/tasks": () => ok([...tasks]),
      "POST /api/tasks": ({ body }) => {
        const task = makeTask({ _id: "n1", ...body });
        tasks.push(task);

        return ok(task, 201);
      },
    });

    const { container } = render(<App />);

    await screen.findByText("Welcome, Maitrik");

    fireEvent.change(
      screen.getByPlaceholderText("e.g. Complete DSA assignment"),
      { target: { name: "title", value: "Brand new task" } }
    );
    fireEvent.change(container.querySelector('input[name="deadline"]'), {
      target: { name: "deadline", value: "2026-12-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Task" }));

    expect(await screen.findByText("Brand new task")).toBeTruthy();
    expect(callsTo("POST", "/api/tasks")).toHaveLength(1);
  });

  test("the navbar opens Show Clusters and Create Cluster", async () => {
    mockFetch({
      ...baseRoutes([]),
      "GET /api/clusters?type=all": ok([
        makeCluster({ _id: "c1", name: "Semester Plan" }),
      ]),
    });

    render(<App />);

    await screen.findByText("Welcome, Maitrik");

    fireEvent.click(screen.getByRole("button", { name: "Clusters" }));
    fireEvent.click(screen.getByRole("link", { name: "Show Clusters" }));

    expect(await screen.findByText("Semester Plan")).toBeTruthy();
    // The V1 task form is not shown on the clusters page.
    expect(screen.queryByText("Add a Task")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Clusters" }));
    // The clusters page also has its own "Create Cluster" button, so use
    // the one inside the navbar here.
    fireEvent.click(
      within(
        screen.getByRole("navigation", { name: "Main navigation" })
      ).getByRole("link", { name: "Create Cluster" })
    );

    expect(await screen.findByLabelText("Cluster name")).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "Tasks" }));

    expect(await screen.findByText("Add a Task")).toBeTruthy();
  });

  test("deep links work: opening #/clusters/:id loads that cluster", async () => {
    window.location.hash = "#/clusters/c1";

    mockFetch({
      ...baseRoutes([]),
      "GET /api/clusters/c1": ok(
        makeCluster({ _id: "c1", name: "Deep Linked", tasks: [] })
      ),
    });

    render(<App />);

    expect(
      await screen.findByRole("heading", { name: "Deep Linked" })
    ).toBeTruthy();
  });

  test("creating a cluster shows a success banner on the new cluster's page", async () => {
    window.location.hash = "#/clusters/new";

    mockFetch({
      ...baseRoutes([]),
      "POST /api/clusters": ok(
        { _id: "c8", name: "Banner Test", tasks: [] },
        201
      ),
      "GET /api/clusters/c8": ok(
        makeCluster({ _id: "c8", name: "Banner Test", tasks: [] })
      ),
    });

    render(<App />);

    fireEvent.change(await screen.findByLabelText("Cluster name"), {
      target: { value: "Banner Test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Cluster" }));

    expect(
      await screen.findByRole("heading", { name: "Banner Test" })
    ).toBeTruthy();
    expect(
      screen.getByText('Cluster "Banner Test" created.')
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss message" }));

    expect(screen.queryByText('Cluster "Banner Test" created.')).toBeNull();
  });

  test("tasks created inside the cluster workflow refresh the main task list and counter", async () => {
    window.location.hash = "#/clusters/new";

    const tasks = [];

    const { callsTo } = mockFetch({
      "GET /api/auth/me": ok({ user }),
      "GET /api/tasks": () => ok([...tasks]),
      "POST /api/tasks": ({ body }) => {
        const task = makeTask({ _id: "n1", ...body });
        tasks.push(task);

        return ok(task, 201);
      },
    });

    const { container } = render(<App />);

    await screen.findByLabelText("Cluster name");

    // App (header counter) and the workflow (fresh list) each load tasks.
    await waitFor(() =>
      expect(callsTo("GET", "/api/tasks").length).toBeGreaterThanOrEqual(1)
    );
    const loadsBefore = callsTo("GET", "/api/tasks").length;

    fireEvent.change(
      screen.getByPlaceholderText("e.g. Complete DSA assignment"),
      { target: { name: "title", value: "From cluster flow" } }
    );
    fireEvent.change(container.querySelector('input[name="deadline"]'), {
      target: { name: "deadline", value: "2026-12-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Task" }));

    await screen.findByText("New deadlines in this cluster");

    // App re-fetches after the task is created...
    await waitFor(() =>
      expect(callsTo("GET", "/api/tasks").length).toBeGreaterThan(loadsBefore)
    );

    // ...so the header counter reflects the new task.
    await waitFor(() =>
      expect(document.querySelector(".task-count span").textContent).toBe("1")
    );
  });

  test("an expired session on a cluster page returns to the login screen", async () => {
    window.location.hash = "#/clusters";

    mockFetch({
      ...baseRoutes([]),
      "GET /api/clusters?type=all": fail(401, "Not authenticated"),
    });

    render(<App />);

    expect(
      await screen.findByText(/Sign in to manage your deadlines/)
    ).toBeTruthy();
    expect(screen.queryByText("Welcome, Maitrik")).toBeNull();
  });

  test("a logged-out visitor sees the login screen, not the clusters", async () => {
    window.location.hash = "#/clusters";

    mockFetch({ "GET /api/auth/me": fail(401, "Not authenticated") });

    render(<App />);

    expect(
      await screen.findByText(/Sign in to manage your deadlines/)
    ).toBeTruthy();
    expect(screen.queryByText("Your Clusters")).toBeNull();
  });
});
