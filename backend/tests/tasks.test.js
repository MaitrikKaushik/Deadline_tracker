const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const User = require("../models/user");
const Task = require("../models/task");
const ReminderDelivery = require("../models/reminderDelivery");

const createToken = (userId) =>
  jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

const authCookie = (userId) =>
  `token=${createToken(userId)}`;

describe("Task API", () => {
  let user;
  let otherUser;

  beforeEach(async () => {
    await ReminderDelivery.deleteMany({});
    await Task.deleteMany({});
    await User.deleteMany({});

    user = await User.create({
      googleId: `task-test-${Date.now()}`,
      name: "Task User",
      email: `task-${Date.now()}@example.com`,
      picture: "",
    });

    otherUser = await User.create({
      googleId: `other-task-test-${Date.now()}`,
      name: "Other User",
      email: `other-task-${Date.now()}@example.com`,
      picture: "",
    });
  });

  test("should reject unauthenticated users", async () => {
    const response = await request(app).get("/api/tasks");

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Not authenticated");
  });

  test("should create a task for the authenticated user", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set("Cookie", authCookie(user._id))
      .send({
        title: "Test Task",
        description: "Task description",
        deadline: "2026-12-01",
        priority: "high",
        status: "pending",
        deadlineType: "exam",
        referenceLink: "https://example.com",
        reminderEnabled: true,
      });

    expect(response.statusCode).toBe(201);
    expect(response.body.title).toBe("Test Task");
    expect(response.body.deadlineType).toBe("exam");
    expect(response.body.userId.toString()).toBe(user._id.toString());
  });

  test("should reject a deadline more than 366 days from today", async () => {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 367);

    const response = await request(app)
      .post("/api/tasks")
      .set("Cookie", authCookie(user._id))
      .send({
        title: "Too Far",
        deadline: deadline.toISOString(),
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe(
      "Deadline cannot be more than 366 days from today"
    );
  });

  test("should reject an invalid deadline", async () => {
    const response = await request(app)
      .post("/api/tasks")
      .set("Cookie", authCookie(user._id))
      .send({
        title: "Invalid Deadline",
        deadline: "not-a-date",
      });

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe("Invalid deadline");
  });

  test("should return only the authenticated user's tasks", async () => {
    await Task.create([
      {
        title: "My Task",
        deadline: "2026-12-01",
        userId: user._id,
      },
      {
        title: "Other Task",
        deadline: "2026-12-01",
        userId: otherUser._id,
      },
    ]);

    const response = await request(app)
      .get("/api/tasks")
      .set("Cookie", authCookie(user._id));

    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].title).toBe("My Task");
  });

  test("should get a task owned by the authenticated user", async () => {
    const task = await Task.create({
      title: "Owned Task",
      deadline: "2026-12-01",
      userId: user._id,
    });

    const response = await request(app)
      .get(`/api/tasks/${task._id}`)
      .set("Cookie", authCookie(user._id));

    expect(response.statusCode).toBe(200);
    expect(response.body.title).toBe("Owned Task");
  });

  test("should not allow access to another user's task", async () => {
    const task = await Task.create({
      title: "Private Task",
      deadline: "2026-12-01",
      userId: otherUser._id,
    });

    const response = await request(app)
      .get(`/api/tasks/${task._id}`)
      .set("Cookie", authCookie(user._id));

    expect(response.statusCode).toBe(404);
    expect(response.body.message).toBe("Task not found");
  });

  test("should update an owned task", async () => {
    const task = await Task.create({
      title: "Old Title",
      deadline: "2026-12-01",
      reminderEnabled: true,
      userId: user._id,
    });

    await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-11-01",
    });

    const response = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("Cookie", authCookie(user._id))
      .send({
        title: "Updated Title",
        deadline: "2026-12-15",
      });

    expect(response.statusCode).toBe(200);
    expect(response.body.title).toBe("Updated Title");
    expect(new Date(response.body.deadline).toISOString()).toContain(
      "2026-12-15"
    );

    expect(
      await ReminderDelivery.countDocuments({ taskId: task._id })
    ).toBe(0);
  });

  test("should not allow updating another user's task", async () => {
    const task = await Task.create({
      title: "Private Task",
      deadline: "2026-12-01",
      userId: otherUser._id,
    });

    const response = await request(app)
      .put(`/api/tasks/${task._id}`)
      .set("Cookie", authCookie(user._id))
      .send({ title: "Hacked" });

    expect(response.statusCode).toBe(404);
    expect(response.body.message).toBe("Task not found");
  });

  test("should delete an owned task and its unsent deliveries", async () => {
    const task = await Task.create({
      title: "Delete Me",
      deadline: "2026-12-01",
      userId: user._id,
    });

    await ReminderDelivery.create({
      taskId: task._id,
      userId: user._id,
      scheduledDate: "2026-11-01",
    });

    const response = await request(app)
      .delete(`/api/tasks/${task._id}`)
      .set("Cookie", authCookie(user._id));

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe("Task deleted");
    expect(await Task.findById(task._id)).toBeNull();
    expect(
      await ReminderDelivery.countDocuments({ taskId: task._id })
    ).toBe(0);
  });
});
