const {
    sendReminderEmail,
  } = require("../services/emailService");
  
  describe("Azure Email Sending", () => {
    test("should send a reminder email", async () => {
      const task = {
        title: "Deadline Tracker Email Test",
        description:
          "This is a test email from the Deadline Tracker backend.",
        deadline: "2027-06-01",
        priority: "high",
        deadlineType: "general",
        referenceLink: "",
      };
  
      const recipientEmail = "maitrik2006.kaushik.morni@gmail.com";
  
      const result = await sendReminderEmail(
        recipientEmail,
        task
      );
  
      expect(result.status).toBe("Succeeded");
    }, 30000);
  });