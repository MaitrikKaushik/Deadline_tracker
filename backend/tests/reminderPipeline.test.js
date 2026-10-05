jest.mock("../services/emailService", () => ({
  sendReminderEmail: jest.fn(),
}));

const mongoose = require("mongoose");

const User = require("../models/user");
const Task = require("../models/task");
const ReminderDelivery = require("../models/reminderDelivery");

const {
  runReminderCycle,
} = require("../services/reminderOrchestrator");

const {
  sendReminderEmail,
} = require("../services/emailService");

describe("Complete Reminder Pipeline", () => {
  let user;

  beforeEach(async () => {
    sendReminderEmail.mockReset();

    await ReminderDelivery.deleteMany({});
    await Task.deleteMany({});
    await User.deleteMany({});

    user = await User.create({
      googleId: `pipeline-${new mongoose.Types.ObjectId()}`,
      name: "Pipeline Test User",
      email: `pipeline-${new mongoose.Types.ObjectId()}@example.com`,
      picture: "",
    });
  });

  test("should create and successfully send a reminder", async () => {
    sendReminderEmail.mockResolvedValue({
      status: "Succeeded",
    });

    const today = "2026-10-01";

    const task = await Task.create({
      title: "Pipeline Test Task",
      description: "Testing complete reminder pipeline",
      deadline: "2027-06-01",
      priority: "high",
      status: "pending",
      deadlineType: "assignment",
      referenceLink: "",
      reminderEnabled: true,
      userId: user._id,
    });

    const result = await runReminderCycle(today);

    expect(result.scheduledDeliveries).toHaveLength(1);
    expect(result.scheduledDeliveries[0].task._id.toString()).toBe(
      task._id.toString()
    );

    expect(result.processedDeliveries).toHaveLength(1);
    expect(result.processedDeliveries[0].status).toBe("sent");
    expect(result.processedDeliveries[0].attempts).toBe(1);
    expect(result.processedDeliveries[0].sentAt).not.toBeNull();
    expect(result.processedDeliveries[0].scheduledDate).toBe(today);

    expect(sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(sendReminderEmail).toHaveBeenCalledWith(
      user.email,
      expect.objectContaining({
        title: "Pipeline Test Task",
      })
    );
  });

  test("should not create a reminder for a disabled reminder", async () => {
    sendReminderEmail.mockResolvedValue({ status: "Succeeded" });

    await Task.create({
      title: "Disabled Reminder",
      deadline: "2027-06-01",
      priority: "medium",
      status: "pending",
      deadlineType: "general",
      reminderEnabled: false,
      userId: user._id,
    });

    const result = await runReminderCycle("2026-10-01");

    expect(result.scheduledDeliveries).toHaveLength(0);
    expect(result.processedDeliveries).toHaveLength(0);
    expect(sendReminderEmail).not.toHaveBeenCalled();
    expect(await ReminderDelivery.countDocuments()).toBe(0);
  });

  test("should not create a reminder for a completed task", async () => {
    sendReminderEmail.mockResolvedValue({ status: "Succeeded" });

    await Task.create({
      title: "Completed Task",
      deadline: "2027-06-01",
      priority: "high",
      status: "completed",
      deadlineType: "assignment",
      reminderEnabled: true,
      userId: user._id,
    });

    const result = await runReminderCycle("2026-10-01");

    expect(result.scheduledDeliveries).toHaveLength(0);
    expect(result.processedDeliveries).toHaveLength(0);
    expect(sendReminderEmail).not.toHaveBeenCalled();
  });

  test("should not send the same reminder twice on repeated runs", async () => {
    sendReminderEmail.mockResolvedValue({ status: "Succeeded" });

    await Task.create({
      title: "Duplicate Test",
      deadline: "2027-06-01",
      priority: "high",
      status: "pending",
      deadlineType: "assignment",
      reminderEnabled: true,
      userId: user._id,
    });

    const firstRun = await runReminderCycle("2026-10-01");
    const secondRun = await runReminderCycle("2026-10-01");

    expect(firstRun.scheduledDeliveries).toHaveLength(1);
    expect(firstRun.processedDeliveries).toHaveLength(1);
    expect(firstRun.processedDeliveries[0].status).toBe("sent");

    expect(secondRun.scheduledDeliveries).toHaveLength(1);
    expect(secondRun.processedDeliveries).toHaveLength(0);

    expect(await ReminderDelivery.countDocuments()).toBe(1);
    expect(sendReminderEmail).toHaveBeenCalledTimes(1);
  });

  test("should keep a delivery pending when email sending fails", async () => {
    sendReminderEmail.mockRejectedValue(
      new Error("Email service unavailable")
    );

    await Task.create({
      title: "Failed Email Test",
      deadline: "2027-06-01",
      priority: "high",
      status: "pending",
      deadlineType: "assignment",
      reminderEnabled: true,
      userId: user._id,
    });

    const result = await runReminderCycle("2026-10-01");
    const delivery = await ReminderDelivery.findOne({});

    expect(result.scheduledDeliveries).toHaveLength(1);
    expect(result.processedDeliveries).toHaveLength(1);
    expect(result.processedDeliveries[0].status).toBe("pending");

    expect(delivery.status).toBe("pending");
    expect(delivery.attempts).toBe(1);
    expect(delivery.lastError).toBe("Email service unavailable");
    expect(delivery.nextAttemptAt).not.toBeNull();
    expect(sendReminderEmail).toHaveBeenCalledTimes(1);
  });

  test("should retry a failed delivery when its retry time arrives", async () => {
    sendReminderEmail
      .mockRejectedValueOnce(new Error("Temporary email failure"))
      .mockResolvedValueOnce({ status: "Succeeded" });

    const task = await Task.create({
      title: "Retry Test",
      deadline: "2027-06-01",
      priority: "high",
      status: "pending",
      deadlineType: "assignment",
      reminderEnabled: true,
      userId: user._id,
    });

    const firstRun = await runReminderCycle("2026-10-01");

    expect(firstRun.processedDeliveries[0].status).toBe("pending");

    const failedDelivery = await ReminderDelivery.findOne({
      taskId: task._id,
    });

    failedDelivery.nextAttemptAt = new Date(Date.now() - 1000);
    await failedDelivery.save();

    const secondRun = await runReminderCycle("2026-10-01");
    const finalDelivery = await ReminderDelivery.findOne({
      taskId: task._id,
    });

    expect(secondRun.processedDeliveries).toHaveLength(1);
    expect(secondRun.processedDeliveries[0].status).toBe("sent");
    expect(finalDelivery.status).toBe("sent");
    expect(finalDelivery.attempts).toBe(2);
    expect(finalDelivery.sentAt).not.toBeNull();
    expect(finalDelivery.lastError).toBe("");
    expect(finalDelivery.nextAttemptAt).toBeNull();
    expect(sendReminderEmail).toHaveBeenCalledTimes(2);
  });
});
