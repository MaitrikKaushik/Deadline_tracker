const {
    getTasksDueForReminder,
  } = require("./reminderScanner");
  
  const {
    processPendingReminderDeliveries,
  } = require("./reminderQueueProcessor");
  
  const runReminderCycle = async (today) => {
    // Step 1:
    // Find tasks whose reminder is scheduled for today
    // and create their delivery records.
    const scheduledDeliveries =
      await getTasksDueForReminder(today);
  
    // Step 2:
    // Process all pending deliveries whose retry time
    // has arrived, including older throttled reminders.
    const processedDeliveries =
      await processPendingReminderDeliveries();
  
    return {
      scheduledDeliveries,
      processedDeliveries,
    };
  };
  
  module.exports = {
    runReminderCycle,
  };