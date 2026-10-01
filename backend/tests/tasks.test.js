const request = require("supertest");
const app = require("../app");

describe("GET /api/tasks", () => {
  test("should reject unauthenticated users", async () => {
    const response = await request(app).get("/api/tasks");

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Not authenticated");
  });
});