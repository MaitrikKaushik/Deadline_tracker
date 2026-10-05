const mongoose = require("mongoose");

const User = require("../models/user");
const Task = require("../models/task");
const ReminderDelivery = require("../models/reminderDelivery");

const {
  runReminderCycle,
} = require("../services/reminderOrchestrator");

const emailService = require("../services/emailService");

describe("Complete Reminder Pipeline", () => {
  let user;

  beforeEach(async () => {
    await ReminderDelivery.deleteMany({});
    await Task.deleteMany({});
    await User.deleteMany({});

    user = await User.create({
      googleId: `pipeline-${new mongoose.Types.ObjectId()}`,
      name: "Pipeline Test User",
      email: "pipeline-test@example.com",
      picture: "",
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test(
    "should create and successfully send a reminder",
    async () => {
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

      const sendEmailMock =
        jest
          .spyOn(emailService, "sendReminderEmail")
          .mockResolvedValue({
            status: "Succeeded",
          });

      const result =
        await runReminderCycle(today);

      expect(
        result.scheduledDeliveries
      ).toHaveLength(1);

      expect(
        result.scheduledDeliveries[0].task._id.toString()
      ).toBe(task._id.toString());

      expect(
        result.processedDeliveries
      ).toHaveLength(1);

      expect(
        result.processedDeliveries[0].status
      ).toBe("sent");

      expect(
        result.processedDeliveries[0].attempts
      ).toBe(1);

      expect(
        result.processedDeliveries[0].sentAt
      ).not.toBeNull();

      expect(
        result.processedDeliveries[0].scheduledDate
      ).toBe(today);

      expect(sendEmailMock).toHaveBeenCalledTimes(1);

      expect(sendEmailMock).toHaveBeenCalledWith(
        user.email,
        expect.objectContaining({
          title: "Pipeline Test Task",
        })
      );
    }
  );

  test(
    "should not create a reminder for a disabled reminder",
    async () => {
      const today = "2026-10-01";

      await Task.create({
        title: "Disabled Reminder",
        description: "Should not send",
        deadline: "2027-06-01",
        priority: "medium",
        status: "pending",
        deadlineType: "general",
        referenceLink: "",
        reminderEnabled: false,
        userId: user._id,
      });

      const sendEmailMock =
        jest
          .spyOn(emailService, "sendReminderEmail")
          .mockResolvedValue({
            status: "Succeeded",
          });

      const result =
        await runReminderCycle(today);

      expect(
        result.scheduledDeliveries
      ).toHaveLength(0);

      expect(
        result.processedDeliveries
      ).toHaveLength(0);

      expect(sendEmailMock).not.toHaveBeenCalled();

      const deliveries =
        await ReminderDelivery.find({});

      expect(deliveries).toHaveLength(0);
    }
  );

  test(
    "should not create a reminder for a completed task",
    async () => {
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

      const sendEmailMock =
        jest
          .spyOn(emailService, "sendReminderEmail")
          .mockResolvedValue({
            status: "Succeeded",
          });

      const result =
        await runReminderCycle(today);

      expect(
        result.scheduledDeliveries
      ).toHaveLength(0);

      expect(
        result.processedDeliveries
      ).toHaveLength(0);

      expect(sendEmailMock).not.toHaveBeenCalled();
    }
  );

  test(
    "should not create duplicate deliveries on repeated runs",
    async () => {
      const today = "2026-10-01";

      await Task.create({
        title: "Duplicate Test",
        description: "Duplicate protection",
        deadline: "2027-06-01",
        priority: "high",
        status: "pending",
        deadlineType: "assignment",
        referenceLink: "",
        reminderEnabled: true,
        userId: user._id,
      });

      const sendEmailMock =
        jest
          .spyOn(emailService, "sendReminderEmail")
          .mockResolvedValue({
            status: "Succeeded",
          });

      const firstRun =
        await runReminderCycle(today);

      const secondRun =
        await runReminderCycle(today);

      expect(
        firstRun.scheduledDeliveries
      ).toHaveLength(1);

      expect(
        secondRun.scheduledDeliveries
      ).toHaveLength(1);

      const deliveries =
        await ReminderDelivery.find({});

      expect(deliveries).toHaveLength(1);

      expect(sendEmailMock).toHaveBeenCalledTimes(
        1
      );

      expect(
        deliveries[0].status
      ).toBe("sent");
    }
  );

  test(
    "should keep delivery pending when email sending fails",
    async () => {
      const today = "2026-10-01";

      await Task.create({
        title: "Failed Email Test",
        description: "Testing retry handling",
        deadline: "2027-06-01",
        priority: "high",
        status: "pending",
        deadlineType: "assignment",
        referenceLink: "",
        reminderEnabled: true,
        userId: user._id,
      });

      const sendEmailMock =
        jest
          .spyOn(emailService, "sendReminderEmail")
          .mockRejectedValue(
            new Error("Email service unavailable")
          );

      const result =
        await runReminderCycle(today);

      expect(
        result.scheduledDeliveries
      ).toHaveLength(1);

      expect(
        result.processedDeliveries
      ).toHaveLength(1);

      const delivery =
        await ReminderDelivery.findOne({});

      expect(delivery).not.toBeNull();

      expect(delivery.status).toBe(
        "pending"
      );

      expect(delivery.attempts).toBe(1);

      expect(delivery.lastError).toBe(
        "Email service unavailable"
      );

      expect(delivery.nextAttemptAt).not.toBeNull();

      expect(sendEmailMock).toHaveBeenCalledTimes(
        1
      );
    }
  );

  test(
    "should successfully retry a previously failed delivery",
    async () => {
      const today = "2026-10-01";

      const task = await Task.create({
        title: "Retry Test",
        description: "Testing email retry",
        deadline: "2027-06-01",
        priority: "high",
        status: "pending",
        deadlineType: "assignment",
        referenceLink: "",
        reminderEnabled: true,
        userId: user._id,
      });

      const sendEmailMock =
        jest
          .spyOn(emailService, "sendReminderEmail")
          .mockRejectedValueOnce(
            new Error("Temporary email failure")
          )
          .mockResolvedValueOnce({
            status: "Succeeded",
          });

      const firstRun =
        await runReminderCycle(today);

      expect(
        firstRun.processedDeliveries[0].status
      ).toBe("pending");

      const deliveryAfterFailure =
        await ReminderDelivery.findOne({
          taskId: task._id,
        });

      expect(
        deliveryAfterFailure.status
      ).toBe("pending");

      deliveryAfterFailure.nextAttemptAt =
        new Date(Date.now() - 1000);

      await deliveryAfterFailure.save();

      const secondRun =
        await runReminderCycle(today);

      const finalDelivery =
        await ReminderDelivery.findOne({
          taskId: task._id,
        });

      expect(
        secondRun.processedDeliveries[0].status
      ).toBe("sent");

      expect(finalDelivery.status).toBe(
        "sent"
      );

      expect(finalDelivery.attempts).toBe(2);

      expect(finalDelivery.sentAt).not.toBeNull();

      expect(sendEmailMock).toHaveBeenCalledTimes(
        2
      );
    }
  );
});