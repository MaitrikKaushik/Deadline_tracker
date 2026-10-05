const connectDB = require("../../../backend/config/db");
require("dotenv").config();

const { app } = require("@azure/functions");

const {
  runReminderCycle,
} = require("../../../backend/services/reminderOrchestrator");

app.timer("ReminderTimer", {
    schedule: "0 0 6 * * *",

    handler: async (myTimer, context) => {
        context.log(
          "Reminder Timer started."
        );
      
        try {
          await connectDB();
      
          const today = new Date();
      
          const result =
            await runReminderCycle(today);
      
          context.log(
            `Reminder cycle completed. Scheduled: ${result.scheduledDeliveries.length}, Processed: ${result.processedDeliveries.length}`
          );
      
          return result;
        } catch (error) {
          context.error(
            "Reminder cycle failed:",
            error
          );
      
          throw error;
        }
  },
});