# Deadline Tracker

A full-stack web application that helps users manage deadlines, organize tasks, and stay on top of upcoming exams, assignments, and personal goals. Access your tasks from anywhere and receive automated email reminders before important deadlines.

**Live Demo:** https://deadline-tracker-frontend-bn7n.onrender.com

## Features

- **Google Authentication:** Secure sign-in using your Google account.
- **Task Management:** Create, view, update, delete, and complete tasks.
- **Deadline Organization:** Categorize deadlines as Work, Exam, General, Assignment, or Self-study.
- **Priority Management:** Set task priorities to High, Medium, or Low.
- **Smart Sorting:** Automatically sort tasks by nearest deadline and priority.
- **Deadline Filtering:** Filter tasks by their category.
- **Automated Email Reminders:** Receive scheduled email reminders before deadlines.
- **Reference Links:** Attach useful URLs to individual tasks.
- **Persistent Storage:** Store tasks securely in MongoDB Atlas, associated with the authenticated user.
- **Responsive Web Access:** Use the application through a web browser.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, Vite, JavaScript, CSS |
| Backend | Node.js, Express.js |
| Database | MongoDB Atlas, Mongoose |
| Authentication | Google Identity Services, JWT, HTTP-only cookies |
| Email Notifications | Azure Communication Services Email |
| Scheduled Jobs | Azure Functions (Timer Trigger) |
| Testing | Jest, Supertest, MongoDB Memory Server |
| Deployment | Render, Microsoft Azure |

## System Architecture

```text
User
 |
 v
React Frontend (Render)
 |
 v
Express REST API (Render)
 |
 +------> Google Authentication
 |
 +------> MongoDB Atlas
 |
 v
Tasks and User Data


Azure Functions (06:00 AM IST)
 |
 v
MongoDB Atlas
 |
 v
Reminder Scheduling and Delivery
 |
 v
Azure Communication Services Email
 |
 v
User Inbox
```

The reminder service runs independently of the web application. It checks for scheduled reminders each morning and processes pending email deliveries.

## Getting Started

### Prerequisites

- Node.js and npm
- Git
- A MongoDB Atlas account
- A Google OAuth client ID
- An Azure Communication Services Email resource for email reminders
- Azure Functions Core Tools for running the reminder function locally

### Installation

Clone the repository:

```bash
git clone <YOUR_GITHUB_REPOSITORY_URL>
cd Deadline_tracker
```

Install backend dependencies:

```bash
cd backend
npm install
```

Install frontend dependencies:

```bash
cd ../frontend-react
npm install
```

Install Azure Function dependencies:

```bash
cd ../azure-function
npm install
```

### Environment Variables

Configure the environment variables locally. Never commit actual credentials or secret values.

**Backend — `backend/.env`**

```env
MONGO_URI=your_mongodb_connection_string
PORT=5000
GOOGLE_CLIENT_ID=your_google_client_id
JWT_SECRET=your_strong_random_secret
FRONTEND_URL=http://localhost:5173
NODE_ENV=development
AZURE_COMMUNICATION_CONNECTION_STRING=your_azure_connection_string
AZURE_EMAIL_SENDER=your_verified_azure_sender_address
```

**Frontend — `frontend-react/.env`**

```env
VITE_API_URL=http://localhost:5000
VITE_GOOGLE_CLIENT_ID=your_google_client_id
```

**Azure Function — local configuration**

Configure the required MongoDB and Azure Communication Services settings through `azure-function/local.settings.json` for local development, or through the Function App's application settings in Azure. Keep local settings and credentials out of Git.

### Run Locally

From the project root, install root dependencies if needed:

```bash
npm install
```

Start the backend and frontend together:

```bash
npm run dev
```

The local application will generally be available at:

- Frontend: http://localhost:5173
- Backend: http://localhost:5000

To run the Azure reminder function locally, open a separate terminal:

```bash
cd azure-function
npm start
```

Ensure your local Azure Functions configuration and required services are set up first.

## API Endpoints

All task endpoints require authentication.

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/google` | Authenticate with Google |
| GET | `/api/auth/me` | Retrieve the current authenticated user |
| POST | `/api/auth/logout` | Log out |
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks` | Retrieve the user's tasks |
| GET | `/api/tasks/:id` | Retrieve a specific task |
| PUT | `/api/tasks/:id` | Update a task |
| DELETE | `/api/tasks/:id` | Delete a task |

## Automated Reminder Schedule

The Azure Function checks for reminders every day at **06:00 AM Indian Standard Time (IST)**.

- From 12 months to 3 months before a deadline: monthly reminders.
- From 3 months to 1 month before a deadline: reminders every 15 days.
- During the final month: reminders every 7 days.
- One day before the deadline: a reminder is scheduled.
- On the deadline day: a reminder is scheduled.

If multiple rules fall on the same date, only one reminder is scheduled for that task. Completed tasks, deleted tasks, and tasks with reminders disabled are excluded from future reminder delivery. Failed email deliveries remain eligible for retry.

## Testing

Run the backend test suite:

```bash
cd backend
npm test
```

The suite covers authentication, task operations, reminder scheduling, delivery processing, and related services.

## Security

- Authentication is verified on the backend.
- JWTs are stored in HTTP-only cookies.
- Task operations are scoped to the authenticated user.
- Environment files and credentials should not be committed to version control.
- Production frontend and backend communication is configured through environment variables.

## Future Development

Potential enhancements for future versions include progress tracking, productivity analytics, calendar views, recurring tasks, and AI-assisted planning.

## License

No license has been specified yet. Add a license before allowing others to reuse or redistribute the project.

