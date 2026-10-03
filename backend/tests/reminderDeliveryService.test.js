const mongoose = require("mongoose");

const ReminderDelivery = require("../models/reminderDelivery");
const User = require("../models/user");
const Task = require("../models/task");

const {
  createReminderDelivery,
} = require("../services/reminderDeliveryService");

describe("Reminder Delivery Service", () => {
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
      description: "Delivery service test",
      deadline: "2027-06-01",
      priority: "high",
      status: "pending",
      deadlineType: "assignment",
      referenceLink: "",
      reminderEnabled: true,
      userId: user._id,
    });
  });

  test("should create a pending delivery", async () => {
    const delivery = await createReminderDelivery(
      task,
      "2026-10-03"
    );

    expect(delivery).not.toBeNull();
    expect(delivery.taskId.toString()).toBe(
      task._id.toString()
    );
    expect(delivery.userId.toString()).toBe(
      user._id.toString()
    );
    expect(delivery.scheduledDate).toBe(
      "2026-10-03"
    );
    expect(delivery.status).toBe("pending");
    expect(delivery.attempts).toBe(0);
  });

  test("should return the existing delivery instead of creating a duplicate", async () => {
    const firstDelivery =
      await createReminderDelivery(
        task,
        "2026-10-03"
      );

    const secondDelivery =
      await createReminderDelivery(
        task,
        "2026-10-03"
      );

    expect(secondDelivery._id.toString()).toBe(
      firstDelivery._id.toString()
    );

    const deliveries =
      await ReminderDelivery.find({
        taskId: task._id,
        scheduledDate: "2026-10-03",
      });

    expect(deliveries).toHaveLength(1);
  });

  test("should create separate deliveries for different reminder dates", async () => {
    const firstDelivery =
      await createReminderDelivery(
        task,
        "2026-10-03"
      );

    const secondDelivery =
      await createReminderDelivery(
        task,
        "2026-10-10"
      );

    expect(firstDelivery._id.toString()).not.toBe(
      secondDelivery._id.toString()
    );

    const deliveries =
      await ReminderDelivery.find({
        taskId: task._id,
      });

    expect(deliveries).toHaveLength(2);
  });
});