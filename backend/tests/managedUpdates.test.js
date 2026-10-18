const request = require("supertest");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../models/user");
const Task = require("../models/task");
const Cluster = require("../models/cluster");
const Broadcast = require("../models/broadcast");
const BroadcastImport = require("../models/broadcastImport");
const ManagedUpdate = require("../models/managedUpdate");
const ReminderDelivery = require("../models/reminderDelivery");

const authCookie = (userId) => `token=${jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "1h" })}`;

let owner;
let recipient;
let sourceTask;
let importedTask;
let sourceCluster;
let importedCluster;
let broadcast;
let importRecord;

async function seedManagedImport() {
  owner = await User.create({
    googleId: `managed-owner-${Date.now()}`,
    name: "Source Owner",
    email: `managed-owner-${Date.now()}@example.com`,
    picture: "",
  });
  recipient = await User.create({
    googleId: `managed-recipient-${Date.now()}`,
    name: "Recipient",
    email: `managed-recipient-${Date.now()}@example.com`,
    picture: "",
  });

  sourceTask = await Task.create({
    title: "Original deadline",
    description: "Original description",
    deadline: "2026-12-01T00:00:00.000Z",
    priority: "medium",
    status: "pending",
    reminderEnabled: true,
    userId: owner._id,
  });
  importedTask = await Task.create({
    title: "Original deadline",
    description: "Original description",
    deadline: "2026-12-01T00:00:00.000Z",
    priority: "medium",
    status: "completed",
    reminderEnabled: true,
    userId: recipient._id,
  });
  sourceCluster = await Cluster.create({
    name: "Source Finals",
    ownerId: owner._id,
    tasks: [sourceTask._id],
    origin: "created",
  });
  broadcast = await Broadcast.create({
    ownerId: owner._id,
    sourceClusterId: sourceCluster._id,
    name: sourceCluster.name,
    description: "A shared set of deadlines",
    code: "ABC1234567",
    tasks: [{
      sourceTaskId: sourceTask._id,
      title: sourceTask.title,
      description: sourceTask.description,
      deadline: sourceTask.deadline,
      priority: sourceTask.priority,
      deadlineType: sourceTask.deadlineType,
      referenceLink: sourceTask.referenceLink,
      reminderEnabled: sourceTask.reminderEnabled,
    }],
  });
  importedCluster = await Cluster.create({
    name: "Source Finals",
    ownerId: recipient._id,
    tasks: [importedTask._id],
    origin: "imported",
    sourceBroadcastId: broadcast._id,
  });
  importRecord = await BroadcastImport.create({
    broadcastId: broadcast._id,
    importerId: recipient._id,
    mode: "cluster",
    selectedSourceTaskIds: [sourceTask._id],
    importedTaskIds: [importedTask._id],
    importedClusterId: importedCluster._id,
    reminderEnabled: true,
    status: "completed",
    taskMappings: [{ sourceTaskId: sourceTask._id, importedTaskId: importedTask._id }],
  });
}

beforeEach(async () => {
  await Promise.all([
    ReminderDelivery.deleteMany({}),
    ManagedUpdate.deleteMany({}),
    BroadcastImport.deleteMany({}),
    Broadcast.deleteMany({}),
    Cluster.deleteMany({}),
    Task.deleteMany({}),
    User.deleteMany({}),
  ]);
  await seedManagedImport();
});

