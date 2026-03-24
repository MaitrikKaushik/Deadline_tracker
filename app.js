/**
 * Deadline Tracker
 * Stores deadlines in localStorage and renders them dynamically.
 */

const STORAGE_KEY = 'deadline_tracker_v1';

// ── State ──────────────────────────────────────────────────────
let deadlines = loadDeadlines();

// ── DOM refs ───────────────────────────────────────────────────
const form         = document.getElementById('deadline-form');
const titleInput   = document.getElementById('title');
const descInput    = document.getElementById('description');
const dueDateInput = document.getElementById('due-date');
const priorityInput= document.getElementById('priority');
const titleError   = document.getElementById('title-error');
const dateError    = document.getElementById('date-error');
const deadlineList = document.getElementById('deadline-list');
const emptyState   = document.getElementById('empty-state');
const filterSelect = document.getElementById('filter');
const sortSelect   = document.getElementById('sort');
const summaryEl    = document.getElementById('summary');
const template     = document.getElementById('deadline-template');

// ── Init ───────────────────────────────────────────────────────
setMinDate();
renderList();

// ── Event listeners ────────────────────────────────────────────
form.addEventListener('submit', handleSubmit);
filterSelect.addEventListener('change', renderList);
sortSelect.addEventListener('change', renderList);

// ── Handlers ──────────────────────────────────────────────────
function handleSubmit(e) {
  e.preventDefault();
  if (!validate()) return;

  const deadline = {
    id:          crypto.randomUUID(),
    title:       titleInput.value.trim(),
    description: descInput.value.trim(),
    dueDate:     dueDateInput.value,
    priority:    priorityInput.value,
    completed:   false,
    createdAt:   new Date().toISOString(),
  };

  deadlines.push(deadline);
  saveDeadlines();
  renderList();
  form.reset();
  setMinDate();
  titleInput.focus();
}

function validate() {
  let valid = true;
  titleError.textContent = '';
  dateError.textContent  = '';

  if (!titleInput.value.trim()) {
    titleError.textContent = 'Please enter a title.';
    valid = false;
  }
  if (!dueDateInput.value) {
    dateError.textContent = 'Please select a due date.';
    valid = false;
  }
  return valid;
}

// ── Render ────────────────────────────────────────────────────
function renderList() {
  const filter = filterSelect.value;
  const sort   = sortSelect.value;

  let list = deadlines.filter(d => {
    if (filter === 'active')    return !d.completed;
    if (filter === 'completed') return d.completed;
    return true;
  });

  list = sortDeadlines(list, sort);

  // Clear existing cards (keep empty-state node)
  Array.from(deadlineList.querySelectorAll('.deadline-card')).forEach(el => el.remove());

  if (list.length === 0) {
    emptyState.style.display = '';
    summaryEl.textContent = '';
    return;
  }

  emptyState.style.display = 'none';

  list.forEach(d => {
    const card = createCard(d);
    deadlineList.appendChild(card);
  });

  renderSummary();
}

function createCard(deadline) {
  const clone = template.content.cloneNode(true);
  const card  = clone.querySelector('.deadline-card');

  // Urgency
  const urgency = getUrgency(deadline);
  card.dataset.urgency = urgency;
  if (deadline.completed) card.classList.add('completed');

  // Content
  clone.querySelector('.card-title').textContent = deadline.title;
  clone.querySelector('.card-description').textContent = deadline.description;
  clone.querySelector('.due-label').textContent = formatDate(deadline.dueDate);
  clone.querySelector('.days-left').textContent = getDaysLeftLabel(deadline);

  const badge = clone.querySelector('.priority-badge');
  badge.textContent = priorityLabel(deadline.priority);
  badge.classList.add(deadline.priority);

  // Buttons
  const completeBtn = clone.querySelector('.complete-btn');
  completeBtn.setAttribute('aria-label',
    deadline.completed ? 'Mark as active' : 'Mark as complete');
  completeBtn.addEventListener('click', () => toggleComplete(deadline.id));

  clone.querySelector('.delete-btn').addEventListener('click', () => deleteDeadline(deadline.id));

  return clone;
}

// ── Actions ───────────────────────────────────────────────────
function toggleComplete(id) {
  const d = deadlines.find(x => x.id === id);
  if (d) d.completed = !d.completed;
  saveDeadlines();
  renderList();
}

function deleteDeadline(id) {
  deadlines = deadlines.filter(x => x.id !== id);
  saveDeadlines();
  renderList();
}

// ── Helpers ───────────────────────────────────────────────────
function sortDeadlines(list, sort) {
  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
  return [...list].sort((a, b) => {
    if (sort === 'date-asc')  return a.dueDate.localeCompare(b.dueDate);
    if (sort === 'date-desc') return b.dueDate.localeCompare(a.dueDate);
    if (sort === 'priority')  return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    return 0;
  });
}

/**
 * Returns urgency string based on days remaining.
 * overdue  – past due
 * urgent   – 0-2 days left
 * soon     – 3-7 days left
 * ok       – > 7 days left
 * done     – completed
 */
function getUrgency(deadline) {
  if (deadline.completed) return 'done';
  const days = daysUntil(deadline.dueDate);
  if (days < 0)  return 'overdue';
  if (days <= 2) return 'urgent';
  if (days <= 7) return 'soon';
  return 'ok';
}

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Append T00:00:00 (no timezone) so the Date is parsed as local midnight,
  // matching `today`. Using bare `new Date(dateStr)` would give UTC midnight
  // and produce off-by-one errors in non-UTC timezones.
  const due = new Date(dateStr + 'T00:00:00');
  if (isNaN(due.getTime())) return 0;
  return Math.floor((due - today) / 86_400_000);
}

function getDaysLeftLabel(deadline) {
  if (deadline.completed) return '✓ Done';
  const days = daysUntil(deadline.dueDate);
  if (days < 0)  return `${Math.abs(days)}d overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return '1 day left';
  return `${days} days left`;
}

function formatDate(dateStr) {
  // Split YYYY-MM-DD manually to avoid timezone shift from Date parsing.
  // Fall back gracefully if the format is ever unexpected.
  const parts = (dateStr || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dateStr;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function priorityLabel(p) {
  return { low: '🟢 Low', medium: '🟡 Medium', high: '🔴 High' }[p] || p;
}

function setMinDate() {
  const today = new Date().toISOString().split('T')[0];
  dueDateInput.min = today;
}

function renderSummary() {
  const total     = deadlines.length;
  const completed = deadlines.filter(d => d.completed).length;
  const active    = total - completed;
  const overdue   = deadlines.filter(d => !d.completed && daysUntil(d.dueDate) < 0).length;

  let text = `${active} active · ${completed} completed`;
  if (overdue > 0) text += ` · ⚠ ${overdue} overdue`;
  summaryEl.textContent = text;
}

// ── Persistence ───────────────────────────────────────────────
function loadDeadlines() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveDeadlines() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(deadlines));
}
