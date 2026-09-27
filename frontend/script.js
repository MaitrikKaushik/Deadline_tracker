const API_URL = "http://localhost:5000/api/tasks";

let editingTaskId = null;


// ===============================
// DOM ELEMENTS
// ===============================

const taskForm = document.getElementById("taskForm");

const titleInput = document.getElementById("title");
const descriptionInput = document.getElementById("description");
const deadlineInput = document.getElementById("deadline");
const priorityInput = document.getElementById("priority");

const taskList = document.getElementById("taskList");
const taskCount = document.getElementById("taskCount");
const emptyMessage = document.getElementById("emptyMessage");

const formTitle = document.getElementById("formTitle");
const submitButton = document.getElementById("submitButton");
const cancelEditButton = document.getElementById("cancelEditButton");

const formMessage = document.getElementById("formMessage");


// ===============================
// LOAD ALL TASKS
// ===============================

async function loadTasks() {

  try {

    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error("Failed to fetch tasks");
    }

    const tasks = await response.json();

    displayTasks(tasks);

  } catch (error) {

    console.error(error);

    taskList.innerHTML = `
      <p class="error-message">
        Unable to load tasks. Make sure the backend server is running.
      </p>
    `;

  }
}


// ===============================
// DISPLAY TASKS
// ===============================

