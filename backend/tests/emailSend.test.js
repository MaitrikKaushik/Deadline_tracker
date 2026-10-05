const { EmailClient } = require("@azure/communication-email");

const {
  sendReminderEmail,
} = require("../services/emailService");

describe("Azure Email Sending", () => {
  test("should send a reminder email through Azure Communication Services", async () => {
    const task = {
      title: "Deadline Tracker Email Test",
      description:
        "This is a real integration test for Azure Communication Services.",
      deadline: "2027-06-01",
      priority: "high",
      deadlineType: "general",
      referenceLink: "",
    };

    const recipientEmail = "maitrik2006.kaushik.morni@gmail.com";

    if (!recipientEmail) {
      throw new Error(
        "TEST_EMAIL_RECIPIENT is missing. Set it only when running the real Azure email test."
      );
    }

    const result = await sendReminderEmail(
      recipientEmail,
      task
    );

    expect(result.status).toBe("Succeeded");
  }, 30000);
});
