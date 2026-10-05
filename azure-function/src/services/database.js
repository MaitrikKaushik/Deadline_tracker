const dns = require("dns");
const mongoose = require("mongoose");

dns.setServers(["8.8.8.8"]);

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing");
  }

  await mongoose.connect(process.env.MONGO_URI);

  console.log("MongoDB Connected from Azure Function");
};

module.exports = connectDB;