const { getReminderDates } = require("../services/reminderService");

describe("Reminder Service", () => {
  const today = "2026-09-29";

  test("should generate monthly reminders from 12 months to 3 months", () => {
    const deadline = "2027-06-01";

    const reminders = getReminderDates(deadline, today);

    expect(reminders).toContain("2026-10-01");
    expect(reminders).toContain("2026-11-01");
    expect(reminders).toContain("2026-12-01");
    expect(reminders).toContain("2027-01-01");
    expect(reminders).toContain("2027-02-01");
    expect(reminders).toContain("2027-03-01");
  });

  test("should generate 15-day reminders from 3 months to 1 month", () => {
    const deadline = "2027-06-01";

    const reminders = getReminderDates(deadline, today);

    expect(reminders).toContain("2027-03-01");
    expect(reminders).toContain("2027-03-16");
    expect(reminders).toContain("2027-03-31");
    expect(reminders).toContain("2027-04-15");
    expect(reminders).toContain("2027-04-30");
  });

  test("should generate weekly reminders during the final month", () => {
    const deadline = "2027-06-01";

    const reminders = getReminderDates(deadline, today);

    expect(reminders).toContain("2027-05-01");
    expect(reminders).toContain("2027-05-08");
    expect(reminders).toContain("2027-05-15");
    expect(reminders).toContain("2027-05-22");
    expect(reminders).toContain("2027-05-29");
  });

  test("should always remind one day before and on the deadline", () => {
    const deadline = "2027-06-01";

    const reminders = getReminderDates(deadline, today);

    expect(reminders).toContain("2027-05-31");
    expect(reminders).toContain("2027-06-01");
  });

  test("should not contain duplicate reminder dates", () => {
    const deadline = "2027-06-01";

    const reminders = getReminderDates(deadline, today);

    const uniqueReminders = [...new Set(reminders)];

    expect(reminders).toEqual(uniqueReminders);
  });

  test("should return reminder dates in sorted order", () => {
    const deadline = "2027-06-01";

    const reminders = getReminderDates(deadline, today);

    const sorted = [...reminders].sort();

    expect(reminders).toEqual(sorted);
  });
});