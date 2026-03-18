const API_URL = "http://localhost:5000/api/tasks";

// Load tasks
async function loadTasks() {
  const res = await fetch(API_URL);
  const tasks = await res.json();

  const list = document.getElementById("taskList");
  list.innerHTML = "";

  tasks.forEach(task => {
    const li = document.createElement("li");
    li.innerHTML = `
      ${task.title} - ${new Date(task.deadline).toLocaleDateString()}
      <button onclick="deleteTask('${task._id}')">Delete</button>
    `;
    list.appendChild(li);
  });
}

// Add task
async function addTask() {
  const title = document.getElementById("title").value;
  const deadline = document.getElementById("deadline").value;

  await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title, deadline })
  });

  loadTasks();
}

// Delete task
async function deleteTask(id) {
  await fetch(`${API_URL}/${id}`, {
    method: "DELETE"
  });

  loadTasks();
}


loadTasks();