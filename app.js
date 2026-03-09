// Deadline Tracker - app.js

const STORAGE_KEY = 'deadline_tracker_items';

let deadlines = loadDeadlines();

// ── DOM references ──────────────────────────────────────────────────────────
const form          = document.getElementById('deadline-form');
const titleInput    = document.getElementById('title');
const descInput     = document.getElementById('description');
const dateInput     = document.getElementById('due-date');
const filterSelect  = document.getElementById('filter');
const sortSelect    = document.getElementById('sort');
const searchInput   = document.getElementById('search');
const listEl        = document.getElementById('deadline-list');
const countEl       = document.getElementById('deadline-count');

// ── Persistence ─────────────────────────────────────────────────────────────
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

// ── Status helpers ───────────────────────────────────────────────────────────
function getStatus(deadline) {
  if (deadline.completed) return 'completed';
  const now  = new Date();
  const due  = new Date(deadline.dueDate + 'T23:59:59');
  const diff = (due - now) / (1000 * 60 * 60 * 24); // days remaining
  if (diff < 0)  return 'overdue';
  if (diff <= 3) return 'due-soon';
  return 'upcoming';
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysLabel(deadline) {
  if (deadline.completed) return '';
  const now  = new Date();
  const due  = new Date(deadline.dueDate + 'T23:59:59');
  const diff = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
  if (diff < 0)  return `${Math.abs(diff)} day${Math.abs(diff) !== 1 ? 's' : ''} overdue`;
  if (diff === 0) return 'Due today';
  return `${diff} day${diff !== 1 ? 's' : ''} left`;
}

// ── Render ───────────────────────────────────────────────────────────────────
function getFilteredSorted() {
  const filter = filterSelect.value;
  const sort   = sortSelect.value;
  const query  = searchInput.value.trim().toLowerCase();

  let items = deadlines.filter(d => {
    const status = getStatus(d);
    if (filter === 'active'    && (status === 'completed')) return false;
    if (filter === 'completed' && status !== 'completed') return false;
    if (filter === 'overdue'   && status !== 'overdue') return false;
    if (filter === 'due-soon'  && status !== 'due-soon') return false;
    if (query && !d.title.toLowerCase().includes(query) && !d.description.toLowerCase().includes(query)) return false;
    return true;
  });

  items.sort((a, b) => {
    if (sort === 'date-asc')  return a.dueDate.localeCompare(b.dueDate);
    if (sort === 'date-desc') return b.dueDate.localeCompare(a.dueDate);
    if (sort === 'title')     return a.title.localeCompare(b.title);
    // default: newest added first
    return b.id - a.id;
  });

  return items;
}

function renderList() {
  const items = getFilteredSorted();
  countEl.textContent = `Showing ${items.length} deadline${items.length !== 1 ? 's' : ''}`;

  if (items.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        No deadlines found. Add one above!
      </div>`;
    return;
  }

  listEl.innerHTML = items.map(d => {
    const status = getStatus(d);
    const label  = daysLabel(d);
    let badgeHTML = '';
    if (status === 'overdue')   badgeHTML = `<span class="deadline-badge badge-overdue">Overdue</span>`;
    if (status === 'due-soon')  badgeHTML = `<span class="deadline-badge badge-due-soon">Due soon</span>`;
    if (status === 'completed') badgeHTML = `<span class="deadline-badge badge-completed">Completed</span>`;

    const completeLabel = d.completed ? 'Undo' : 'Complete';
    const completeClass = d.completed ? 'btn-complete undo' : 'btn-complete';

    return `
      <div class="deadline-item ${status}" data-id="${d.id}">
        <div class="deadline-info">
          <div class="deadline-title">${escapeHtml(d.title)}</div>
          ${d.description ? `<div class="deadline-description">${escapeHtml(d.description)}</div>` : ''}
          <div class="deadline-meta">
            <span class="deadline-date">📅 ${formatDate(d.dueDate)}</span>
            ${label ? `<span>${label}</span>` : ''}
            ${badgeHTML}
          </div>
        </div>
        <div class="deadline-actions">
          <button class="${completeClass}" data-id="${d.id}" title="${completeLabel}">${completeLabel}</button>
          <button class="btn-delete" data-id="${d.id}" title="Delete">Delete</button>
        </div>
      </div>`;
  }).join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Event: Add deadline ───────────────────────────────────────────────────────
form.addEventListener('submit', e => {
  e.preventDefault();
  const title       = titleInput.value.trim();
  const description = descInput.value.trim();
  const dueDate     = dateInput.value;

  if (!title || !dueDate) return;

  const deadline = {
    id:          Date.now(),
    title,
    description,
    dueDate,
    completed:   false,
    createdAt:   new Date().toISOString(),
  };

  deadlines.unshift(deadline);
  saveDeadlines();
  renderList();

  form.reset();
  titleInput.focus();
});

// ── Event: Complete / Delete via delegation ───────────────────────────────────
listEl.addEventListener('click', e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const id = Number(btn.dataset.id);

  if (btn.classList.contains('btn-complete')) {
    const idx = deadlines.findIndex(d => d.id === id);
    if (idx !== -1) {
      deadlines[idx].completed = !deadlines[idx].completed;
      saveDeadlines();
      renderList();
    }
  }

  if (btn.classList.contains('btn-delete')) {
    if (confirm('Delete this deadline?')) {
      deadlines = deadlines.filter(d => d.id !== id);
      saveDeadlines();
      renderList();
    }
  }
});

// ── Event: Filters / Sort / Search ───────────────────────────────────────────
filterSelect.addEventListener('change', renderList);
sortSelect.addEventListener('change', renderList);
searchInput.addEventListener('input', renderList);

// ── Initial render ────────────────────────────────────────────────────────────
renderList();
