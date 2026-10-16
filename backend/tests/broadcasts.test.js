const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/user");
const Task = require("../models/task");
const Cluster = require("../models/cluster");
const Broadcast = require("../models/broadcast");
const BroadcastImport = require("../models/broadcastImport");

const createToken = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
const authCookie = (userId) => `token=${createToken(userId)}`;

describe("Cluster broadcast and import API", () => {
  let owner;
  let importer;
  let task1;
  let task2;
  let cluster;
  let code;

  beforeEach(async () => {
    await BroadcastImport.deleteMany({});
    await Broadcast.deleteMany({});
    await Cluster.deleteMany({});
    await Task.deleteMany({});
    await User.deleteMany({});

    owner = await User.create({
      googleId: `broadcast-owner-${Date.now()}`,
      name: "Broadcast Owner",
      email: `broadcast-owner-${Date.now()}@example.com`,
      picture: "",
    });
    importer = await User.create({
      googleId: `broadcast-importer-${Date.now()}`,
      name: "Importer",
      email: `broadcast-importer-${Date.now()}@example.com`,
      picture: "",
    });
    [task1, task2] = await Task.create([
      { title: "Algorithms Exam", deadline: "2026-12-01", priority: "high", deadlineType: "exam", reminderEnabled: true, userId: owner._id },
      { title: "Database Assignment", deadline: "2026-12-05", priority: "medium", deadlineType: "assignment", userId: owner._id },
    ]);
    cluster = await Cluster.create({ name: "Exam Prep", ownerId: owner._id, tasks: [task1._id, task2._id], origin: "created" });

    const response = await request(app)
      .post(`/api/clusters/${cluster._id}/broadcast`)
      .set("Cookie", authCookie(owner._id))
      .send({ taskIds: [task1._id.toString()], description: "My revision plan" });
    expect(response.statusCode).toBe(201);
    code = response.body.code;
  });

  test("publishes only selected tasks and allows search by name or code", async () => {
    const preview = await request(app).get(`/api/broadcasts/${code}`);
    expect(preview.statusCode).toBe(200);
    expect(preview.body.name).toBe("Exam Prep");
    expect(preview.body.tasks).toHaveLength(1);
    expect(preview.body.tasks[0].title).toBe("Algorithms Exam");
    expect(preview.body.tasks[0].reminderEnabled).toBeUndefined();

    const byName = await request(app).get("/api/broadcasts?q=exam");
    expect(byName.statusCode).toBe(200);
    expect(byName.body).toHaveLength(1);

    const byCode = await request(app).get(`/api/broadcasts?q=${code.toLowerCase()}`);
    expect(byCode.body).toHaveLength(1);
  });

  test("lists only the current user's shared links and requires authentication", async () => {
    const unauthenticated = await request(app).get("/api/broadcasts/mine");
    expect(unauthenticated.statusCode).toBe(401);

    const ownerResponse = await request(app)
      .get("/api/broadcasts/mine")
      .set("Cookie", authCookie(owner._id));
    expect(ownerResponse.statusCode).toBe(200);
    expect(ownerResponse.body).toHaveLength(1);
    expect(ownerResponse.body[0].code).toBe(code);

    const importerResponse = await request(app)
      .get("/api/broadcasts/mine")
      .set("Cookie", authCookie(importer._id));
    expect(importerResponse.statusCode).toBe(200);
    expect(importerResponse.body).toHaveLength(0);
  });

  test("rejects unauthenticated imports", async () => {
    const response = await request(app).post(`/api/broadcasts/${code}/import`).send({
      taskIds: [task1._id.toString()], mode: "cluster", reminderEnabled: false,
    });
    expect(response.statusCode).toBe(401);
  });

  test("imports selected tasks as user-owned copies and honours reminder preference", async () => {
    const response = await request(app)
      .post(`/api/broadcasts/${code}/import`)
      .set("Cookie", authCookie(importer._id))
      .send({ taskIds: [task1._id.toString()], mode: "cluster", reminderEnabled: false });

    expect(response.statusCode).toBe(201);
    expect(response.body.cluster.origin).toBe("imported");
    expect(response.body.cluster.tasks).toHaveLength(1);
    expect(response.body.cluster.tasks[0].title).toBe("Algorithms Exam");
    expect(response.body.cluster.tasks[0].userId.toString()).toBe(importer._id.toString());
    expect(response.body.cluster.tasks[0].reminderEnabled).toBe(false);
    expect(await Task.countDocuments({ userId: importer._id })).toBe(1);
    expect(await Task.countDocuments({ userId: owner._id })).toBe(2);
  });

  test("supports importing selected deadlines directly into the task list", async () => {
    const response = await request(app)
      .post(`/api/broadcasts/${code}/import`)
      .set("Cookie", authCookie(importer._id))
      .send({ taskIds: [task1._id.toString()], mode: "tasks", reminderEnabled: true });

    expect(response.statusCode).toBe(201);
    expect(response.body.cluster).toBeNull();
    expect(response.body.tasks).toHaveLength(1);
    expect(response.body.tasks[0].reminderEnabled).toBe(true);
    expect(await Cluster.countDocuments({ ownerId: importer._id })).toBe(0);
  });

  test("is idempotent: retrying an import does not create duplicate tasks", async () => {
    const payload = { taskIds: [task1._id.toString()], mode: "cluster", reminderEnabled: false };
    const first = await request(app).post(`/api/broadcasts/${code}/import`).set("Cookie", authCookie(importer._id)).send(payload);
    const retry = await request(app).post(`/api/broadcasts/${code}/import`).set("Cookie", authCookie(importer._id)).send(payload);

    expect(first.statusCode).toBe(201);
    expect(retry.statusCode).toBe(200);
    expect(retry.body.alreadyImported).toBe(true);
    expect(await Task.countDocuments({ userId: importer._id })).toBe(1);
    expect(await Cluster.countDocuments({ ownerId: importer._id })).toBe(1);
  });

  test("rejects tasks not included in the broadcast", async () => {
    const response = await request(app)
      .post(`/api/broadcasts/${code}/import`)
      .set("Cookie", authCookie(importer._id))
      .send({ taskIds: [task2._id.toString()], mode: "cluster" });
    expect(response.statusCode).toBe(400);
  });

  test("only the owner can revoke a broadcast, and revoked broadcasts cannot be found or imported", async () => {
    const broadcast = await Broadcast.findOne({ code });
    const forbidden = await request(app)
      .post(`/api/broadcasts/${broadcast._id}/revoke`)
      .set("Cookie", authCookie(importer._id));
    expect(forbidden.statusCode).toBe(404);

    const revoked = await request(app)
      .post(`/api/broadcasts/${broadcast._id}/revoke`)
      .set("Cookie", authCookie(owner._id));
    expect(revoked.statusCode).toBe(200);

    const preview = await request(app).get(`/api/broadcasts/${code}`);
    expect(preview.statusCode).toBe(404);
    const imported = await request(app)
      .post(`/api/broadcasts/${code}/import`)
      .set("Cookie", authCookie(importer._id))
      .send({ taskIds: [task1._id.toString()], mode: "cluster" });
    expect(imported.statusCode).toBe(404);
  });

  test("cannot broadcast an imported cluster", async () => {
    const importedCluster = await Cluster.create({ name: "Imported", ownerId: owner._id, tasks: [task1._id], origin: "imported" });
    const response = await request(app)
      .post(`/api/clusters/${importedCluster._id}/broadcast`)
      .set("Cookie", authCookie(owner._id))
      .send({ taskIds: [task1._id.toString()] });
    expect(response.statusCode).toBe(403);
  });
});
