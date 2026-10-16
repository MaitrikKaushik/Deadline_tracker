import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, test } from "vitest";

import { makeTask } from "../test/testUtils";
import TaskSelector from "./TaskSelector";

const tasks = [
  makeTask({ _id: "a", title: "Alpha", priority: "high" }),
  makeTask({ _id: "b", title: "Beta", status: "completed" }),
  makeTask({ _id: "c", title: "Gamma" }),
];

function Harness({ initial = [] }) {
  const [ids, setIds] = useState(initial);

  return (
    <>
      <TaskSelector tasks={tasks} selectedIds={ids} onChange={setIds} />
      <output data-testid="ids">{JSON.stringify(ids)}</output>
    </>
  );
}

const ids = () => JSON.parse(screen.getByTestId("ids").textContent);

describe("TaskSelector", () => {
  test("shows title, deadline, priority and status for every task", () => {
    render(<Harness />);

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getAllByText(/Due 1 Dec 2026/)).toHaveLength(3);
    expect(screen.getByText("high")).toBeTruthy();
    expect(screen.getByText("Completed")).toBeTruthy();
    expect(screen.getAllByText("Pending")).toHaveLength(2);
  });

  test("selects, deselects and counts deadlines", () => {
    render(<Harness />);

    expect(screen.getByText("0 deadlines selected")).toBeTruthy();

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Gamma" }));

    expect(ids()).toEqual(["a", "c"]);
    expect(screen.getByText("2 deadlines selected")).toBeTruthy();
    expect(
      screen.getByRole("checkbox", { name: "Select Alpha" }).checked
    ).toBe(true);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Alpha" }));

    expect(ids()).toEqual(["c"]);
    expect(screen.getByText("1 deadline selected")).toBeTruthy();
  });

  test("Select all never produces duplicates, and Clear empties the selection", () => {
    render(<Harness initial={["b"]} />);

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));

    expect(ids().sort()).toEqual(["a", "b", "c"]);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(ids()).toEqual([]);
  });
});
