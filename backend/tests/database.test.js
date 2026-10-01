const mongoose = require("mongoose");
const User = require("../models/user");

describe("Database", () => {
  test("should create and retrieve a user", async () => {
    const user = await User.create({
      googleId: "test-google-id",
      name: "Test User",
      email: "test@example.com",
      picture: "",
    });

    const foundUser = await User.findById(user._id);

    expect(foundUser).not.toBeNull();
    expect(foundUser.name).toBe("Test User");
    expect(foundUser.email).toBe("test@example.com");
  });
});