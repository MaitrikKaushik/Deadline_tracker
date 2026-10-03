const mongoose = require("mongoose");

const ReminderDelivery = require("../models/reminderDelivery");
const User = require("../models/user");
const Task = require("../models/task");

describe("Reminder Delivery", () => {
  let user;
  let task;

  beforeEach(async () => {
    await ReminderDelivery.deleteMany({});
    await Task.deleteMany({});
    await User.deleteMany({});

    user = await User.create({
      googleId: `test-${Date.now()}`,
      name: "Test User",
      email: `test-${Date.now()}@example.com`,
      picture: "",
    });

    task = await Task.create({
      title: "Test Reminder",
      description: "Reminder delivery test",
      deadline: "2027-06-01",
      priority: "high",
      status: "pending",
      deadlineType: "assignment",
      referenceLink: "",
      reminderEnabled: true,
      userId: user._id,
    });
  });

  test("should create a pending reminder delivery", async () => {
    const delivery = await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
    });

    expect(delivery.status).toBe("pending");
    expect(delivery.attempts).toBe(0);
    expect(delivery.sentAt).toBeNull();
    expect(delivery.nextAttemptAt).toBeNull();
    expect(delivery.lastError).toBe("");
  });

  test("should prevent duplicate delivery for the same task and date", async () => {
    await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
    });

    await expect(
      ReminderDelivery.create({
        taskId: task._id,
        userId: user._id,
        scheduledDate: "2026-10-01",
      })
    ).rejects.toThrow();
  });
});