const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const connectDB = require("./config/db");

dotenv.config();

const app = express();

app.use(cors());
console.log(process.env.MONGO_URI);

// connect database
connectDB();

// middleware
app.use(express.json());

// test route
app.get("/", (req, res) => {
  res.send("API Running");
});

const taskRoutes = require("./routes/taskroutes");

app.use("/api/tasks", taskRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
