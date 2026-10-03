const Task = require("../models/task");
const User = require("../models/user");

const {
  getTasksDueForReminder,
} = require("../services/reminderScanner");

const ReminderDelivery = require("../models/reminderDelivery");

describe("Reminder Scanner", () => {
  let user;

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
  });

  test(
    "should return a task and create a delivery when today is a reminder date",
    async () => {
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

      const results =
        await getTasksDueForReminder(today);

      expect(results).toHaveLength(1);

      expect(results[0].task.title).toBe(
        "Test Task"
      );

      expect(
        results[0].delivery
      ).not.toBeNull();

      expect(
        results[0].delivery.scheduledDate
      ).toBe("2026-10-01");

      expect(
        results[0].delivery.status
      ).toBe("pending");
    }
  );

  test(
    "should not return a task when reminders are disabled",
    async () => {
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

      const results =
        await getTasksDueForReminder(today);

      expect(results).toHaveLength(0);
    }
  );

  test(
    "should not return a completed task",
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

      const results =
        await getTasksDueForReminder(today);

      expect(results).toHaveLength(0);
    }
  );

  test(
    "should not return a task when today is not a reminder date",
    async () => {
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

      const results =
        await getTasksDueForReminder(today);

      expect(results).toHaveLength(0);
    }
  );

  test(
    "should not create duplicate deliveries for the same reminder date",
    async () => {
      const today = "2026-10-01";

      await Task.create({
        title: "Duplicate Test Task",
        description: "Duplicate delivery test",
        deadline: "2027-06-01",
        priority: "high",
        status: "pending",
        deadlineType: "assignment",
        referenceLink: "",
        reminderEnabled: true,
        userId: user._id,
      });

      const firstRun =
        await getTasksDueForReminder(today);

      const secondRun =
        await getTasksDueForReminder(today);

      expect(firstRun).toHaveLength(1);
      expect(secondRun).toHaveLength(1);

      const deliveries =
        await ReminderDelivery.find({});

      expect(deliveries).toHaveLength(1);

      expect(
        deliveries[0].scheduledDate
      ).toBe("2026-10-01");
    }
  );
});