jest.mock("google-auth-library", () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}));

const request = require("supertest");
const jwt = require("jsonwebtoken");
const { OAuth2Client } = require("google-auth-library");

const app = require("../app");
const User = require("../models/user");

const googleClient = OAuth2Client.mock.results[0].value;
const verifyIdToken = googleClient.verifyIdToken;

describe("Authentication API", () => {
  beforeEach(async () => {
    verifyIdToken.mockReset();
    await User.deleteMany({});
  });

  test("should reject Google login without a credential", async () => {
    const response = await request(app)
      .post("/api/auth/google")
      .send({});

    expect(response.statusCode).toBe(400);
    expect(response.body.message).toBe(
      "Google credential is required"
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  test("should create a user and issue an authentication cookie", async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "google-user-123",
        name: "Google Test User",
        email: "google-test@example.com",
        picture: "https://example.com/photo.jpg",
        email_verified: true,
      }),
    });

    const response = await request(app)
      .post("/api/auth/google")
      .send({ credential: "fake-google-token" });

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe(
      "Google login successful"
    );
    expect(response.body.user.email).toBe(
      "google-test@example.com"
    );

    const user = await User.findOne({
      googleId: "google-user-123",
    });

    expect(user).not.toBeNull();
    expect(user.name).toBe("Google Test User");

    const cookies = response.headers["set-cookie"];
    expect(cookies.some((cookie) => cookie.startsWith("token="))).toBe(
      true
    );
  });

  test("should reject an unverified Google email", async () => {
    verifyIdToken.mockResolvedValue({
      getPayload: () => ({
        sub: "unverified-user",
        name: "Unverified User",
        email: "unverified@example.com",
        email_verified: false,
      }),
    });

    const response = await request(app)
      .post("/api/auth/google")
      .send({ credential: "fake-google-token" });

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe(
      "Google email could not be verified"
    );
  });

  test("should return the authenticated user from /me", async () => {
    const user = await User.create({
      googleId: "me-user",
      name: "Me User",
      email: "me@example.com",
      picture: "",
    });

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const response = await request(app)
      .get("/api/auth/me")
      .set("Cookie", `token=${token}`);

    expect(response.statusCode).toBe(200);
    expect(response.body.user.email).toBe("me@example.com");
    expect(response.body.user.name).toBe("Me User");
  });

  test("should reject /me without authentication", async () => {
    const response = await request(app).get("/api/auth/me");

    expect(response.statusCode).toBe(401);
    expect(response.body.message).toBe("Not authenticated");
  });

  test("should clear the authentication cookie on logout", async () => {
    const response = await request(app).post("/api/auth/logout");

    expect(response.statusCode).toBe(200);
    expect(response.body.message).toBe(
      "Logged out successfully"
    );

    const cookies = response.headers["set-cookie"];
    expect(cookies.some((cookie) => cookie.startsWith("token="))).toBe(
      true
    );
  });
});
