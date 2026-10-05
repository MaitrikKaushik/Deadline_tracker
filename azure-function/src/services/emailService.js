const { EmailClient } = require("@azure/communication-email");
const buildReminderEmail = (task) => {
    const deadline = new Date(task.deadline);
  
    const formattedDeadline = deadline.toLocaleDateString(
      "en-IN",
      {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }
    );
  
    const subject = `Reminder: ${task.title}`;
  
    const text = `
  Deadline Tracker Reminder
  
  Task: ${task.title}
  
  Description:
  ${task.description || "No description provided."}
  
  Deadline: ${formattedDeadline}
  
  Priority: ${task.priority}
  
  Type: ${task.deadlineType}
  
  ${
    task.referenceLink
      ? `Reference Link: ${task.referenceLink}`
      : ""
  }
  
  Please open Deadline Tracker to review this task.
  `.trim();
  
    return {
      subject,
      text,
    };
  };

  const sendReminderEmail = async (
    recipientEmail,
    task
  ) => {
    try {
      const connectionString =
        process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  
      const senderAddress =
        process.env.AZURE_EMAIL_SENDER;
  
      if (!connectionString) {
        throw new Error(
          "Azure Communication Services connection string is missing"
        );
      }
  
      if (!senderAddress) {
        throw new Error(
          "Azure email sender address is missing"
        );
      }
  
      if (!recipientEmail) {
        throw new Error(
          "Recipient email address is required"
        );
      }
  
      const emailClient = new EmailClient(
        connectionString
      );
  
      const email = buildReminderEmail(task);
  
      const message = {
        senderAddress,
        content: {
          subject: email.subject,
          plainText: email.text,
        },
        recipients: {
          to: [
            {
              address: recipientEmail,
            },
          ],
        },
      };
  
      const poller = await emailClient.beginSend(
        message
      );
  
      const result = await poller.pollUntilDone();
  
      if (result.status !== "Succeeded") {
        throw new Error(
          `Email sending failed with status: ${result.status}`
        );
      }
  
      return result;
    } catch (error) {
      console.error(
        "Reminder email sending failed:",
        error.message
      );
  
      throw error;
    }
  };
  
  module.exports = {
    buildReminderEmail,
    sendReminderEmail,
  };