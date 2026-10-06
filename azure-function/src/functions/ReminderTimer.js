const connectDB = require("../config/db");

const {
  runReminderCycle,
} = require("../services/reminderOrchestrator");

require("dotenv").config();

const { app } = require("@azure/functions");


app.timer("ReminderTimer", {
    schedule: "0 30 0 * * *",

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