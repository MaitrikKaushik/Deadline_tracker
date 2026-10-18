import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import Navbar from "./Navbar";
import { mockFetch, ok } from "../test/testUtils";

describe("Navbar", () => {
  test("shows Tasks and a Clusters menu with both cluster links", () => {
    render(<Navbar route={{ name: "tasks" }} />);

    expect(screen.getByRole("link", { name: "Tasks" })).toHaveProperty(
      "href",
      expect.stringMatching(/#\/$/)
    );

    expect(screen.queryByRole("link", { name: "Show Clusters" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /clusters/i }));

    expect(
      screen.getByRole("link", { name: "Show Clusters" }).getAttribute("href")
    ).toBe("#/clusters");
    expect(
      screen.getByRole("link", { name: "Create Cluster" }).getAttribute("href")
    ).toBe("#/clusters/new");
    expect(
      screen.getByRole("link", { name: "Discover & Import" }).getAttribute("href")
    ).toBe("#/broadcasts");
  });

  test("shows a pending-update count on the Clusters menu before it is opened", async () => {
    mockFetch({
      "GET /api/managed-updates": ok({ updates: [], pendingCount: 3, connections: [] }),
    });

    render(<Navbar route={{ name: "tasks" }} />);

    expect(await screen.findByLabelText("3 pending updates")).toBeTruthy();
  });

  test("toggles aria-expanded and closes on Escape and after choosing a link", () => {
    render(<Navbar route={{ name: "tasks" }} />);

    const button = screen.getByRole("button", { name: /clusters/i });

    expect(button.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("link", { name: "Show Clusters" })).toBeNull();

    fireEvent.click(button);
    fireEvent.click(screen.getByRole("link", { name: "Show Clusters" }));
    expect(screen.queryByRole("link", { name: "Show Clusters" })).toBeNull();
  });

  test("marks the current section", () => {
    const { rerender } = render(<Navbar route={{ name: "tasks" }} />);

    expect(
      screen.getByRole("link", { name: "Tasks" }).getAttribute("aria-current")
    ).toBe("page");

    rerender(<Navbar route={{ name: "clusters" }} />);

    expect(
      screen.getByRole("link", { name: "Tasks" }).getAttribute("aria-current")
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /clusters/i }).className
    ).toMatch(/active/);
  });
});
