require("dotenv").config();

const mongoose = require("mongoose");
const {
  MongoMemoryServer,
} = require("mongodb-memory-server");

jest.setTimeout(15000);

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();

  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});
