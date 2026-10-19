import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { mockFetch, ok } from "../test/testUtils";
import Broadcasts from "./Broadcasts";

const broadcast = {
  _id: "broadcast-1",
  name: "Exam Prep",
  description: "Shared revision deadlines",
  code: "A1B2C3D4E5",
  createdAt: "2026-10-01T00:00:00.000Z",
  tasks: [
    { sourceTaskId: "task-1", title: "Algorithms Exam", deadline: "2026-12-01T00:00:00.000Z", priority: "high", description: "Revise graphs" },
    { sourceTaskId: "task-2", title: "DBMS Assignment", deadline: "2026-12-05T00:00:00.000Z", priority: "medium", description: "" },
  ],
};

afterEach(() => {
  window.location.hash = "";
});

describe("Broadcasts page", () => {
  test("searches shared clusters by name or code and links to the preview", async () => {
    mockFetch({ "GET /api/broadcasts?q=": ok([broadcast]) });
    render(<Broadcasts code={null} onNotify={vi.fn()} onSessionExpired={vi.fn()} />);

    expect(await screen.findByText("Exam Prep")).toBeTruthy();
    expect(screen.getByText("A1B2C3D4E5")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Preview & Import" }).getAttribute("href")).toBe("#/broadcasts/A1B2C3D4E5");
  });


  test("refreshes a share preview when the browser tab regains focus", async () => {
    const { callsTo } = mockFetch({
      "GET /api/broadcasts/A1B2C3D4E5": ok(broadcast),
    });
    render(<Broadcasts code="A1B2C3D4E5" onNotify={vi.fn()} onSessionExpired={vi.fn()} />);

    await screen.findByText("Algorithms Exam");
    const initialCalls = callsTo("GET", "/api/broadcasts/A1B2C3D4E5").length;
    fireEvent(window, new Event("focus"));

    await waitFor(() => {
      expect(callsTo("GET", "/api/broadcasts/A1B2C3D4E5").length).toBeGreaterThan(initialCalls);
    });
  });

  test("previews selected deadlines and imports only the checked tasks", async () => {
    const { calls } = mockFetch({
      "GET /api/broadcasts/A1B2C3D4E5": ok(broadcast),
      "POST /api/broadcasts/A1B2C3D4E5/import": ok({ mode: "cluster", cluster: { _id: "imported-cluster" }, tasks: [] }, 201),
    });
    const onNotify = vi.fn();
    render(<Broadcasts code="A1B2C3D4E5" onNotify={onNotify} onSessionExpired={vi.fn()} />);

    await screen.findByText("Algorithms Exam");
    const algorithms = screen.getByRole("checkbox", { name: /Algorithms Exam/ });
    const dbms = screen.getByRole("checkbox", { name: /DBMS Assignment/ });
    expect(algorithms.checked).toBe(true);
    expect(dbms.checked).toBe(true);
    fireEvent.click(dbms);
    fireEvent.click(screen.getByRole("button", { name: "Import selected deadlines" }));

    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
    expect(calls.find((call) => call.method === "POST").body).toEqual({
      taskIds: ["task-1"], mode: "cluster", reminderEnabled: false,
    });
    expect(onNotify).toHaveBeenCalledWith("Shared cluster imported successfully.");
  });

  test("lets users add selected deadlines to their task list with reminders enabled", async () => {
    const { calls } = mockFetch({
      "GET /api/broadcasts/A1B2C3D4E5": ok(broadcast),
      "POST /api/broadcasts/A1B2C3D4E5/import": ok({ mode: "tasks", cluster: null, tasks: [{ _id: "copy-1" }] }, 201),
    });
    render(<Broadcasts code="A1B2C3D4E5" onNotify={vi.fn()} onSessionExpired={vi.fn()} />);
    await screen.findByText("Algorithms Exam");
    fireEvent.click(screen.getByRole("radio", { name: /Add them directly to my task list/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Enable email reminders/ }));
    fireEvent.click(screen.getByRole("button", { name: "Import selected deadlines" }));

    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true));
    expect(calls.find((call) => call.method === "POST").body).toMatchObject({ mode: "tasks", reminderEnabled: true });
  });


  test("allows signed-out visitors to preview but prompts them to sign in before importing", async () => {
    mockFetch({ "GET /api/broadcasts/A1B2C3D4E5": ok(broadcast) });
    const onRequestLogin = vi.fn();
    render(<Broadcasts code="A1B2C3D4E5" canImport={false} onRequestLogin={onRequestLogin} onNotify={vi.fn()} onSessionExpired={vi.fn()} />);
    await screen.findByText("Algorithms Exam");
    expect(screen.getByRole("button", { name: "Sign in to import selected deadlines" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: /Algorithms Exam/ }).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Sign in to import selected deadlines" }));
    expect(onRequestLogin).toHaveBeenCalledOnce();
  });

  test("shows a useful error when a share code is unavailable", async () => {
    mockFetch({ "GET /api/broadcasts/BADCODE123": { status: 404, body: { message: "Shared cluster not found" } } });
    render(<Broadcasts code="BADCODE123" onNotify={vi.fn()} onSessionExpired={vi.fn()} />);
    expect(await screen.findByText("Shared cluster unavailable")).toBeTruthy();
    expect(screen.getByText("Shared cluster not found")).toBeTruthy();
  });
});
