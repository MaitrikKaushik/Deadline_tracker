import { useEffect, useState } from "react";

import Login from "./pages/Login";
import TaskForm from "./components/TaskForm";
import TaskList from "./components/TaskList";

import "./App.css";

const API_URL = "http://localhost:5000";

const initialFormData = {
  title: "",
  description: "",
  deadline: "",
  priority: "medium",
  deadlineType: "general",
  referenceLink: "",
  reminderEnabled: true,
};

function App() {
  const [user, setUser] = useState(null);

  const [tasks, setTasks] = useState([]);

  const [formData, setFormData] = useState(initialFormData);

  const [editingId, setEditingId] = useState(null);

  const [loading, setLoading] = useState(true);

  const [tasksLoading, setTasksLoading] = useState(false);

  useEffect(() => {
    const checkAuthentication = async () => {
      try {
        const response = await fetch(
          `${API_URL}/api/auth/me`,
          {
            credentials: "include",
          }
        );

        if (!response.ok) {
          setUser(null);
          return;
        }

        const data = await response.json();

        setUser(data.user);
      } catch (error) {
        console.error(
          "Authentication check failed:",
          error
        );

        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuthentication();
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    fetchTasks();
  }, [user]);

  const fetchTasks = async () => {
    setTasksLoading(true);

    try {
      const response = await fetch(
        `${API_URL}/api/tasks`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }

      const data = await response.json();

      setTasks(data);
    } catch (error) {
      console.error("Fetch tasks error:", error);
      alert("Unable to load tasks.");
    } finally {
      setTasksLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
  
    setFormData((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      const isEditing = Boolean(editingId);

      const url = isEditing
        ? `${API_URL}/api/tasks/${editingId}`
        : `${API_URL}/api/tasks`;

      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to save task"
        );
      }

      if (isEditing) {
        setTasks((previous) =>
          previous.map((task) =>
            task._id === editingId ? data : task
          )
        );
      } else {
        setTasks((previous) => [
          ...previous,
          data,
        ]);
      }

      setFormData(initialFormData);
      setEditingId(null);
    } catch (error) {
      console.error("Save task error:", error);

      alert(error.message);
    }
  };

  const handleEdit = (task) => {
    setEditingId(task._id);

    setFormData({
      title: task.title || "",
      description: task.description || "",
      deadline: task.deadline
        ? task.deadline.slice(0, 10)
        : "",
      priority: task.priority || "medium",
      deadlineType:
        task.deadlineType || "general",
      referenceLink:
        task.referenceLink || "",
        reminderEnabled:
        task.reminderEnabled || false,  
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });

    
  };

  const handleCancel = () => {
    setEditingId(null);

    setFormData(initialFormData);
  };

  const handleDelete = async (taskId) => {
    try {
      const response = await fetch(
        `${API_URL}/api/tasks/${taskId}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to delete task"
        );
      }

      setTasks((previous) =>
        previous.filter(
          (task) => task._id !== taskId
        )
      );
    } catch (error) {
      console.error("Delete task error:", error);

      alert(error.message);
    }
  };

  const handleToggleStatus = async (task) => {
    const newStatus =
      task.status === "completed"
        ? "pending"
        : "completed";

    try {
      const response = await fetch(
        `${API_URL}/api/tasks/${task._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            status: newStatus,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Unable to update task"
        );
      }

      setTasks((previous) =>
        previous.map((currentTask) =>
          currentTask._id === task._id
            ? data
            : currentTask
        )
      );
    } catch (error) {
      console.error(
        "Toggle status error:",
        error
      );

      alert(error.message);
    }
  };

  const handleLogout = async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/auth/logout`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Logout failed");
      }

      setUser(null);
      setTasks([]);
      setFormData(initialFormData);
      setEditingId(null);
    } catch (error) {
      console.error("Logout error:", error);

      alert(
        "Unable to logout. Please try again."
      );
    }
  };

  if (loading) {
    return (
      <div className="login-page">
        <div className="login-card">
          <p>Checking your login...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">
            DEADLINE TRACKER
          </p>

          <h1>Welcome, {user.name}</h1>

          <p className="subtitle">
            Keep track of what matters and never
            miss a deadline.
          </p>
        </div>

        <div className="task-count">
          <span>{tasks.length}</span>
          <small>
            {tasks.length === 1
              ? "Task"
              : "Tasks"}
          </small>
        </div>

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          Logout
        </button>
      </header>

      <main className="main-content">
        <TaskForm
          formData={formData}
          editingId={editingId}
          onChange={handleChange}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
        />

        <section>
          <div className="section-heading">
            <h2>Your Tasks</h2>

            <p>
              {user.email}
            </p>
          </div>

          <TaskList
            tasks={tasks}
            loading={tasksLoading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleStatus={handleToggleStatus}
          />
        </section>
      </main>
    </div>
  );
}

export default App;