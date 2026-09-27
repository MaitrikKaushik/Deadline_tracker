import { useEffect, useState } from "react";

const API_URL = "http://localhost:5000/api/tasks";

function App() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    deadline: "",
    priority: "medium",
  });

  const [editingId, setEditingId] = useState(null);

  // =========================
  // READ - GET ALL TASKS
  // =========================
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

  // =========================
  // HANDLE INPUT
  // =========================
  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value,
    });
  };

  // =========================
  // CREATE / UPDATE
  // =========================
  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      let response;

      if (editingId) {
        // UPDATE
        response = await fetch(`${API_URL}/${editingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(formData),
        });
      } else {
        // CREATE
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
        // Replace updated task
        setTasks(
          tasks.map((task) =>
            task._id === editingId ? data : task
          )
        );
      } else {
        // Add new task
        setTasks([...tasks, data]);
      }

      resetForm();

    } catch (error) {
      console.error("Error saving task:", error);
    }
  };

  // =========================
  // DELETE
  // =========================
  const handleDelete = async (id) => {
    try {
      const response = await fetch(`${API_URL}/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete task");
      }

      setTasks(
        tasks.filter((task) => task._id !== id)
      );

    } catch (error) {
      console.error("Error deleting task:", error);
    }
  };

  // =========================
  // EDIT
  // =========================
  const handleEdit = (task) => {
    setEditingId(task._id);

    setFormData({
      title: task.title,
      description: task.description || "",
      deadline: task.deadline
        ? task.deadline.substring(0, 10)
        : "",
      priority: task.priority,
    });
  };

  // =========================
  // MARK COMPLETED / PENDING
  // =========================
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
          item._id === task._id
            ? updatedTask
            : item
        )
      );

    } catch (error) {
      console.error("Error updating status:", error);
    }
  };

  // =========================
  // RESET FORM
  // =========================
  const resetForm = () => {
    setFormData({
      title: "",
      description: "",
      deadline: "",
      priority: "medium",
    });

    setEditingId(null);
  };

  return (
    <div>
      <h1>Deadline Tracker</h1>

      {/* =========================
          CREATE / UPDATE FORM
      ========================== */}

      <h2>
        {editingId ? "Edit Task" : "Add Task"}
      </h2>

      <form onSubmit={handleSubmit}>

        <input
          type="text"
          name="title"
          placeholder="Task title"
          value={formData.title}
          onChange={handleChange}
          required
        />

        <br /><br />

        <textarea
          name="description"
          placeholder="Description"
          value={formData.description}
          onChange={handleChange}
        />

        <br /><br />

        <input
          type="date"
          name="deadline"
          value={formData.deadline}
          onChange={handleChange}
          required
        />

        <br /><br />

        <select
          name="priority"
          value={formData.priority}
          onChange={handleChange}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <br /><br />

        <button type="submit">
          {editingId ? "Update Task" : "Add Task"}
        </button>

        {editingId && (
          <button
            type="button"
            onClick={resetForm}
          >
            Cancel
          </button>
        )}

      </form>

      <hr />

      {/* =========================
          TASK LIST
      ========================== */}

      <h2>Tasks</h2>

      {loading && <p>Loading tasks...</p>}

      {!loading && tasks.length === 0 && (
        <p>No tasks found.</p>
      )}

      {tasks.map((task) => (
        <div key={task._id}>

          <h3>{task.title}</h3>

          <p>
            {task.description}
          </p>

          <p>
            Deadline: {task.deadline}
          </p>

          <p>
            Priority: {task.priority}
          </p>

          <p>
            Status: {task.status}
          </p>

          <button
            onClick={() => toggleStatus(task)}
          >
            {task.status === "completed"
              ? "Mark Pending"
              : "Mark Completed"}
          </button>

          <button
            onClick={() => handleEdit(task)}
          >
            Edit
          </button>

          <button
            onClick={() => handleDelete(task._id)}
          >
            Delete
          </button>

          <hr />

        </div>
      ))}
    </div>
  );
}

export default App;