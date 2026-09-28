import { useEffect, useState } from "react";
import TaskForm from "./components/TaskForm";
import TaskList from "./components/TaskList";
import "./App.css";

const API_URL = "http://localhost:5000/api/tasks";

function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    deadline: "",
    priority: "medium",
    deadlineType: "general",
    referenceLink: "",
  });

  const [editingId, setEditingId] = useState(null);

  const fetchTasks = async () => {
    try {
      setLoading(true);

      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error("Failed to fetch tasks");
      }

      const data = await response.json();
      setTasks(data);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      let response;

      if (editingId) {
        response = await fetch(`${API_URL}/${editingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });
      } else {
        response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });
      }

      if (!response.ok) {
        throw new Error("Request failed");
      }

      const data = await response.json();

      if (editingId) {
        setTasks(
          tasks.map((task) =>
            task._id === editingId ? data : task
          )
        );
      } else {
        setTasks([...tasks, data]);
      }

      resetForm();
    } catch (error) {
      console.error("Error saving task:", error);
    }
  };

  const handleEdit = (task) => {
    setEditingId(task._id);
  
    setFormData({
      title: task.title,
      description: task.description || "",
      deadline: task.deadline
        ? task.deadline.substring(0, 10)
        : "",
      priority: task.priority,
      deadlineType: task.deadlineType || "general",
      referenceLink: task.referenceLink || "",
    });
  };

  const handleDelete = async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete task");
      }

      setTasks(tasks.filter((task) => task._id !== id));
    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  const toggleStatus = async (task) => {
    try {
      const newStatus =
        task.status === "completed"
          ? "pending"
          : "completed";

      const response = await fetch(`${API_URL}/${task._id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...task,
          status: newStatus,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update status");
      }

      const updatedTask = await response.json();

      setTasks(
        tasks.map((item) =>
          item._id === task._id ? updatedTask : item
        )
      );
    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      deadline: "",
      priority: "medium",
      deadlineType: "general",
      referenceLink: "",
    });
  
    setEditingId(null);
  };

  return (
    <div className="app">
      <header className="header">
        <div>
          <p className="eyebrow">PRODUCTIVITY</p>
          <h1>Deadline Tracker</h1>
          <p className="subtitle">
            Keep your academic work organized and on time.
          </p>
        </div>

        <div className="task-count">
          <span>{tasks.length}</span>
          <small>Total Tasks</small>
        </div>
      </header>

      <main className="main-content">
        <section className="form-section">
          <TaskForm
            formData={formData}
            editingId={editingId}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onCancel={resetForm}
          />
        </section>

        <section className="tasks-section">
          <div className="section-heading">
            <div>
              <h2>Your Tasks</h2>
              <p>Manage your upcoming deadlines.</p>
            </div>
          </div>

          <TaskList
            tasks={tasks}
            loading={loading}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleStatus={toggleStatus}
          />
        </section>
      </main>
    </div>
  );
}

export default App;