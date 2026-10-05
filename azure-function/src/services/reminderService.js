const getReminderDates = (deadline, today = new Date()) => {
    const deadlineDate = new Date(deadline);
    const currentDate = new Date(today);
  
    if (Number.isNaN(deadlineDate.getTime())) {
      throw new Error("Invalid deadline");
    }
  
    deadlineDate.setHours(0, 0, 0, 0);
    currentDate.setHours(0, 0, 0, 0);
  
    const reminderDates = new Set();
  
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
  
      return `${year}-${month}-${day}`;
    };
  
    const addReminder = (date) => {
      const reminderDate = new Date(date);
      reminderDate.setHours(0, 0, 0, 0);
  
      if (
        reminderDate >= currentDate &&
        reminderDate <= deadlineDate
      ) {
        reminderDates.add(formatDate(reminderDate));
      }
    };
  
    // -----------------------------------------
    // 12 months → 3 months: every 1 month
    // -----------------------------------------
  
    const twelveMonthsBefore = new Date(deadlineDate);
    twelveMonthsBefore.setMonth(
      twelveMonthsBefore.getMonth() - 12
    );
  
    const threeMonthsBefore = new Date(deadlineDate);
    threeMonthsBefore.setMonth(
      threeMonthsBefore.getMonth() - 3
    );
  
    let reminderDate = new Date(twelveMonthsBefore);
  
    while (reminderDate < threeMonthsBefore) {
      addReminder(reminderDate);
  
      reminderDate = new Date(reminderDate);
      reminderDate.setMonth(
        reminderDate.getMonth() + 1
      );
    }
  
    // -----------------------------------------
    // 3 months → 1 month: every 15 days
    // -----------------------------------------
  
    const oneMonthBefore = new Date(deadlineDate);
    oneMonthBefore.setMonth(
      oneMonthBefore.getMonth() - 1
    );
  
    reminderDate = new Date(threeMonthsBefore);
  
    while (reminderDate < oneMonthBefore) {
      addReminder(reminderDate);
  
      reminderDate = new Date(reminderDate);
      reminderDate.setDate(
        reminderDate.getDate() + 15
      );
    }
  
    // -----------------------------------------
    // Final month: every 7 days
    // -----------------------------------------
  
    reminderDate = new Date(oneMonthBefore);
  
    while (reminderDate < deadlineDate) {
      addReminder(reminderDate);
  
      reminderDate = new Date(reminderDate);
      reminderDate.setDate(
        reminderDate.getDate() + 7
      );
    }
  
    // -----------------------------------------
    // Always remind 1 day before
    // -----------------------------------------
  
    const oneDayBefore = new Date(deadlineDate);
  
    oneDayBefore.setDate(
      oneDayBefore.getDate() - 1
    );
  
    addReminder(oneDayBefore);
  
    // -----------------------------------------
    // Always remind on deadline day
    // -----------------------------------------
  
    addReminder(deadlineDate);
  
    return Array.from(reminderDates).sort();
  };
  
  module.exports = {
    getReminderDates,
  };