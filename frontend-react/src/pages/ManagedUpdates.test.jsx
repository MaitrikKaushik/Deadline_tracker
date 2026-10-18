import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import { mockFetch, ok } from "../test/testUtils";
import ManagedUpdates from "./ManagedUpdates";

const proposal = {
  _id: "update-1",
  broadcastId: { _id: "broadcast-1", name: "Exam Calendar", code: "ABC1234567" },
  broadcastImportId: { _id: "import-1", syncEnabled: true },
  targetType: "task",
  itemTitle: "Algorithms Exam",
  changes: [
    { field: "title", label: "Title", previousValue: "Algorithms Exam", proposedValue: "Algorithms Final", previousDisplay: "Algorithms Exam", proposedDisplay: "Algorithms Final", status: "pending" },
    { field: "reminderEnabled", label: "Email reminders", previousValue: true, proposedValue: false, previousDisplay: "Enabled", proposedDisplay: "Disabled", status: "pending" },
  ],
};

const handlers = () => ({ onNotify: vi.fn(), onSessionExpired: vi.fn() });

describe("Managed updates inbox", () => {
  test("can disconnect a source even when there are no pending proposals", async () => {
    let connected = true;
    const { callsTo } = mockFetch({
      "GET /api/managed-updates": () => ok({
        updates: [],
        pendingCount: 0,
        connections: [{
          _id: "import-1",
          broadcast: { _id: "broadcast-1", name: "Exam Calendar", code: "ABC1234567" },
          mode: "cluster",
          syncEnabled: connected,
        }],
      }),
      "POST /api/managed-updates/imports/import-1/disconnect": () => {
        connected = false;
        return ok({ message: "Future updates disconnected", syncEnabled: false });
      },
    });
    const { onNotify } = handlers();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<ManagedUpdates {...handlers()} onNotify={onNotify} />);

    expect(await screen.findByText("Exam Calendar")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop future updates" }));

    await waitFor(() => expect(callsTo("POST", "/api/managed-updates/imports/import-1/disconnect")).toHaveLength(1));
    expect(await screen.findByText("Disconnected")).toBeTruthy();
    expect(onNotify).toHaveBeenCalledWith("Future updates from this source are disconnected. Existing proposals remain available.");
    confirm.mockRestore();
  });

  test("shows source changes and sends independent accept/reject choices", async () => {
    let pending = true;
    const { callsTo } = mockFetch({
      "GET /api/managed-updates": () => ok({ updates: pending ? [proposal] : [], pendingCount: pending ? 1 : 0 }),
      "POST /api/managed-updates/update-1/decide": ({ body }) => {
        expect(body.decisions).toEqual([
          { field: "title", action: "accept" },
          { field: "reminderEnabled", action: "reject" },
        ]);
        pending = false;
        return ok({ message: "Your decisions have been saved", status: "resolved" });
      },
    });
    const { onNotify } = handlers();

    render(<ManagedUpdates {...handlers()} onNotify={onNotify} />);

    expect(await screen.findByRole("heading", { name: "Algorithms Exam" })).toBeTruthy();
    expect(screen.getByText("Algorithms Final")).toBeTruthy();
    expect(screen.getByText("Disabled")).toBeTruthy();

    const titleDecision = screen.getByRole("radiogroup", { name: "Decision for Title" });
    fireEvent.click(within(titleDecision).getByLabelText("Accept change"));
    const reminderDecision = screen.getByRole("radiogroup", { name: "Decision for Email reminders" });
    fireEvent.click(within(reminderDecision).getByLabelText("Keep my value"));

    fireEvent.click(screen.getByRole("button", { name: "Save selected decisions" }));

    await waitFor(() => expect(callsTo("POST", "/api/managed-updates/update-1/decide")).toHaveLength(1));
    expect(await screen.findByRole("heading", { name: "You're up to date" })).toBeTruthy();
    expect(onNotify).toHaveBeenCalledWith("Your decisions have been saved");
  });
});
