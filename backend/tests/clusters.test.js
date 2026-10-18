const request = require("supertest");
const jwt = require("jsonwebtoken");

const app = require("../app");
const User = require("../models/user");
const Task = require("../models/task");
const Cluster = require("../models/cluster");

const createToken = (userId) =>
  jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );

const authCookie = (userId) =>
  `token=${createToken(userId)}`;

const missingId = "64b7f0c2a1b2c3d4e5f60718";

describe("Cluster API", () => {
  let user;
  let otherUser;
  let task1;
  let task2;
  let otherTask;

  beforeEach(async () => {
    await Cluster.deleteMany({});
    await Task.deleteMany({});
    await User.deleteMany({});

    user = await User.create({
      googleId: `cluster-test-${Date.now()}`,
      name: "Cluster User",
      email: `cluster-${Date.now()}@example.com`,
      picture: "",
    });

    otherUser = await User.create({
      googleId: `other-cluster-test-${Date.now()}`,
      name: "Other Cluster User",
      email: `other-cluster-${Date.now()}@example.com`,
      picture: "",
    });

    [task1, task2] = await Task.create([
      { title: "Task 1", deadline: "2026-12-01", userId: user._id },
      { title: "Task 2", deadline: "2026-12-01", userId: user._id },
    ]);

    otherTask = await Task.create({
      title: "Other Task",
      deadline: "2026-12-01",
      userId: otherUser._id,
    });
  });

  describe("authentication", () => {
    test("should reject unauthenticated requests to every endpoint", async () => {
      const responses = await Promise.all([
        request(app).post("/api/clusters").send({ name: "X" }),
        request(app).get("/api/clusters"),
        request(app).get(`/api/clusters/${missingId}`),
        request(app).put(`/api/clusters/${missingId}`).send({ name: "X" }),
        request(app).delete(`/api/clusters/${missingId}`),
      ]);

      responses.forEach((response) => {
        expect(response.statusCode).toBe(401);
        expect(response.body.message).toBe("Not authenticated");
      });
    });
  });

  describe("create cluster", () => {
    const create = (body, userId = user._id) =>
      request(app)
        .post("/api/clusters")
        .set("Cookie", authCookie(userId))
        .send(body);

    test("should create a cluster for the authenticated user", async () => {
      const response = await create({
        name: "  My Cluster  ",
        taskIds: [task1._id.toString(), task2._id.toString()],
      });

      expect(response.statusCode).toBe(201);
      expect(response.body.name).toBe("My Cluster");
      expect(response.body.origin).toBe("created");
      expect(response.body.ownerId.toString()).toBe(user._id.toString());
      expect(response.body.tasks).toHaveLength(2);
    });

    test.each([
      ["missing", {}],
      ["non-string", { name: 123 }],
      ["empty", { name: "" }],
      ["whitespace-only", { name: "   " }],
    ])("should reject a %s name", async (_label, body) => {
      const response = await create(body);

      expect(response.statusCode).toBe(400);
      expect(await Cluster.countDocuments({})).toBe(0);
    });

    test("should reject a name longer than 100 characters", async () => {
      const response = await create({ name: "a".repeat(101) });

      expect(response.statusCode).toBe(400);
      expect(await Cluster.countDocuments({})).toBe(0);
    });

    test("should accept a name of exactly 100 characters", async () => {
      const response = await create({ name: "a".repeat(100) });

      expect(response.statusCode).toBe(201);
    });

    test("should reject non-array taskIds", async () => {
      const response = await create({
        name: "Bad Tasks",
        taskIds: task1._id.toString(),
      });

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toBe("taskIds must be an array");
    });

    test("should reject an invalid task ID", async () => {
      const response = await create({
        name: "Bad Id",
        taskIds: ["not-an-object-id"],
      });

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toBe("Invalid task ID");
    });

    test("should not create duplicate task memberships", async () => {
      const id = task1._id.toString();

      const response = await create({
        name: "Dupes",
        taskIds: [id, id, id.toUpperCase()],
      });

      expect(response.statusCode).toBe(201);

      const saved = await Cluster.findById(response.body._id);

      expect(saved.tasks).toHaveLength(1);
      expect(saved.tasks[0].toString()).toBe(id);
    });

    test("should not allow attaching another user's task", async () => {
      const response = await create({
        name: "Steal",
        taskIds: [otherTask._id.toString()],
      });

      expect(response.statusCode).toBe(403);
      expect(response.body.message).toBe(
        "One or more tasks do not belong to you"
      );
      expect(await Cluster.countDocuments({})).toBe(0);
    });

    test("should accept an empty taskIds array", async () => {
      const response = await create({ name: "Empty", taskIds: [] });

      expect(response.statusCode).toBe(201);
      expect(response.body.tasks).toEqual([]);
    });
  });

  describe("list clusters", () => {
    beforeEach(async () => {
      await Cluster.create([
        { name: "Mine A", ownerId: user._id, origin: "created" },
        { name: "Imported A", ownerId: user._id, origin: "imported" },
        { name: "Other Mine", ownerId: otherUser._id, origin: "created" },
        { name: "Other Imported", ownerId: otherUser._id, origin: "imported" },
      ]);
    });

    const list = (query = "") =>
      request(app)
        .get(`/api/clusters${query}`)
        .set("Cookie", authCookie(user._id));

    const names = (response) => response.body.map((c) => c.name).sort();

    test("should default to created and imported clusters", async () => {
      const response = await list();

      expect(response.statusCode).toBe(200);
      expect(names(response)).toEqual(["Imported A", "Mine A"]);
    });

    test("should return only created clusters for type=mine", async () => {
      const response = await list("?type=mine");

      expect(response.statusCode).toBe(200);
      expect(names(response)).toEqual(["Mine A"]);
    });

    test("should return only imported clusters for type=imported", async () => {
      const response = await list("?type=imported");

      expect(response.statusCode).toBe(200);
      expect(names(response)).toEqual(["Imported A"]);
    });

    test("should return both types for type=all", async () => {
      const response = await list("?type=all");

      expect(response.statusCode).toBe(200);
      expect(names(response)).toEqual(["Imported A", "Mine A"]);
    });

    test("should reject unsupported type values", async () => {
      const response = await list("?type=everything");

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toBe(
        "Invalid cluster type. Use mine, imported, or all."
      );
    });

    test("should never return another user's clusters", async () => {
      const response = await list("?type=all");

      response.body.forEach((cluster) => {
        expect(cluster.ownerId.toString()).toBe(user._id.toString());
      });
    });
  });

  describe("read a single cluster", () => {
    test("should return the user's own cluster with populated tasks", async () => {
      const cluster = await Cluster.create({
        name: "Readable",
        ownerId: user._id,
        tasks: [task1._id],
      });

      const response = await request(app)
        .get(`/api/clusters/${cluster._id}`)
        .set("Cookie", authCookie(user._id));

      expect(response.statusCode).toBe(200);
      expect(response.body.name).toBe("Readable");
      expect(response.body.tasks[0].title).toBe("Task 1");
    });

    test("should not return another user's cluster", async () => {
      const cluster = await Cluster.create({
        name: "Private",
        ownerId: otherUser._id,
      });

      const response = await request(app)
        .get(`/api/clusters/${cluster._id}`)
        .set("Cookie", authCookie(user._id));

      expect(response.statusCode).toBe(404);
      expect(response.body.message).toBe("Cluster not found");
    });

    test("should reject an invalid cluster ID", async () => {
      const response = await request(app)
        .get("/api/clusters/not-an-id")
        .set("Cookie", authCookie(user._id));

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toBe("Invalid cluster ID");
    });
  });

  describe("update cluster", () => {
    let cluster;

    const update = (id, body, userId = user._id) =>
      request(app)
        .put(`/api/clusters/${id}`)
        .set("Cookie", authCookie(userId))
        .send(body);

    beforeEach(async () => {
      cluster = await Cluster.create({
        name: "Original",
        ownerId: user._id,
        tasks: [task1._id],
        origin: "created",
      });
    });

    test("should update the name and task membership", async () => {
      const response = await update(cluster._id, {
        name: "  Renamed ",
        taskIds: [task2._id.toString()],
      });

      expect(response.statusCode).toBe(200);
      expect(response.body.name).toBe("Renamed");
      expect(response.body.tasks).toHaveLength(1);
      expect(response.body.tasks[0].title).toBe("Task 2");

      const saved = await Cluster.findById(cluster._id);

      expect(saved.name).toBe("Renamed");
      expect(saved.tasks.map(String)).toEqual([task2._id.toString()]);
    });

    test.each([
      ["empty", ""],
      ["whitespace-only", "   "],
      ["non-string", 42],
      ["too long", "a".repeat(101)],
    ])("should reject a %s name", async (_label, name) => {
      const response = await update(cluster._id, { name });

      expect(response.statusCode).toBe(400);

      const saved = await Cluster.findById(cluster._id);

      expect(saved.name).toBe("Original");
    });

    test("should reject an invalid task ID", async () => {
      const response = await update(cluster._id, {
        taskIds: ["bad-id"],
      });

      expect(response.statusCode).toBe(400);
      expect(response.body.message).toBe("Invalid task ID");
    });

    test("should not allow attaching another user's task", async () => {
      const response = await update(cluster._id, {
        taskIds: [otherTask._id.toString()],
      });

      expect(response.statusCode).toBe(403);

      const saved = await Cluster.findById(cluster._id);

      expect(saved.tasks.map(String)).toEqual([task1._id.toString()]);
    });

    test("should not allow updating another user's cluster", async () => {
      const response = await update(
        cluster._id,
        { name: "Hijacked" },
        otherUser._id
      );

      expect(response.statusCode).toBe(404);

      const saved = await Cluster.findById(cluster._id);

      expect(saved.name).toBe("Original");
    });

    test("should not allow editing an imported cluster", async () => {
      const imported = await Cluster.create({
        name: "Imported",
        ownerId: user._id,
        origin: "imported",
      });

      const response = await update(imported._id, { name: "Changed" });

      expect(response.statusCode).toBe(403);

      const saved = await Cluster.findById(imported._id);

      expect(saved.name).toBe("Imported");
    });

    test("should reject an invalid cluster ID", async () => {
      const response = await update("not-an-id", { name: "X" });

      expect(response.statusCode).toBe(400);
    });
  });

  describe("delete cluster", () => {
    const remove = (id, userId = user._id) =>
      request(app)
        .delete(`/api/clusters/${id}`)
        .set("Cookie", authCookie(userId));

    test("should delete the user's own created cluster", async () => {
      const cluster = await Cluster.create({
        name: "Delete Me",
        ownerId: user._id,
        origin: "created",
      });

      const response = await remove(cluster._id);

      expect(response.statusCode).toBe(200);
      expect(response.body.message).toBe("Cluster deleted successfully");
      expect(await Cluster.findById(cluster._id)).toBeNull();
    });

    test("should leave the cluster's tasks intact", async () => {
      const cluster = await Cluster.create({
        name: "With Tasks",
        ownerId: user._id,
        tasks: [task1._id, task2._id],
        origin: "created",
      });

      const response = await remove(cluster._id);

      expect(response.statusCode).toBe(200);
      expect(await Task.findById(task1._id)).not.toBeNull();
      expect(await Task.findById(task2._id)).not.toBeNull();
    });

    test("should not allow deleting another user's cluster", async () => {
      const cluster = await Cluster.create({
        name: "Not Yours",
        ownerId: otherUser._id,
        origin: "created",
      });

      const response = await remove(cluster._id);

      expect(response.statusCode).toBe(404);
      expect(await Cluster.findById(cluster._id)).not.toBeNull();
    });

    test("should not allow deleting an imported cluster", async () => {
      const cluster = await Cluster.create({
        name: "Imported",
        ownerId: user._id,
        origin: "imported",
      });

      const response = await remove(cluster._id);

      expect(response.statusCode).toBe(404);
      expect(await Cluster.findById(cluster._id)).not.toBeNull();
    });

    test("should reject an invalid cluster ID", async () => {
      const response = await remove("not-an-id");

      expect(response.statusCode).toBe(400);
    });
  });
});
