jest.mock("../services/emailService", () => ({
  sendReminderEmail: jest.fn(),
}));

const User = require("../models/user");
const Task = require("../models/task");
const ReminderDelivery = require("../models/reminderDelivery");

const {
  processReminderDelivery,
} = require("../services/reminderDeliveryProcessor");

const {
  sendReminderEmail,
} = require("../services/emailService");

describe("Reminder Delivery Processor", () => {
  let user;
  let task;

  beforeEach(async () => {
    sendReminderEmail.mockReset();

    await ReminderDelivery.deleteMany({});
    await Task.deleteMany({});
    await User.deleteMany({});

    user = await User.create({
      googleId: `processor-${Date.now()}`,
      name: "Processor User",
      email: `processor-${Date.now()}@example.com`,
      picture: "",
    });

    task = await Task.create({
      title: "Processor Test",
      deadline: "2027-06-01",
      priority: "high",
      status: "pending",
      deadlineType: "assignment",
      reminderEnabled: true,
      userId: user._id,
    });
  });

  test("should mark a pending delivery as sent after successful email", async () => {
    sendReminderEmail.mockResolvedValue({ status: "Succeeded" });

    const delivery = await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
    });

    const result = await processReminderDelivery(
      delivery,
      task,
      user.email
    );

    expect(result.status).toBe("sent");
    expect(result.attempts).toBe(1);
    expect(result.sentAt).not.toBeNull();
    expect(result.nextAttemptAt).toBeNull();
    expect(result.lastError).toBe("");
    expect(sendReminderEmail).toHaveBeenCalledTimes(1);
  });

  test("should not send a delivery that is already sent", async () => {
    sendReminderEmail.mockResolvedValue({ status: "Succeeded" });

    const delivery = await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
      status: "sent",
      attempts: 1,
      sentAt: new Date(),
    });

    const result = await processReminderDelivery(
      delivery,
      task,
      user.email
    );

    expect(result.status).toBe("sent");
    expect(sendReminderEmail).not.toHaveBeenCalled();
  });

  test("should not retry before nextAttemptAt", async () => {
    const delivery = await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
      status: "pending",
      attempts: 1,
      nextAttemptAt: new Date(Date.now() + 60_000),
    });

    const result = await processReminderDelivery(
      delivery,
      task,
      user.email
    );

    expect(result.status).toBe("pending");
    expect(result.attempts).toBe(1);
    expect(sendReminderEmail).not.toHaveBeenCalled();
  });

  test("should use Azure Retry-After when email service provides it", async () => {
    const error = new Error("Too many requests");
    error.response = {
      headers: {
        "retry-after": "120",
      },
    };

    sendReminderEmail.mockRejectedValue(error);

    const delivery = await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
    });

    const before = Date.now();

    const result = await processReminderDelivery(
      delivery,
      task,
      user.email
    );

    const retryTime = result.nextAttemptAt.getTime();

    expect(result.status).toBe("pending");
    expect(result.attempts).toBe(1);
    expect(result.lastError).toBe("Too many requests");
    expect(retryTime).toBeGreaterThanOrEqual(
      before + 119_000
    );
    expect(retryTime).toBeLessThanOrEqual(
      before + 121_000
    );
  });

  test("should fall back to a one-hour retry when Retry-After is unavailable", async () => {
    sendReminderEmail.mockRejectedValue(
      new Error("Temporary failure")
    );

    const delivery = await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
    });

    const before = Date.now();

    const result = await processReminderDelivery(
      delivery,
      task,
      user.email
    );

    const retryTime = result.nextAttemptAt.getTime();

    expect(result.status).toBe("pending");
    expect(result.attempts).toBe(1);
    expect(retryTime).toBeGreaterThanOrEqual(
      before + 3_599_000
    );
    expect(retryTime).toBeLessThanOrEqual(
      before + 3_601_000
    );
  });

  test("should prevent two processors from sending the same delivery", async () => {
    let resolveEmail;

    sendReminderEmail.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveEmail = resolve;
        })
    );

    const delivery = await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-10-01",
    });

    const first = processReminderDelivery(
      delivery,
      task,
      user.email
    );

    for (let i = 0; i < 50 && sendReminderEmail.mock.calls.length === 0; i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(sendReminderEmail).toHaveBeenCalledTimes(1);

    const second = processReminderDelivery(
      delivery,
      task,
      user.email
    );

    resolveEmail({ status: "Succeeded" });

    const [firstResult, secondResult] = await Promise.all([
      first,
      second,
    ]);

    expect(sendReminderEmail).toHaveBeenCalledTimes(1);
    expect(firstResult.status).toBe("sent");
    expect(["sending", "sent"]).toContain(secondResult.status);
  });
});
