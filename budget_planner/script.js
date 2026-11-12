const STORAGE_KEY = "student-expense-tracker-v1";
const DEFAULT_STATE = { budgetCents: 0, expenses: [] };

const budgetForm = document.getElementById("budget-form");
const budgetInput = document.getElementById("monthly-budget");
const expenseForm = document.getElementById("expense-form");
const descriptionInput = document.getElementById("expense-description");
const amountInput = document.getElementById("expense-amount");
const categoryInput = document.getElementById("expense-category");
const dateInput = document.getElementById("expense-date");
const expenseList = document.getElementById("expense-list");
const budgetSummary = document.getElementById("summary-budget");
const spentSummary = document.getElementById("summary-spent");
const remainingSummary = document.getElementById("summary-remaining");
const statusMessage = document.getElementById("tracker-status");

const currencyFormatter = new Intl.NumberFormat(undefined, {
  style: "currency",
  currency: "USD",
});

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidExpense(expense) {
  return (
    expense !== null &&
    typeof expense === "object" &&
    typeof expense.id === "string" &&
    expense.id.length > 0 &&
    typeof expense.description === "string" &&
    expense.description.trim().length > 0 &&
    Number.isSafeInteger(expense.amountCents) &&
    expense.amountCents > 0 &&
    typeof expense.category === "string" &&
    expense.category.length > 0 &&
    isValidDate(expense.date)
  );
}

function isValidState(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Number.isSafeInteger(value.budgetCents) &&
    value.budgetCents >= 0 &&
    Array.isArray(value.expenses) &&
    value.expenses.every(isValidExpense)
  );
}

function setStatus(message, state = "") {
  statusMessage.textContent = message;
  if (state) {
    statusMessage.dataset.state = state;
  } else {
    delete statusMessage.dataset.state;
  }
}

function loadState() {
  try {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState === null) {
      return { ...DEFAULT_STATE, expenses: [] };
    }

    const parsedState = JSON.parse(savedState);
    if (!isValidState(parsedState)) {
      setStatus("Saved tracker data could not be read because it is invalid. New changes will replace it.", "error");
      return { ...DEFAULT_STATE, expenses: [] };
    }

    return parsedState;
  } catch (error) {
    const message = error instanceof SyntaxError
      ? "Saved tracker data could not be read. New changes will replace it."
      : "Browser storage is unavailable. Your changes will not persist after you close this page.";
    setStatus(message, "error");
    return { ...DEFAULT_STATE, expenses: [] };
  }
}

let state = loadState();

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    setStatus("Could not save to browser storage. Your changes will be lost when you close this page.", "error");
    return false;
  }
}

function formatMoney(cents) {
  return currencyFormatter.format(cents / 100);
}

function getLocalDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthKey() {
  return getLocalDateValue().slice(0, 7);
}

function getCurrentMonthSpent() {
  const monthKey = getCurrentMonthKey();
  return state.expenses.reduce(
    (total, expense) => expense.date.startsWith(monthKey) ? total + expense.amountCents : total,
    0,
  );
}

function getCategoryLabel(value) {
  const option = Array.from(categoryInput.options).find((item) => item.value === value);
  return option ? option.textContent : value;
}

function renderExpenses() {
  expenseList.replaceChildren();

  if (state.expenses.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.textContent = "No expenses yet. Add your first expense above to get started.";
    row.append(cell);
    expenseList.append(row);
    return;
  }

  const sortedExpenses = [...state.expenses].sort((first, second) => {
    return second.date.localeCompare(first.date) || second.id.localeCompare(first.id);
  });

  for (const expense of sortedExpenses) {
    const row = document.createElement("tr");
    const descriptionCell = document.createElement("td");
    const categoryCell = document.createElement("td");
    const dateCell = document.createElement("td");
    const amountCell = document.createElement("td");
    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");

    descriptionCell.textContent = expense.description;
    categoryCell.textContent = getCategoryLabel(expense.category);
    dateCell.textContent = new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(`${expense.date}T00:00:00`));
    amountCell.textContent = formatMoney(expense.amountCents);
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.dataset.expenseId = expense.id;
    deleteButton.textContent = "Delete";
    deleteButton.setAttribute("aria-label", `Delete expense: ${expense.description}`);

    actionCell.append(deleteButton);
    row.append(descriptionCell, categoryCell, dateCell, amountCell, actionCell);
    expenseList.append(row);
  }
}

