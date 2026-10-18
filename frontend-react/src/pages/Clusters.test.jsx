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
import Clusters from "./Clusters";

const mine = makeCluster({
  _id: "m1",
  name: "Exam Prep",
  tasks: [makeTask({ _id: "t1" }), makeTask({ _id: "t2" })],
});

const imported = makeCluster({
  _id: "i1",
  name: "Shared Syllabus",
  origin: "imported",
  tasks: [makeTask({ _id: "t3" })],
});

const renderPage = (props = {}) => {
  const handlers = {
    onNotify: vi.fn(),
    onSessionExpired: vi.fn(),
    ...props,
  };

  render(<Clusters {...handlers} />);

  return handlers;
};

describe("Clusters page", () => {
  test("shows a loading state, then the cluster cards", async () => {
    mockFetch({ "GET /api/clusters?type=all": ok([mine, imported]) });

    renderPage();

    expect(screen.getByText("Loading clusters...")).toBeTruthy();

    expect(await screen.findByText("Exam Prep")).toBeTruthy();
    expect(screen.getByText("Shared Syllabus")).toBeTruthy();
    expect(screen.queryByText("Loading clusters...")).toBeNull();
  });

  test("each card shows count, origin and a link to the cluster", async () => {
    mockFetch({ "GET /api/clusters?type=all": ok([mine, imported]) });

    renderPage();

    await screen.findByText("Exam Prep");

    expect(screen.getByText("2 deadlines")).toBeTruthy();
    expect(screen.getByText("1 deadline")).toBeTruthy();
    expect(screen.getByText("Created by you")).toBeTruthy();
    expect(screen.getAllByText("Imported").length).toBeGreaterThan(0);

    expect(
      screen.getByRole("link", { name: "Open Exam Prep" }).getAttribute("href")
    ).toBe("#/clusters/m1");
  });

  test("the three filters request the matching API type and show its data", async () => {
    const { callsTo } = mockFetch({
      "GET /api/clusters?type=all": ok([mine, imported]),
      "GET /api/clusters?type=mine": ok([mine]),
      "GET /api/clusters?type=imported": ok([imported]),
    });

    renderPage();

    await screen.findByText("Exam Prep");
    expect(callsTo("GET", "/api/clusters?type=all")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "My Clusters" }));

    await waitFor(() =>
      expect(screen.queryByText("Shared Syllabus")).toBeNull()
    );
    expect(screen.getByText("Exam Prep")).toBeTruthy();
    expect(callsTo("GET", "/api/clusters?type=mine")).toHaveLength(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Imported Clusters" })
    );

    await screen.findByText("Shared Syllabus");
    expect(screen.queryByText("Exam Prep")).toBeNull();
    expect(callsTo("GET", "/api/clusters?type=imported")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "All Clusters" }));

    await screen.findByText("Exam Prep");
    expect(screen.getByText("Shared Syllabus")).toBeTruthy();
  });

  test("marks the active filter with aria-pressed", async () => {
    mockFetch({
      "GET /api/clusters?type=all": ok([]),
      "GET /api/clusters?type=mine": ok([]),
    });

    renderPage();

    const all = screen.getByRole("button", { name: "All Clusters" });
    const minePill = screen.getByRole("button", { name: "My Clusters" });

    expect(all.getAttribute("aria-pressed")).toBe("true");
    expect(minePill.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(minePill);

    expect(minePill.getAttribute("aria-pressed")).toBe("true");
    expect(all.getAttribute("aria-pressed")).toBe("false");
  });

  test("shows an empty state with a create link, and none for imported", async () => {
    mockFetch({
      "GET /api/clusters?type=all": ok([]),
      "GET /api/clusters?type=imported": ok([]),
    });

    renderPage();

    expect(await screen.findByText("No clusters yet")).toBeTruthy();
    expect(
      screen
        .getAllByRole("link", { name: "Create Cluster" })
        .some((link) => link.getAttribute("href") === "#/clusters/new")
    ).toBe(true);

    fireEvent.click(
      screen.getByRole("button", { name: "Imported Clusters" })
    );

    expect(await screen.findByText("No imported clusters")).toBeTruthy();
  });

  test("shows an API error and can retry", async () => {
    let attempts = 0;

    mockFetch({
      "GET /api/clusters?type=all": () => {
        attempts += 1;

        return attempts === 1
          ? fail(500, "Failed to fetch clusters")
          : ok([mine]);
      },
    });

    renderPage();

    const alert = await screen.findByRole("alert");

    expect(alert.textContent).toMatch(/Failed to fetch clusters/);

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Exam Prep")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("an expired session is reported to the app", async () => {
    mockFetch({
      "GET /api/clusters?type=all": fail(401, "Not authenticated"),
    });

    const { onSessionExpired } = renderPage();

    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledTimes(1));
  });

  test("imported clusters expose no delete action; created ones do", async () => {
    mockFetch({ "GET /api/clusters?type=all": ok([mine, imported]) });

    renderPage();

    await screen.findByText("Exam Prep");

    expect(screen.getByRole("button", { name: "Delete Exam Prep" })).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Delete Shared Syllabus" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /edit/i })).toBeNull();
  });

  test("deleting asks for confirmation, calls the API and updates the list", async () => {
    const { callsTo } = mockFetch({
      "GET /api/clusters?type=all": ok([mine, imported]),
      "DELETE /api/clusters/m1": ok({ message: "Cluster deleted successfully" }),
    });

    const { onNotify } = renderPage();

    await screen.findByText("Exam Prep");

    fireEvent.click(screen.getByRole("button", { name: "Delete Exam Prep" }));

    const dialog = screen.getByRole("alertdialog");

    expect(dialog.textContent).toMatch(/will not.*be deleted/i);
    expect(callsTo("DELETE", "/api/clusters/m1")).toHaveLength(0);

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete Cluster" })
    );

    await waitFor(() => expect(screen.queryByText("Exam Prep")).toBeNull());

    expect(callsTo("DELETE", "/api/clusters/m1")).toHaveLength(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Shared Syllabus")).toBeTruthy();
    expect(onNotify).toHaveBeenCalledWith(
      expect.stringMatching(/Exam Prep.*deleted.*deadlines were not deleted/)
    );
  });

  test("cancelling the confirmation does not delete anything", async () => {
    const { callsTo } = mockFetch({
      "GET /api/clusters?type=all": ok([mine]),
    });

    renderPage();

    await screen.findByText("Exam Prep");

    fireEvent.click(screen.getByRole("button", { name: "Delete Exam Prep" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(callsTo("DELETE", "/api/clusters/m1")).toHaveLength(0);
    expect(screen.getByText("Exam Prep")).toBeTruthy();
  });

  test("a failed delete keeps the cluster, shows the error and reports no success", async () => {
    mockFetch({
      "GET /api/clusters?type=all": ok([mine]),
      "DELETE /api/clusters/m1": fail(500, "Failed to delete cluster"),
    });

    const { onNotify } = renderPage();

    await screen.findByText("Exam Prep");

    fireEvent.click(screen.getByRole("button", { name: "Delete Exam Prep" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete Cluster" }));

    const dialog = screen.getByRole("alertdialog");

    expect(
      await within(dialog).findByText("Failed to delete cluster")
    ).toBeTruthy();

    // The cluster is still listed (its card link is unique on the page).
    expect(screen.getByRole("link", { name: "Open Exam Prep" })).toBeTruthy();
    expect(onNotify).not.toHaveBeenCalled();
  });
});
