jest.mock("../services/emailService", () => ({
  sendReminderEmail: jest.fn().mockResolvedValue({
    status: "Succeeded",
  }),
}));

const User = require("../models/user");
const Task = require("../models/task");
const ReminderDelivery = require("../models/reminderDelivery");

const {
  processPendingReminderDeliveries,
} = require("../services/reminderQueueProcessor");

const {
  sendReminderEmail,
} = require("../services/emailService");

describe("Reminder Queue Processor", () => {
  let user;

  beforeEach(async () => {
    sendReminderEmail.mockClear();

    await ReminderDelivery.deleteMany({});
    await Task.deleteMany({});
    await User.deleteMany({});

    user = await User.create({
      googleId: `queue-${Date.now()}`,
      name: "Queue User",
      email: `queue-${Date.now()}@example.com`,
      picture: "",
    });
  });

  test("should process an eligible pending delivery", async () => {
    const task = await Task.create({
      title: "Queue Test",
      deadline: "2027-06-01",
      priority: "high",
      status: "pending",
      deadlineType: "assignment",
      reminderEnabled: true,
      userId: user._id,
    });

    await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
    });

    const results = await processPendingReminderDeliveries();

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("sent");
    expect(sendReminderEmail).toHaveBeenCalledWith(
      user.email,
      expect.objectContaining({ title: "Queue Test" })
    );
  });

  test("should mark a delivery failed when its task is gone", async () => {
    const task = await Task.create({
      title: "Deleted Task",
      deadline: "2027-06-01",
      userId: user._id,
    });

    const delivery = await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
    });

    await Task.deleteOne({ _id: task._id });

    const results = await processPendingReminderDeliveries();

    const stored = await ReminderDelivery.findById(delivery._id);

    expect(results).toHaveLength(1);
    expect(stored.status).toBe("failed");
    expect(stored.lastError).toBe(
      "Task or user no longer exists"
    );
    expect(sendReminderEmail).not.toHaveBeenCalled();
  });

  test("should stop reminders for a completed task", async () => {
    const task = await Task.create({
      title: "Completed Task",
      deadline: "2027-06-01",
      status: "completed",
      reminderEnabled: true,
      userId: user._id,
    });

    const delivery = await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
    });

    const results = await processPendingReminderDeliveries();
    const stored = await ReminderDelivery.findById(delivery._id);

    expect(results).toHaveLength(1);
    expect(stored.status).toBe("failed");
    expect(stored.lastError).toBe(
      "Reminder no longer required"
    );
    expect(sendReminderEmail).not.toHaveBeenCalled();
  });

  test("should stop reminders when reminderEnabled is false", async () => {
    const task = await Task.create({
      title: "Disabled Reminder",
      deadline: "2027-06-01",
      status: "pending",
      reminderEnabled: false,
      userId: user._id,
    });

    const delivery = await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
    });

    const results = await processPendingReminderDeliveries();
    const stored = await ReminderDelivery.findById(delivery._id);

    expect(results).toHaveLength(1);
    expect(stored.status).toBe("failed");
    expect(stored.lastError).toBe(
      "Reminder no longer required"
    );
    expect(sendReminderEmail).not.toHaveBeenCalled();
  });
});