function renderSummary() {
  const spentCents = getCurrentMonthSpent();
  budgetSummary.textContent = formatMoney(state.budgetCents);
  spentSummary.textContent = formatMoney(spentCents);
  remainingSummary.textContent = formatMoney(state.budgetCents - spentCents);
}

function render() {
  renderSummary();
  renderExpenses();
}

function parsePositiveCents(input) {
  const amount = Number(input.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const scaledAmount = amount * 100;
  const cents = Math.round(scaledAmount);
  return Number.isSafeInteger(cents) && cents > 0 && Math.abs(scaledAmount - cents) < 1e-7
    ? cents
    : null;
}

function createExpenseId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

budgetForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const budgetCents = parsePositiveCents(budgetInput);
  if (budgetCents === null) {
    setStatus("Enter a budget greater than zero with no more than two decimal places.", "error");
    budgetInput.focus();
    return;
  }

  state = { ...state, budgetCents };
  const saved = saveState();
  renderSummary();
  budgetInput.value = (budgetCents / 100).toFixed(2);
  if (saved) {
    setStatus("Monthly budget saved.", "success");
  }
});

expenseForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const description = descriptionInput.value.trim();
  const amountCents = parsePositiveCents(amountInput);
  const category = categoryInput.value;
  const date = dateInput.value;

  if (!description) {
    setStatus("Enter a description for this expense.", "error");
    descriptionInput.focus();
    return;
  }
  if (amountCents === null) {
    setStatus("Enter an expense amount greater than zero with no more than two decimal places.", "error");
    amountInput.focus();
    return;
  }
  if (!category || !Array.from(categoryInput.options).some((option) => option.value === category)) {
    setStatus("Choose a valid expense category.", "error");
    categoryInput.focus();
    return;
  }
  if (!isValidDate(date)) {
    setStatus("Choose a valid expense date.", "error");
    dateInput.focus();
    return;
  }

  const expense = {
    id: createExpenseId(),
    description,
    amountCents,
    category,
    date,
  };

  if (
    expense.date.startsWith(getCurrentMonthKey()) &&
    getCurrentMonthSpent() + expense.amountCents > Number.MAX_SAFE_INTEGER
  ) {
    setStatus("This expense would make the monthly total too large to calculate safely.", "error");
    amountInput.focus();
    return;
  }

  state = { ...state, expenses: [...state.expenses, expense] };
  const saved = saveState();
  render();
  expenseForm.reset();
  dateInput.value = getLocalDateValue();
  if (saved) {
    setStatus("Expense added.", "success");
  }
});

expenseList.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) {
    return;
  }

  const deleteButton = event.target.closest("button[data-expense-id]");
  if (!deleteButton || !expenseList.contains(deleteButton)) {
    return;
  }

  const expenseId = deleteButton.dataset.expenseId;
  const expense = state.expenses.find((item) => item.id === expenseId);
  if (!expense) {
    setStatus("That expense could not be found. Refresh the page and try again.", "error");
    return;
  }

  state = {
    ...state,
    expenses: state.expenses.filter((item) => item.id !== expenseId),
  };
  const saved = saveState();
  render();
  if (saved) {
    setStatus(`Deleted expense: ${expense.description}.`, "success");
  }
});

budgetInput.value = state.budgetCents > 0 ? (state.budgetCents / 100).toFixed(2) : "";
dateInput.value = getLocalDateValue();
render();