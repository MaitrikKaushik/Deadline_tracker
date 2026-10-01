const request = require("supertest");
const app = require("../app");

describe("GET /", () => {
  test("should return API Running", async () => {
    const response = await request(app).get("/");

    expect(response.statusCode).toBe(200);
    expect(response.text).toBe("API Running");
  });
});