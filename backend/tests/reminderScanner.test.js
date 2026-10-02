const mongoose = require("mongoose");

const Task = require("../models/task");

const {
  getTasksDueForReminder,
} = require("../services/reminderScanner");

const User = require("../models/user");

describe("Reminder Scanner", () => {
  let user;

  beforeEach(async () => {
    await Task.deleteMany({});
    await User.deleteMany({});

    user = await User.create({
      googleId: `test-${Date.now()}`,
      name: "Test User",
      email: `test-${Date.now()}@example.com`,
      picture: "",
    });
  });

  test("should return a task when today is a reminder date", async () => {
    const today = "2026-10-01";

    await Task.create({
      title: "Test Task",
      description: "Reminder test",
      deadline: "2027-06-01",
      priority: "high",
      status: "pending",
      deadlineType: "assignment",
      referenceLink: "",
      reminderEnabled: true,
      userId: user._id,
    });

    const tasks = await getTasksDueForReminder(today);

    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Test Task");
  });

  test("should not return a task when reminders are disabled", async () => {
    const today = "2026-10-01";

    await Task.create({
      title: "No Reminder Task",
      description: "Reminder disabled",
      deadline: "2027-06-01",
      priority: "medium",
      status: "pending",
      deadlineType: "general",
      referenceLink: "",
      reminderEnabled: false,
      userId: user._id,
    });

    const tasks = await getTasksDueForReminder(today);

    expect(tasks).toHaveLength(0);
  });

  test("should not return a completed task", async () => {
    const today = "2026-10-01";

    await Task.create({
      title: "Completed Task",
      description: "Already completed",
      deadline: "2027-06-01",
      priority: "high",
      status: "completed",
      deadlineType: "assignment",
      referenceLink: "",
      reminderEnabled: true,
      userId: user._id,
    });

    const tasks = await getTasksDueForReminder(today);

    expect(tasks).toHaveLength(0);
  });

  test("should not return a task when today is not a reminder date", async () => {
    const today = "2026-10-02";

    await Task.create({
      title: "Future Reminder Task",
      description: "Not due today",
      deadline: "2027-06-01",
      priority: "low",
      status: "pending",
      deadlineType: "general",
      referenceLink: "",
      reminderEnabled: true,
      userId: user._id,
    });

    const tasks = await getTasksDueForReminder(today);

    expect(tasks).toHaveLength(0);
  });
});