function displayTasks(tasks) {

  taskList.innerHTML = "";

  taskCount.textContent =
    `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;


  if (tasks.length === 0) {

    emptyMessage.style.display = "block";

    return;
  }

  emptyMessage.style.display = "none";


  tasks.forEach(task => {

    const taskCard = document.createElement("div");

    taskCard.className =
      `task-card ${task.status === "completed" ? "completed" : ""}`;


    taskCard.innerHTML = `

      <div class="task-top">

        <h3>${escapeHTML(task.title)}</h3>

        <span class="priority ${task.priority}">
          ${capitalize(task.priority)}
        </span>

      </div>


      ${
        task.description
          ? `<p class="description">
              ${escapeHTML(task.description)}
             </p>`
          : ""
      }


      <div class="task-info">

        <span>
          Deadline:
          <strong>
            ${formatDate(task.deadline)}
          </strong>
        </span>

        <span>
          Status:
          <strong>
            ${capitalize(task.status)}
          </strong>
        </span>

        <span>
          Created:
          <strong>
            ${formatDate(task.createdAt)}
          </strong>
        </span>

      </div>


      <div class="task-actions">

        <button
          onclick="toggleTaskStatus('${task._id}', '${task.status}')"
        >
          ${
            task.status === "completed"
              ? "Mark Pending"
              : "Mark Completed"
          }
        </button>


        <button
          class="edit-button"
          onclick="editTask('${task._id}')"
        >
          Edit
        </button>


        <button
          class="delete-button"
          onclick="deleteTask('${task._id}')"
        >
          Delete
        </button>

      </div>

    `;


    taskList.appendChild(taskCard);

  });

}


// ===============================
// ADD / UPDATE TASK
// ===============================

taskForm.addEventListener("submit", async function (event) {

  event.preventDefault();


  const title = titleInput.value.trim();

  const description =
    descriptionInput.value.trim();

  const deadline =
    deadlineInput.value;

  const priority =
    priorityInput.value;


  if (!title || !deadline) {

    showMessage(
      "Title and deadline are required.",
      "error"
    );

    return;
  }


  const taskData = {

    title,

    description,

    deadline,

    priority

  };


  try {

    let response;


    // EDIT MODE
    if (editingTaskId) {

      response = await fetch(
        `${API_URL}/${editingTaskId}`,
        {
          method: "PUT",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify(taskData)
        }
      );

    }

    // CREATE MODE
    else {

      response = await fetch(
        API_URL,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify(taskData)
        }
      );

    }


    if (!response.ok) {

      throw new Error(
        "Unable to save task"
      );

    }


    await response.json();


    showMessage(
      editingTaskId
        ? "Task updated successfully."
        : "Task added successfully.",
      "success"
    );


    resetForm();

    loadTasks();


  } catch (error) {

    console.error(error);

    showMessage(
      "Something went wrong while saving the task.",
      "error"
    );

  }

});


// ===============================
// GET SINGLE TASK
// ===============================

async function editTask(id) {

  try {

    const response =
      await fetch(`${API_URL}/${id}`);


    if (!response.ok) {

      throw new Error(
        "Unable to fetch task"
      );

    }


    const task =
      await response.json();


    if (!task) {

      throw new Error(
        "Task not found"
      );

    }


    editingTaskId = id;


    titleInput.value =
      task.title || "";


    descriptionInput.value =
      task.description || "";


    deadlineInput.value =
      formatDateForInput(task.deadline);


    priorityInput.value =
      task.priority || "medium";


    formTitle.textContent =
      "Edit Task";


    submitButton.textContent =
      "Update Task";


    cancelEditButton.classList.remove(
      "hidden"
    );


    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });


  } catch (error) {

    console.error(error);

    showMessage(
      "Unable to load task for editing.",
      "error"
    );

  }

}


// ===============================
// TOGGLE STATUS
// ===============================

async function toggleTaskStatus(
  id,
  currentStatus
) {

  const newStatus =
    currentStatus === "completed"
      ? "pending"
      : "completed";


  try {

    const response =
      await fetch(
        `${API_URL}/${id}`,
        {

          method: "PUT",

          headers: {
            "Content-Type": "application/json"
          },

          body: JSON.stringify({
            status: newStatus
          })

        }
      );


    if (!response.ok) {

      throw new Error(
        "Unable to update status"
      );

    }


    loadTasks();


  } catch (error) {

    console.error(error);

    alert(
      "Unable to update task status."
    );

  }

}


// ===============================
// DELETE TASK
// ===============================

async function deleteTask(id) {

  const confirmed =
    confirm(
      "Are you sure you want to delete this task?"
    );


  if (!confirmed) {
    return;
  }


  try {

    const response =
      await fetch(
        `${API_URL}/${id}`,
        {
          method: "DELETE"
        }
      );


    if (!response.ok) {

      throw new Error(
        "Unable to delete task"
      );

    }


    loadTasks();


  } catch (error) {

    console.error(error);

    alert(
      "Unable to delete task."
    );

  }

}


// ===============================
// CANCEL EDIT
// ===============================

cancelEditButton.addEventListener(
  "click",
  resetForm
);


function resetForm() {

  editingTaskId = null;

  taskForm.reset();

  priorityInput.value = "medium";

  formTitle.textContent =
    "Add New Task";

  submitButton.textContent =
    "Add Task";

  cancelEditButton.classList.add(
    "hidden"
  );

  formMessage.textContent = "";

}


// ===============================
// HELPERS
// ===============================

function formatDate(date) {

  if (!date) {
    return "N/A";
  }

  return new Date(date)
    .toLocaleDateString(
      "en-IN",
      {
        day: "numeric",
        month: "short",
        year: "numeric"
      }
    );

}


function formatDateForInput(date) {

  if (!date) {
    return "";
  }

  const d = new Date(date);

  const year =
    d.getFullYear();

  const month =
    String(d.getMonth() + 1)
      .padStart(2, "0");

  const day =
    String(d.getDate())
      .padStart(2, "0");

  return `${year}-${month}-${day}`;

}


function capitalize(value) {

  if (!value) {
    return "";

  }

  return value.charAt(0).toUpperCase()
    + value.slice(1);

}


function escapeHTML(value) {

  const div =
    document.createElement("div");

  div.textContent =
    value || "";

  return div.innerHTML;

}


function showMessage(
  message,
  type
) {

  formMessage.textContent =
    message;

  formMessage.className =
    type;

}


// ===============================
// INITIAL LOAD
// ===============================

loadTasks();