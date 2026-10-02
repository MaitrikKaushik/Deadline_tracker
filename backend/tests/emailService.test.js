const {
    buildReminderEmail,
  } = require("../services/emailService");
  
  describe("Email Service", () => {
    test("should build a reminder email from a task", () => {
      const task = {
        title: "Complete DSA Assignment",
        description: "Finish recursion and sorting questions.",
        deadline: "2027-06-01",
        priority: "high",
        deadlineType: "assignment",
        referenceLink: "https://example.com/dsa",
      };
  
      const email = buildReminderEmail(task);
  
      expect(email.subject).toBe(
        "Reminder: Complete DSA Assignment"
      );
  
      expect(email.text).toContain(
        "Complete DSA Assignment"
      );
  
      expect(email.text).toContain(
        "Finish recursion and sorting questions."
      );
  
      expect(email.text).toContain(
        "01 June 2027"
      );
  
      expect(email.text).toContain("high");
  
      expect(email.text).toContain("assignment");
  
      expect(email.text).toContain(
        "https://example.com/dsa"
      );
    });
  
    test("should handle a task without description or reference link", () => {
      const task = {
        title: "Prepare for Exam",
        description: "",
        deadline: "2027-06-01",
        priority: "medium",
        deadlineType: "exam",
        referenceLink: "",
      };
  
      const email = buildReminderEmail(task);
  
      expect(email.subject).toBe(
        "Reminder: Prepare for Exam"
      );
  
      expect(email.text).toContain(
        "No description provided."
      );
  
      expect(email.text).not.toContain(
        "Reference Link:"
      );
    });
  });