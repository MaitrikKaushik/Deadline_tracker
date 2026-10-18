const request = require("supertest");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const app = require("../app");
const User = require("../models/user");
const Task = require("../models/task");
const Cluster = require("../models/cluster");
const Broadcast = require("../models/broadcast");
const BroadcastImport = require("../models/broadcastImport");
const { STALE_IMPORT_MS } = require("../controllers/broadcastController");

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

describe("Broadcast publishing, import mapping and recovery", () => {
  let owner;
  let importer;
  let other;
  let alpha;
  let beta;
  let gamma;
  let cluster;
  let code;
  let broadcast;

  const post = (path, userId, body) =>
    request(app).post(path).set("Cookie", authCookie(userId)).send(body);

  const importAs = (userId, body) => post(`/api/broadcasts/${code}/import`, userId, body);

  const ids = (...tasks) => tasks.map((task) => task._id.toString());

  // Simulates an import whose request died after planning (and optionally
  // after creating its artifacts), leaving a "processing" record behind.
  const createInterruptedImport = async ({
    ageMs,
    withArtifacts = true,
    mode = "cluster",
    legacy = false,
  }) => {
    const plannedTaskIds = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const plannedClusterId = mode === "cluster" ? new mongoose.Types.ObjectId() : null;
    const startedAt = new Date(Date.now() - ageMs);

    const record = await BroadcastImport.create({
      broadcastId: broadcast._id,
      importerId: importer._id,
      mode,
      selectedSourceTaskIds: ids(alpha, beta),
      reminderEnabled: false,
      status: "processing",
      taskMappings: legacy
        ? []
        : [
            { sourceTaskId: alpha._id, importedTaskId: plannedTaskIds[0] },
            { sourceTaskId: beta._id, importedTaskId: plannedTaskIds[1] },
          ],
      plannedClusterId: legacy ? null : plannedClusterId,
      claimId: legacy ? null : "dead-request",
      processingStartedAt: legacy ? null : startedAt,
    });

    if (legacy) {
      // Old-format record: no processingStartedAt, so createdAt is the clock.
      await BroadcastImport.collection.updateOne({ _id: record._id }, { $set: { createdAt: startedAt } });
    }

    if (withArtifacts && !legacy) {
      await Task.create(
        plannedTaskIds.map((_id, index) => ({
          _id,
          title: `Orphan ${index}`,
          deadline: "2026-12-01",
          userId: importer._id,
        }))
      );
      if (plannedClusterId) {
        await Cluster.create({
          _id: plannedClusterId,
          name: "Orphan cluster",
          ownerId: importer._id,
          tasks: plannedTaskIds,
          origin: "imported",
          sourceBroadcastId: broadcast._id,
        });
      }
    }

    return { record, plannedTaskIds, plannedClusterId };
  };

  beforeEach(async () => {
    jest.restoreAllMocks();
    await BroadcastImport.deleteMany({});
    await Broadcast.deleteMany({});
    await Cluster.deleteMany({});
    await Task.deleteMany({});
    await User.deleteMany({});

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    [owner, importer, other] = await User.create(
      ["owner", "importer", "other"].map((name) => ({
        googleId: `hardening-${name}-${stamp}`,
        name,
        email: `hardening-${name}-${stamp}@example.com`,
        picture: "",
      }))
    );

    [alpha, beta, gamma] = await Task.create([
      { title: "Alpha", deadline: "2026-12-01", priority: "high", deadlineType: "exam", userId: owner._id },
      { title: "Beta", deadline: "2026-12-05", priority: "low", deadlineType: "work", userId: owner._id },
      { title: "Gamma", deadline: "2026-12-09", priority: "medium", deadlineType: "assignment", userId: owner._id },
    ]);
    cluster = await Cluster.create({
      name: "Hardening",
      ownerId: owner._id,
      tasks: [alpha._id, beta._id, gamma._id],
      origin: "created",
    });

    const published = await post(`/api/clusters/${cluster._id}/broadcast`, owner._id, {
      taskIds: ids(alpha, beta, gamma),
      description: "All three",
    });
    expect(published.statusCode).toBe(201);
    code = published.body.code;
    broadcast = await Broadcast.findOne({ code });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("publishing", () => {
    test("publishes only the selected deadlines and exposes no private data", async () => {
      const published = await post(`/api/clusters/${cluster._id}/broadcast`, owner._id, {
        taskIds: ids(beta),
      });
      expect(published.statusCode).toBe(201);

      const preview = await request(app).get(`/api/broadcasts/${published.body.code}`);

      expect(preview.statusCode).toBe(200);
      expect(preview.body.tasks.map((task) => task.title)).toEqual(["Beta"]);
      expect(JSON.stringify(preview.body)).not.toMatch(/Alpha|Gamma/);

      const json = JSON.stringify(preview.body);
      expect(json).not.toContain(owner._id.toString());
      expect(preview.body.ownerId).toBeUndefined();
      expect(preview.body.tasks[0].userId).toBeUndefined();
      expect(preview.body.tasks[0].reminderEnabled).toBeUndefined();
      expect(preview.body.tasks[0].sourceTaskId).toBe(beta._id.toString());
    });

    test("a user cannot publish someone else's cluster", async () => {
      const response = await post(`/api/clusters/${cluster._id}/broadcast`, other._id, {
        taskIds: ids(alpha),
      });

      expect(response.statusCode).toBe(404);
    });

    test("rejects empty selections, over-long descriptions and tasks outside the cluster", async () => {
      const empty = await post(`/api/clusters/${cluster._id}/broadcast`, owner._id, { taskIds: [] });
      const longDescription = await post(`/api/clusters/${cluster._id}/broadcast`, owner._id, {
        taskIds: ids(alpha),
        description: "x".repeat(501),
      });
      const outsider = await Task.create({ title: "Not in cluster", deadline: "2026-12-01", userId: owner._id });
      const notInCluster = await post(`/api/clusters/${cluster._id}/broadcast`, owner._id, {
        taskIds: ids(outsider),
      });

      expect(empty.statusCode).toBe(400);
      expect(longDescription.statusCode).toBe(400);
      expect(notInCluster.statusCode).toBe(400);
    });

    test("refuses to publish a task owned by another user even if it sits in the cluster", async () => {
      const foreign = await Task.create({ title: "Foreign", deadline: "2026-12-01", userId: other._id });
      await Cluster.updateOne({ _id: cluster._id }, { $push: { tasks: foreign._id } });

      const response = await post(`/api/clusters/${cluster._id}/broadcast`, owner._id, {
        taskIds: ids(foreign),
      });

      expect(response.statusCode).toBe(403);
      expect(await Broadcast.countDocuments({ sourceClusterId: cluster._id })).toBe(1);
    });

    test("search rejects over-long queries and never lists revoked broadcasts", async () => {
      const tooLong = await request(app).get(`/api/broadcasts?q=${"a".repeat(101)}`);
      expect(tooLong.statusCode).toBe(400);

      await post(`/api/broadcasts/${broadcast._id}/revoke`, owner._id, {});

      const results = await request(app).get("/api/broadcasts?q=hardening");
      expect(results.body).toHaveLength(0);
    });
  });

  describe("import validation and ownership", () => {
    test.each([
      ["an invalid mode", { taskIds: [], mode: "bogus" }],
      ["no deadlines", { taskIds: [], mode: "cluster" }],
      ["a malformed task ID", { taskIds: ["nope"], mode: "cluster" }],
    ])("rejects %s", async (_label, body) => {
      const response = await importAs(importer._id, {
        ...body,
        taskIds: body.taskIds.length ? body.taskIds : body.mode === "bogus" ? ids(alpha) : [],
      });

      expect(response.statusCode).toBe(400);
      expect(await BroadcastImport.countDocuments({})).toBe(0);
    });

    test("rejects a non-boolean reminderEnabled", async () => {
      const response = await importAs(importer._id, {
        taskIds: ids(alpha),
        mode: "tasks",
        reminderEnabled: "true",
      });

      expect(response.statusCode).toBe(400);
      expect(await Task.countDocuments({ userId: importer._id })).toBe(0);
    });

    test("reminders default to disabled when the field is omitted", async () => {
      const response = await importAs(importer._id, { taskIds: ids(alpha), mode: "tasks" });

      expect(response.statusCode).toBe(201);
      expect(response.body.tasks[0].reminderEnabled).toBe(false);
    });

    test("imported tasks belong to the importer and are independent copies", async () => {
      const before = await Task.find({ userId: owner._id }).lean();

      const response = await importAs(importer._id, {
        taskIds: ids(alpha, beta),
        mode: "tasks",
        reminderEnabled: true,
      });

      expect(response.statusCode).toBe(201);

      const copies = await Task.find({ userId: importer._id });
      expect(copies).toHaveLength(2);
      copies.forEach((copy) => {
        expect(copy.userId.toString()).toBe(importer._id.toString());
        expect([alpha._id.toString(), beta._id.toString()]).not.toContain(copy._id.toString());
        expect(copy.reminderEnabled).toBe(true);
        expect(copy.status).toBe("pending");
      });

      // The importer editing a copy never touches the owner's task.
      const copy = copies.find((task) => task.title === "Alpha");
      const edit = await request(app)
        .put(`/api/tasks/${copy._id}`)
        .set("Cookie", authCookie(importer._id))
        .send({ title: "Edited by importer" });
      expect(edit.statusCode).toBe(200);

      const after = await Task.find({ userId: owner._id }).lean();
      expect(after).toEqual(before);
    });

    test("an importer cannot import a deadline from a different broadcast", async () => {
      const outsider = await Task.create({ title: "Elsewhere", deadline: "2026-12-01", userId: owner._id });

      const response = await importAs(importer._id, { taskIds: ids(outsider), mode: "cluster" });

      expect(response.statusCode).toBe(400);
    });

    test("revoked broadcasts cannot be previewed or newly imported", async () => {
      await post(`/api/broadcasts/${broadcast._id}/revoke`, owner._id, {});

      const preview = await request(app).get(`/api/broadcasts/${code}`);
      const attempt = await importAs(importer._id, { taskIds: ids(alpha), mode: "cluster" });

      expect(preview.statusCode).toBe(404);
      expect(attempt.statusCode).toBe(404);
      expect(await Task.countDocuments({ userId: importer._id })).toBe(0);
    });
  });

  describe("source to imported task mapping", () => {
    test("maps each source deadline to its own copy when selection order differs from snapshot order", async () => {
      // Snapshot order is Alpha, Beta, Gamma. Select in reverse-ish order.
      const response = await importAs(importer._id, {
        taskIds: ids(gamma, alpha),
        mode: "cluster",
      });

      expect(response.statusCode).toBe(201);

      const record = await BroadcastImport.findOne({ broadcastId: broadcast._id, importerId: importer._id });

      // The two legacy arrays are NOT in the same order...
      expect(record.selectedSourceTaskIds.map(String)).toEqual(ids(gamma, alpha));
      // ...so the explicit mapping is what identifies the pairs.
      expect(record.taskMappings).toHaveLength(2);

      const titleBySource = new Map(
        [alpha, beta, gamma].map((task) => [task._id.toString(), task.title])
      );

      for (const mapping of record.taskMappings) {
        const copy = await Task.findById(mapping.importedTaskId);
        expect(copy.title).toBe(titleBySource.get(mapping.sourceTaskId.toString()));
        expect(copy.userId.toString()).toBe(importer._id.toString());
      }

      expect(record.taskMappings.map((m) => m.sourceTaskId.toString()).sort()).toEqual(
        ids(alpha, gamma).sort()
      );
      expect(record.importedTaskIds.map(String).sort()).toEqual(
        record.taskMappings.map((m) => m.importedTaskId.toString()).sort()
      );

      // The response exposes the same mapping.
      expect(response.body.mappings).toHaveLength(2);
      for (const mapping of response.body.mappings) {
        const copy = response.body.tasks.find((task) => task._id === mapping.importedTaskId);
        expect(copy.title).toBe(titleBySource.get(mapping.sourceTaskId));
      }

      // The imported cluster holds exactly the mapped copies.
      expect(response.body.cluster.tasks.map((task) => task._id).sort()).toEqual(
        record.taskMappings.map((m) => m.importedTaskId.toString()).sort()
      );
    });

    test("an idempotent retry with a different selection returns the original result unchanged", async () => {
      const first = await importAs(importer._id, { taskIds: ids(alpha), mode: "cluster", reminderEnabled: false });
      const retry = await importAs(importer._id, { taskIds: ids(beta, gamma), mode: "tasks", reminderEnabled: true });

      expect(first.statusCode).toBe(201);
      expect(retry.statusCode).toBe(200);
      expect(retry.body.alreadyImported).toBe(true);
      expect(retry.body.mode).toBe("cluster");
      expect(retry.body.selectedSourceTaskIds).toEqual(ids(alpha));
      expect(retry.body.mappings).toHaveLength(1);
      expect(retry.body.tasks.map((task) => task.title)).toEqual(["Alpha"]);

      expect(await Task.countDocuments({ userId: importer._id })).toBe(1);
      expect(await Cluster.countDocuments({ ownerId: importer._id })).toBe(1);
      expect(await BroadcastImport.countDocuments({})).toBe(1);
    });
  });

  describe("interrupted and concurrent imports", () => {
    let unrelatedTask;
    let unrelatedCluster;

    beforeEach(async () => {
      unrelatedTask = await Task.create({ title: "My own task", deadline: "2026-12-01", userId: importer._id });
      unrelatedCluster = await Cluster.create({
        name: "My own imported cluster",
        ownerId: importer._id,
        tasks: [unrelatedTask._id],
        origin: "imported",
        sourceBroadcastId: new mongoose.Types.ObjectId(),
      });
    });

    const expectUnrelatedIntact = async () => {
      expect(await Task.findById(unrelatedTask._id)).not.toBeNull();
      expect(await Cluster.findById(unrelatedCluster._id)).not.toBeNull();
    };

    test("a stale processing import is reclaimed: orphans are removed and the import completes", async () => {
      const { plannedTaskIds, plannedClusterId } = await createInterruptedImport({
        ageMs: STALE_IMPORT_MS + 60 * 1000,
      });

      const response = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(response.statusCode).toBe(201);
      expect(response.body.alreadyImported).toBe(false);

      // The dead attempt's planned artifacts are gone...
      expect(await Task.countDocuments({ _id: { $in: plannedTaskIds } })).toBe(0);
      expect(await Cluster.findById(plannedClusterId)).toBeNull();

      // ...replaced by exactly one fresh set, and nothing else changed.
      expect(await Task.countDocuments({ userId: importer._id })).toBe(3); // unrelated + 2 copies
      expect(await Cluster.countDocuments({ ownerId: importer._id })).toBe(2); // unrelated + new
      expect(await BroadcastImport.countDocuments({})).toBe(1);

      const record = await BroadcastImport.findOne({});
      expect(record.status).toBe("completed");
      expect(record.claimId).not.toBe("dead-request");
      await expectUnrelatedIntact();
    });

    test("a recent processing import is not reclaimed", async () => {
      const { plannedTaskIds, plannedClusterId, record } = await createInterruptedImport({
        ageMs: STALE_IMPORT_MS - 60 * 1000,
      });

      const response = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(response.statusCode).toBe(409);
      expect(await Task.countDocuments({ _id: { $in: plannedTaskIds } })).toBe(2);
      expect(await Cluster.findById(plannedClusterId)).not.toBeNull();

      const unchanged = await BroadcastImport.findById(record._id);
      expect(unchanged.claimId).toBe("dead-request");
      expect(unchanged.status).toBe("processing");
    });

    test("an old-format record without processingStartedAt is judged by createdAt", async () => {
      await createInterruptedImport({ ageMs: STALE_IMPORT_MS + 60 * 1000, legacy: true });

      const response = await importAs(importer._id, { taskIds: ids(alpha), mode: "tasks" });

      expect(response.statusCode).toBe(201);
      expect(await Task.countDocuments({ userId: importer._id })).toBe(2);
      await expectUnrelatedIntact();
    });

    test("recovery of an interrupted import that created nothing is a harmless no-op cleanup", async () => {
      await createInterruptedImport({ ageMs: STALE_IMPORT_MS + 60 * 1000, withArtifacts: false });

      const response = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(response.statusCode).toBe(201);
      await expectUnrelatedIntact();
    });

    test("recovery only deletes the importer's own planned artifacts", async () => {
      const { plannedTaskIds } = await createInterruptedImport({
        ageMs: STALE_IMPORT_MS + 60 * 1000,
        withArtifacts: false,
      });

      // A planned ID that (corruptly) points at someone else's task.
      await Task.create({ _id: plannedTaskIds[0], title: "Owner's task", deadline: "2026-12-01", userId: owner._id });

      const response = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "tasks" });

      expect(response.statusCode).toBe(201);
      const survivor = await Task.findById(plannedTaskIds[0]);
      expect(survivor).not.toBeNull();
      expect(survivor.userId.toString()).toBe(owner._id.toString());
    });

    // NOTE: this relies on MongoDB's guarantee that findOneAndUpdate is atomic
    // for a single document (which MongoDB Memory Server provides). MongoDB-
    // compatible emulators such as FerretDB do not guarantee it, and can let
    // both requests win. The deterministic tests below cover the same logic.
    test("two simultaneous retries cannot both reclaim the same stale record", async () => {
      const { plannedTaskIds, plannedClusterId } = await createInterruptedImport({ ageMs: STALE_IMPORT_MS + 60 * 1000 });

      const payload = { taskIds: ids(alpha, beta), mode: "cluster" };
      const [first, second] = await Promise.all([importAs(importer._id, payload), importAs(importer._id, payload)]);

      const statuses = [first.statusCode, second.statusCode].sort();
      expect(statuses.filter((status) => status === 201)).toHaveLength(1);
      expect(statuses.every((status) => [200, 201, 409].includes(status))).toBe(true);

      // Whatever the interleaving, exactly one set of copies exists.
      expect(await Task.countDocuments({ userId: importer._id })).toBe(3); // unrelated + 2 copies
      expect(await Cluster.countDocuments({ ownerId: importer._id, sourceBroadcastId: broadcast._id })).toBe(1);
      expect(await BroadcastImport.countDocuments({})).toBe(1);

      // Neither request deleted the other's artifacts: the completed record's
      // copies and cluster all exist, and the dead attempt's orphans are gone.
      const finished = await BroadcastImport.findOne({});
      expect(finished.status).toBe("completed");
      expect(await Task.countDocuments({ _id: { $in: finished.importedTaskIds } })).toBe(2);
      expect(await Cluster.findById(finished.importedClusterId)).not.toBeNull();
      expect(await Task.countDocuments({ _id: { $in: plannedTaskIds } })).toBe(0);
      expect(await Cluster.findById(plannedClusterId)).toBeNull();
      await expectUnrelatedIntact();
    });

    test("a retry that loses the atomic claim re-reads the record and reports it in progress", async () => {
      const { record } = await createInterruptedImport({ ageMs: STALE_IMPORT_MS + 60 * 1000 });
      const staleSnapshot = await BroadcastImport.findById(record._id);

      // Another request wins the race: the stored record is now freshly owned.
      await BroadcastImport.updateOne(
        { _id: record._id },
        { $set: { claimId: "winner", processingStartedAt: new Date() } }
      );

      jest.spyOn(BroadcastImport, "findOne").mockImplementationOnce(() => Promise.resolve(staleSnapshot));

      const response = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(response.statusCode).toBe(409);
      expect(response.body.message).toMatch(/still processing/i);

      const unchanged = await BroadcastImport.findById(record._id);
      expect(unchanged.claimId).toBe("winner");
      // The loser neither created nor deleted anything.
      expect(await Task.countDocuments({ userId: importer._id })).toBe(3); // unrelated + 2 orphans of the "winner"
    });

    test("a retry that loses the claim to a request that already finished returns the completed result", async () => {
      const { record } = await createInterruptedImport({ ageMs: STALE_IMPORT_MS + 60 * 1000, withArtifacts: false });
      const staleSnapshot = await BroadcastImport.findById(record._id);

      const finishedTask = await Task.create({ title: "Alpha", deadline: "2026-12-01", userId: importer._id });
      await BroadcastImport.updateOne(
        { _id: record._id },
        {
          $set: {
            claimId: "winner",
            status: "completed",
            mode: "tasks",
            importedTaskIds: [finishedTask._id],
            taskMappings: [{ sourceTaskId: alpha._id, importedTaskId: finishedTask._id }],
          },
        }
      );

      jest.spyOn(BroadcastImport, "findOne").mockImplementationOnce(() => Promise.resolve(staleSnapshot));

      const response = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(response.statusCode).toBe(200);
      expect(response.body.alreadyImported).toBe(true);
      expect(response.body.tasks.map((task) => task._id)).toEqual([finishedTask._id.toString()]);
      expect(await Task.countDocuments({ userId: importer._id })).toBe(2); // unrelated + finished
    });

    test("a failure part-way through rolls back only this import and leaves the user able to retry", async () => {
      jest.spyOn(Cluster, "create").mockRejectedValueOnce(new Error("simulated crash"));

      const failed = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(failed.statusCode).toBe(500);
      expect(await Task.countDocuments({ userId: importer._id })).toBe(1); // only the unrelated task
      expect(await BroadcastImport.countDocuments({})).toBe(0);
      await expectUnrelatedIntact();

      const retry = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(retry.statusCode).toBe(201);
      expect(await Task.countDocuments({ userId: importer._id })).toBe(3);
    });

    test("a request that lost its claim mid-flight cannot complete and deletes nothing; a later recovery cleans up its stored plan", async () => {
      const realInsertMany = Task.insertMany.bind(Task);

      // While this request is creating tasks, a newer retry takes the record over.
      jest.spyOn(Task, "insertMany").mockImplementationOnce(async (...args) => {
        await BroadcastImport.updateOne(
          { broadcastId: broadcast._id, importerId: importer._id },
          { $set: { claimId: "taken-over" } }
        );
        return realInsertMany(...args);
      });

      const response = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(response.statusCode).toBe(409);

      const record = await BroadcastImport.findOne({ broadcastId: broadcast._id, importerId: importer._id });
      expect(record.claimId).toBe("taken-over");
      expect(record.status).toBe("processing");

      // The superseded request deleted NOTHING: its copies and cluster remain,
      // and the stored plan still lists them for the new owner to clean up.
      const plannedIds = record.taskMappings.map((mapping) => mapping.importedTaskId);
      expect(plannedIds).toHaveLength(2);
      expect(await Task.countDocuments({ _id: { $in: plannedIds } })).toBe(2);
      expect(await Cluster.findById(record.plannedClusterId)).not.toBeNull();
      await expectUnrelatedIntact();

      // Once that owner is gone too (stale), a retry removes exactly those
      // artifacts through the stored plan and completes.
      await BroadcastImport.updateOne(
        { _id: record._id },
        { $set: { processingStartedAt: new Date(Date.now() - STALE_IMPORT_MS - 60 * 1000) } }
      );

      const retry = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(retry.statusCode).toBe(201);
      expect(await Task.countDocuments({ _id: { $in: plannedIds } })).toBe(0);
      expect(await Task.countDocuments({ userId: importer._id })).toBe(3); // unrelated + 2 fresh copies
      expect(await Cluster.countDocuments({ ownerId: importer._id, sourceBroadcastId: broadcast._id })).toBe(1);
      await expectUnrelatedIntact();
    });

    test("an error while populating the cluster rolls the whole import back, and a retry creates no duplicates", async () => {
      const realCreate = Cluster.create.bind(Cluster);

      jest.spyOn(Cluster, "create").mockImplementationOnce(async (...args) => {
        const created = await realCreate(...args);
        created.populate = jest.fn().mockRejectedValue(new Error("populate failed"));
        return created;
      });

      const failed = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(failed.statusCode).toBe(500);

      // The import never completed, so everything it created is gone.
      expect(await Task.countDocuments({ userId: importer._id })).toBe(1); // only the unrelated task
      expect(await Cluster.countDocuments({ ownerId: importer._id })).toBe(1); // only the unrelated cluster
      expect(await BroadcastImport.countDocuments({})).toBe(0);
      await expectUnrelatedIntact();

      const retry = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(retry.statusCode).toBe(201);
      expect(await Task.countDocuments({ userId: importer._id })).toBe(3); // unrelated + exactly 2 copies
      expect(await Cluster.countDocuments({ ownerId: importer._id, sourceBroadcastId: broadcast._id })).toBe(1);
      expect(await BroadcastImport.countDocuments({ status: "completed" })).toBe(1);
    });

    test("a failure after the import completed never rolls back the completed import", async () => {
      const realFindOneAndUpdate = BroadcastImport.findOneAndUpdate.bind(BroadcastImport);

      // The real completion write happens, then something else goes wrong.
      jest.spyOn(BroadcastImport, "findOneAndUpdate").mockImplementationOnce(async (...args) => {
        await realFindOneAndUpdate(...args);
        throw new Error("failure after completion");
      });

      const response = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(response.statusCode).toBe(500);

      // The completed import keeps its record, its tasks and its cluster.
      const record = await BroadcastImport.findOne({ broadcastId: broadcast._id, importerId: importer._id });
      expect(record).not.toBeNull();
      expect(record.status).toBe("completed");
      expect(record.importedTaskIds).toHaveLength(2);
      expect(await Task.countDocuments({ _id: { $in: record.importedTaskIds } })).toBe(2);
      expect(await Cluster.findById(record.importedClusterId)).not.toBeNull();
      await expectUnrelatedIntact();

      // A retry returns that same result instead of importing again.
      const retry = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(retry.statusCode).toBe(200);
      expect(retry.body.alreadyImported).toBe(true);
      expect(retry.body.tasks.map((task) => task._id).sort()).toEqual(
        record.importedTaskIds.map(String).sort()
      );
      expect(await Task.countDocuments({ userId: importer._id })).toBe(3);
      expect(await Cluster.countDocuments({ ownerId: importer._id, sourceBroadcastId: broadcast._id })).toBe(1);
      expect(await BroadcastImport.countDocuments({})).toBe(1);
    });

    test("the previous recovery plan stays persisted while the old artifacts are being cleaned up", async () => {
      const { record, plannedTaskIds, plannedClusterId } = await createInterruptedImport({
        ageMs: STALE_IMPORT_MS + 60 * 1000,
      });

      const realDeleteMany = Task.deleteMany.bind(Task);
      let duringCleanup = null;

      // Look at the real database at the moment the old tasks are deleted.
      jest.spyOn(Task, "deleteMany").mockImplementationOnce(async (...args) => {
        duringCleanup = await BroadcastImport.findById(record._id).lean();
        return realDeleteMany(...args);
      });

      // A different selection, so the new plan visibly differs from the old.
      const response = await importAs(importer._id, { taskIds: ids(gamma), mode: "cluster" });

      expect(response.statusCode).toBe(201);

      // Ownership was already claimed, but the OLD plan was still on disk.
      expect(duringCleanup.status).toBe("processing");
      expect(duringCleanup.claimId).not.toBe("dead-request");
      expect(duringCleanup.taskMappings.map((m) => String(m.importedTaskId))).toEqual(
        plannedTaskIds.map(String)
      );
      expect(String(duringCleanup.plannedClusterId)).toBe(String(plannedClusterId));

      // Only after cleanup was the new plan installed.
      const after = await BroadcastImport.findById(record._id);
      expect(after.status).toBe("completed");
      expect(after.taskMappings).toHaveLength(1);
      expect(String(after.taskMappings[0].sourceTaskId)).toBe(String(gamma._id));
      expect(await Task.countDocuments({ _id: { $in: plannedTaskIds } })).toBe(0);
      await expectUnrelatedIntact();
    });

    test("if cleanup of the previous attempt fails, the record and its plan are kept and a retry recovers", async () => {
      const { record, plannedTaskIds, plannedClusterId } = await createInterruptedImport({
        ageMs: STALE_IMPORT_MS + 60 * 1000,
      });

      jest.spyOn(Task, "deleteMany").mockRejectedValueOnce(new Error("disk full"));

      const failed = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(failed.statusCode).toBe(500);

      // The record and its original recovery plan survive untouched.
      const preserved = await BroadcastImport.findById(record._id);
      expect(preserved).not.toBeNull();
      expect(preserved.status).toBe("processing");
      expect(preserved.taskMappings.map((m) => String(m.importedTaskId))).toEqual(plannedTaskIds.map(String));
      expect(String(preserved.plannedClusterId)).toBe(String(plannedClusterId));

      // Nothing was created and nothing was deleted.
      expect(await Task.countDocuments({ _id: { $in: plannedTaskIds } })).toBe(2);
      expect(await Cluster.findById(plannedClusterId)).not.toBeNull();
      expect(await Task.countDocuments({ userId: importer._id })).toBe(3); // unrelated + 2 orphans

      // An immediate retry repeats the cleanup and completes.
      const retry = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(retry.statusCode).toBe(201);
      expect(await Task.countDocuments({ _id: { $in: plannedTaskIds } })).toBe(0);
      expect(await Cluster.findById(plannedClusterId)).toBeNull();
      expect(await Task.countDocuments({ userId: importer._id })).toBe(3); // unrelated + 2 fresh copies
      expect(await BroadcastImport.countDocuments({})).toBe(1);
      expect((await BroadcastImport.findById(record._id)).status).toBe("completed");
      await expectUnrelatedIntact();
    });

    test("if only the cluster cleanup fails, the plan is kept and the retry repeats the cleanup safely", async () => {
      const { record, plannedTaskIds, plannedClusterId } = await createInterruptedImport({
        ageMs: STALE_IMPORT_MS + 60 * 1000,
      });

      jest.spyOn(Cluster, "deleteOne").mockRejectedValueOnce(new Error("cluster delete failed"));

      const failed = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(failed.statusCode).toBe(500);

      // The tasks were already removed, but the cluster (and the plan that
      // still points at it) remain.
      const preserved = await BroadcastImport.findById(record._id);
      expect(preserved.status).toBe("processing");
      expect(String(preserved.plannedClusterId)).toBe(String(plannedClusterId));
      expect(preserved.taskMappings).toHaveLength(2);
      expect(await Task.countDocuments({ _id: { $in: plannedTaskIds } })).toBe(0);
      expect(await Cluster.findById(plannedClusterId)).not.toBeNull();

      // Repeating the cleanup is idempotent: the missing tasks are fine, the
      // cluster is removed, and the import completes.
      const retry = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(retry.statusCode).toBe(201);
      expect(await Cluster.findById(plannedClusterId)).toBeNull();
      expect(await Cluster.countDocuments({ ownerId: importer._id, sourceBroadcastId: broadcast._id })).toBe(1);
      expect(await Task.countDocuments({ userId: importer._id })).toBe(3);
      await expectUnrelatedIntact();
    });

    test("a request whose claim is replaced after cleanup creates nothing and leaves the other owner's record alone", async () => {
      const { record, plannedTaskIds } = await createInterruptedImport({
        ageMs: STALE_IMPORT_MS + 60 * 1000,
      });

      const realDeleteMany = Task.deleteMany.bind(Task);

      // Right after the old tasks are cleaned up, another request takes over.
      jest.spyOn(Task, "deleteMany").mockImplementationOnce(async (...args) => {
        const result = await realDeleteMany(...args);
        await BroadcastImport.updateOne(
          { _id: record._id },
          { $set: { claimId: "other-winner", processingStartedAt: new Date() } }
        );
        return result;
      });

      const response = await importAs(importer._id, { taskIds: ids(alpha, beta), mode: "cluster" });

      expect(response.statusCode).toBe(409);

      const stored = await BroadcastImport.findById(record._id);
      expect(stored.claimId).toBe("other-winner");
      expect(stored.status).toBe("processing");
      // The loser installed no plan and created no artifacts.
      expect(stored.taskMappings.map((m) => String(m.importedTaskId))).toEqual(plannedTaskIds.map(String));
      expect(await Task.countDocuments({ userId: importer._id })).toBe(1); // unrelated only
      // The old attempt's cleanup had fully finished (orphan cluster included),
      // and the loser created no new cluster.
      expect(await Cluster.countDocuments({ ownerId: importer._id, sourceBroadcastId: broadcast._id })).toBe(0);
      await expectUnrelatedIntact();
    });
  });
});