describe("Managed updates", () => {
  test("source edits create recipient proposals; recipients choose fields independently", async () => {
    const sourceResponse = await request(app)
      .put(`/api/tasks/${sourceTask._id}`)
      .set("Cookie", authCookie(owner._id))
      .send({ title: "Rescheduled deadline", reminderEnabled: false });

    expect(sourceResponse.statusCode).toBe(200);

    const inbox = await request(app)
      .get("/api/managed-updates")
      .set("Cookie", authCookie(recipient._id));

    expect(inbox.statusCode).toBe(200);
    expect(inbox.body.pendingCount).toBe(1);
    expect(inbox.body.updates).toHaveLength(1);
    const proposal = inbox.body.updates[0];
    expect(proposal.changes.map((change) => change.field).sort()).toEqual(["reminderEnabled", "title"]);
    expect((await Task.findById(importedTask._id)).title).toBe("Original deadline");
    expect((await Task.findById(importedTask._id)).reminderEnabled).toBe(true);

    const ownerAttempt = await request(app)
      .post(`/api/managed-updates/${proposal._id}/decide`)
      .set("Cookie", authCookie(owner._id))
      .send({ decisions: [{ field: "title", action: "accept" }] });
    expect(ownerAttempt.statusCode).toBe(404);

    const decision = await request(app)
      .post(`/api/managed-updates/${proposal._id}/decide`)
      .set("Cookie", authCookie(recipient._id))
      .send({ decisions: [
        { field: "title", action: "accept" },
        { field: "reminderEnabled", action: "reject" },
      ] });

    expect(decision.statusCode).toBe(200);
    const savedCopy = await Task.findById(importedTask._id);
    expect(savedCopy.title).toBe("Rescheduled deadline");
    expect(savedCopy.reminderEnabled).toBe(true);
    // Recipient completion status is personal state and is never synchronized.
    expect(savedCopy.status).toBe("completed");
    expect((await request(app).get("/api/managed-updates").set("Cookie", authCookie(recipient._id))).body.pendingCount).toBe(0);

    const updatedBroadcast = await Broadcast.findById(broadcast._id);
    expect(updatedBroadcast.tasks[0].title).toBe("Rescheduled deadline");
    expect(updatedBroadcast.tasks[0].reminderEnabled).toBe(false);
  });

  test("accepting the owner's reminder change applies it only after explicit approval", async () => {
    await ReminderDelivery.create({
      taskId: importedTask._id,
      userId: recipient._id,
      scheduledDate: "2026-12-01",
      status: "pending",
    });

    const changed = await request(app)
      .put(`/api/tasks/${sourceTask._id}`)
      .set("Cookie", authCookie(owner._id))
      .send({ reminderEnabled: false });
    expect(changed.statusCode).toBe(200);

    const inbox = await request(app)
      .get("/api/managed-updates")
      .set("Cookie", authCookie(recipient._id));
    const proposal = inbox.body.updates[0];
    expect(proposal.changes.map((change) => change.field)).toContain("reminderEnabled");
    expect((await Task.findById(importedTask._id)).reminderEnabled).toBe(true);

    const decision = await request(app)
      .post(`/api/managed-updates/${proposal._id}/decide`)
      .set("Cookie", authCookie(recipient._id))
      .send({ decisions: [{ field: "reminderEnabled", action: "accept" }] });
    expect(decision.statusCode).toBe(200);

    const savedCopy = await Task.findById(importedTask._id);
    expect(savedCopy.reminderEnabled).toBe(false);
    expect(savedCopy.status).toBe("completed");
    expect(await ReminderDelivery.countDocuments({ taskId: importedTask._id, status: "pending" })).toBe(0);
  });

  test("source cluster rename becomes an opt-in proposal for imported clusters", async () => {
    const response = await request(app)
      .put(`/api/clusters/${sourceCluster._id}`)
      .set("Cookie", authCookie(owner._id))
      .send({ name: "Updated Finals" });

    expect(response.statusCode).toBe(200);
    expect((await Cluster.findById(importedCluster._id)).name).toBe("Source Finals");

    const inbox = await request(app)
      .get("/api/managed-updates")
      .set("Cookie", authCookie(recipient._id));
    expect(inbox.statusCode).toBe(200);
    expect(inbox.body.pendingCount).toBe(1);
    const proposal = inbox.body.updates[0];
    expect(proposal.targetType).toBe("cluster");
    expect(proposal.changes[0].field).toBe("name");

    const decision = await request(app)
      .post(`/api/managed-updates/${proposal._id}/decide`)
      .set("Cookie", authCookie(recipient._id))
      .send({ decisions: [{ field: "name", action: "accept" }] });
    expect(decision.statusCode).toBe(200);
    expect((await Cluster.findById(importedCluster._id)).name).toBe("Updated Finals");
  });

  test("source-only deletion revokes broadcasts and preserves recipient copies", async () => {
    const response = await request(app)
      .delete(`/api/clusters/${sourceCluster._id}`)
      .set("Cookie", authCookie(owner._id))
      .send({ removeImportedCopies: false });

    expect(response.statusCode).toBe(200);
    expect(await Cluster.findById(sourceCluster._id)).toBeNull();
    expect(await Task.findById(importedTask._id)).not.toBeNull();
    expect(await Cluster.findById(importedCluster._id)).not.toBeNull();
    expect((await Broadcast.findById(broadcast._id)).revokedAt).not.toBeNull();
    expect((await BroadcastImport.findById(importRecord._id)).syncEnabled).toBe(false);
  });

  test("disconnecting an import prevents future proposals from that source", async () => {
    const disconnected = await request(app)
      .post(`/api/managed-updates/imports/${importRecord._id}/disconnect`)
      .set("Cookie", authCookie(recipient._id));

    expect(disconnected.statusCode).toBe(200);
    expect(disconnected.body.syncEnabled).toBe(false);

    const changed = await request(app)
      .put(`/api/tasks/${sourceTask._id}`)
      .set("Cookie", authCookie(owner._id))
      .send({ title: "A later source change" });

    expect(changed.statusCode).toBe(200);
    const inbox = await request(app)
      .get("/api/managed-updates")
      .set("Cookie", authCookie(recipient._id));
    expect(inbox.statusCode).toBe(200);
    expect(inbox.body.pendingCount).toBe(0);
    expect((await Task.findById(importedTask._id)).title).toBe("Original deadline");
  });

  test("source changes create independent proposals for multiple recipients", async () => {
    const anotherRecipient = await User.create({
      googleId: `managed-recipient-two-${Date.now()}`,
      name: "Second Recipient",
      email: `managed-recipient-two-${Date.now()}@example.com`,
      picture: "",
    });
    const secondCopy = await Task.create({
      title: "Original deadline",
      description: "Original description",
      deadline: "2026-12-01T00:00:00.000Z",
      priority: "medium",
      status: "pending",
      reminderEnabled: false,
      userId: anotherRecipient._id,
    });
    await BroadcastImport.create({
      broadcastId: broadcast._id,
      importerId: anotherRecipient._id,
      mode: "tasks",
      selectedSourceTaskIds: [sourceTask._id],
      importedTaskIds: [secondCopy._id],
      reminderEnabled: false,
      status: "completed",
      taskMappings: [{ sourceTaskId: sourceTask._id, importedTaskId: secondCopy._id }],
    });

    const changed = await request(app)
      .put(`/api/tasks/${sourceTask._id}`)
      .set("Cookie", authCookie(owner._id))
      .send({ title: "New owner title", reminderEnabled: false });
    expect(changed.statusCode).toBe(200);

    const firstInbox = await request(app)
      .get("/api/managed-updates")
      .set("Cookie", authCookie(recipient._id));
    const secondInbox = await request(app)
      .get("/api/managed-updates")
      .set("Cookie", authCookie(anotherRecipient._id));

    expect(firstInbox.statusCode).toBe(200);
    expect(secondInbox.statusCode).toBe(200);
    expect(firstInbox.body.pendingCount).toBe(1);
    expect(secondInbox.body.pendingCount).toBe(1);

    const secondProposal = secondInbox.body.updates[0];
    const secondDecision = await request(app)
      .post(`/api/managed-updates/${secondProposal._id}/decide`)
      .set("Cookie", authCookie(anotherRecipient._id))
      .send({ decisions: [{ field: "title", action: "accept" }] });
    expect(secondDecision.statusCode).toBe(200);
    expect((await Task.findById(secondCopy._id)).title).toBe("New owner title");
    expect((await Task.findById(importedTask._id)).title).toBe("Original deadline");
    expect((await ManagedUpdate.findOne({ importerId: recipient._id, status: "pending" }))).not.toBeNull();
  });

  test("a different user cannot disconnect another user's import", async () => {
    const otherUser = await User.create({
      googleId: `managed-unrelated-${Date.now()}`,
      name: "Unrelated User",
      email: `managed-unrelated-${Date.now()}@example.com`,
      picture: "",
    });

    const response = await request(app)
      .post(`/api/managed-updates/imports/${importRecord._id}/disconnect`)
      .set("Cookie", authCookie(otherUser._id));

    expect(response.statusCode).toBe(404);
    expect((await BroadcastImport.findById(importRecord._id)).syncEnabled).toBe(true);
  });

  test("explicit cascade deletion removes only the mapped recipient copies", async () => {
    const unrelated = await Task.create({
      title: "Unrelated task",
      deadline: "2026-12-10T00:00:00.000Z",
      userId: recipient._id,
    });
    const unrelatedCluster = await Cluster.create({
      name: "Personal cluster",
      ownerId: recipient._id,
      tasks: [unrelated._id, importedTask._id],
      origin: "created",
    });

    const response = await request(app)
      .delete(`/api/clusters/${sourceCluster._id}`)
      .set("Cookie", authCookie(owner._id))
      .send({ removeImportedCopies: true });

    expect(response.statusCode).toBe(200);
    expect(await Cluster.findById(sourceCluster._id)).toBeNull();
    expect(await Task.findById(importedTask._id)).toBeNull();
    expect(await Cluster.findById(importedCluster._id)).toBeNull();
    expect(await BroadcastImport.findById(importRecord._id)).toBeNull();
    expect(await ManagedUpdate.countDocuments({ broadcastImportId: importRecord._id })).toBe(0);
    expect(await Task.findById(unrelated._id)).not.toBeNull();
    const personalAfter = await Cluster.findById(unrelatedCluster._id);
    expect(personalAfter.tasks.map(String)).toEqual([String(unrelated._id)]);
  });
});
