const screens = {
  welcome: document.getElementById("welcome-screen"),
  quiz: document.getElementById("quiz-screen"),
  results: document.getElementById("results-screen"),
};

const startButton = document.getElementById("start-button");
const nextButton = document.getElementById("next-button");
const playAgainButton = document.getElementById("play-again-button");
const answerList = document.getElementById("answer-list");
const questionTitle = document.getElementById("question-title");
const questionCounter = document.getElementById("question-counter");
const questionKicker = document.getElementById("question-kicker");
const progressTrack = document.getElementById("progress-track");
const progressFill = document.getElementById("progress-fill");
const selectionHint = document.getElementById("selection-hint");
const feedbackPanel = document.getElementById("feedback-panel");
const feedbackIcon = document.getElementById("feedback-icon");
const feedbackTitle = document.getElementById("feedback-title");
const feedbackExplanation = document.getElementById("feedback-explanation");
const reviewToggle = document.getElementById("review-toggle");
const reviewList = document.getElementById("review-list");

const answerLetters = ["A", "B", "C", "D"];
let currentQuestion = null;
let selectedOption = null;
let isAnswered = false;
let isBusy = false;

function showScreen(name) {
  for (const [screenName, element] of Object.entries(screens)) {
    element.hidden = screenName !== name;
  }
}

function showError(elementId, message) {
  const element = document.getElementById(elementId);
  element.textContent = message;
  element.hidden = !message;
}

async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("Could not reach the quiz server. Check your connection and try again.");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The quiz server returned an unexpected response. Please try again.");
  }

  if (!response.ok) {
    throw new Error(payload.error || "Something went wrong. Please try again.");
  }
  return payload;
}

function updateProgress(answered, total) {
  const percentage = total > 0 ? answered / total * 100 : 0;
  progressFill.style.width = `${percentage}%`;
  progressTrack.setAttribute("aria-valuemax", String(total));
  progressTrack.setAttribute("aria-valuenow", String(answered));
}

function renderQuestion(data) {
  currentQuestion = data.question;
  selectedOption = null;
  isAnswered = false;
  isBusy = false;

  questionCounter.textContent = `Question ${data.question_number} of ${data.total}`;
  questionKicker.textContent = `QUESTION ${String(data.question_number).padStart(2, "0")}`;
  questionTitle.textContent = currentQuestion.question;
  answerList.replaceChildren();
  feedbackPanel.hidden = true;
  feedbackPanel.classList.remove("is-incorrect");
  nextButton.textContent = "Next question →";
  nextButton.disabled = true;
  selectionHint.textContent = "Pick an answer to continue";
  updateProgress(data.answered, data.total);

  currentQuestion.options.forEach((option, index) => {
    const button = document.createElement("button");
    const letter = document.createElement("span");
    const text = document.createElement("span");

    button.type = "button";
    button.className = "answer-button";
    button.dataset.option = String(index);
    letter.className = "answer-letter";
    letter.textContent = answerLetters[index];
    text.className = "answer-text";
    text.textContent = option;
    button.append(letter, text);
    answerList.append(button);
  });

  showScreen("quiz");
  questionTitle.focus({ preventScroll: true });
}

function showFeedback(feedback, total) {
  isAnswered = true;
  selectedOption = feedback.selected_option;
  const answerButtons = answerList.querySelectorAll(".answer-button");

  answerButtons.forEach((button, index) => {
    button.disabled = true;
    button.classList.remove("is-selected");
    if (index === feedback.correct_option) {
      button.classList.add("is-correct");
    } else if (index === feedback.selected_option && !feedback.correct) {
      button.classList.add("is-incorrect");
    }
  });

  feedbackPanel.classList.toggle("is-incorrect", !feedback.correct);
  feedbackIcon.textContent = feedback.correct ? "✓" : "!";
  feedbackTitle.textContent = feedback.correct ? "That’s correct!" : "Not quite this time";
  feedbackExplanation.textContent = feedback.explanation;
  feedbackPanel.hidden = false;
  nextButton.disabled = false;
  nextButton.innerHTML = feedback.answered === total
    ? "See your results <span aria-hidden=\"true\">→</span>"
    : "Continue <span aria-hidden=\"true\">→</span>";
  selectionHint.textContent = "Answer submitted";
  updateProgress(feedback.answered, total);
}

function renderResults(results) {
  document.getElementById("results-message").textContent = results.message;
  document.getElementById("score-percentage").textContent = `${results.percentage}%`;
  document.getElementById("score-fraction").textContent = `${results.score} / ${results.total}`;
  document.getElementById("correct-count").textContent = String(results.correct);
  document.getElementById("incorrect-count").textContent = String(results.incorrect);

  const scoreRing = document.getElementById("score-ring");
  const scoreAngle = results.percentage * 3.6;
  scoreRing.style.background = `conic-gradient(#7358e8 0deg, #4c81ee ${scoreAngle}deg, #eeeef5 ${scoreAngle}deg 360deg)`;
  scoreRing.setAttribute("aria-label", `Your score: ${results.percentage} percent`);

  reviewList.replaceChildren();
  for (const [index, item] of results.review.entries()) {
    const article = document.createElement("article");
    const heading = document.createElement("h2");
    const answer = document.createElement("p");
    const explanation = document.createElement("p");

    article.className = "review-item";
    heading.textContent = `${index + 1}. ${item.question}`;
    answer.className = item.correct ? "review-result-correct" : "review-result-incorrect";
    answer.textContent = item.correct
      ? `Correct: ${answerLetters[item.correct_option]}. ${item.options[item.correct_option]}`
      : `Your answer: ${answerLetters[item.selected_option]}. ${item.options[item.selected_option]} · Correct: ${answerLetters[item.correct_option]}. ${item.options[item.correct_option]}`;
    explanation.textContent = item.explanation;
    article.append(heading, answer, explanation);
    reviewList.append(article);
  }

  reviewToggle.setAttribute("aria-expanded", "false");
  reviewList.hidden = true;
  showScreen("results");
  document.getElementById("results-title").focus({ preventScroll: true });
}

async function startQuiz() {
  if (isBusy) return;
  isBusy = true;
  startButton.disabled = true;
  showError("welcome-error", "");
  try {
    const data = await apiRequest("/api/quiz/start", { method: "POST" });
    updateProgress(0, data.total);
    renderQuestion(data);
  } catch (error) {
    showError("welcome-error", error.message);
  } finally {
    isBusy = false;
    startButton.disabled = false;
  }
}

async function submitAnswer() {
  if (isBusy || isAnswered || selectedOption === null) return;
  isBusy = true;
  nextButton.disabled = true;
  showError("quiz-error", "");
  try {
    const feedback = await apiRequest("/api/quiz/answer", {
      method: "POST",
      body: JSON.stringify({ option: selectedOption }),
    });
    showFeedback(feedback, feedback.total);
  } catch (error) {
    showError("quiz-error", error.message);
    nextButton.disabled = false;
  } finally {
    isBusy = false;
  }
}

async function advanceQuiz() {
  if (isBusy || !isAnswered) return;
  isBusy = true;
  nextButton.disabled = true;
  showError("quiz-error", "");
  try {
    const data = await apiRequest("/api/quiz/next", { method: "POST" });
    if (data.completed) {
      renderResults(data.results);
    } else {
      renderQuestion(data);
    }
  } catch (error) {
    showError("quiz-error", error.message);
    nextButton.disabled = false;
  } finally {
    isBusy = false;
  }
}

async function resumeQuiz() {
  try {
    const data = await apiRequest("/api/quiz/current");
    if (!data.started) return;

    if (data.completed) {
      renderResults(data.results);
      return;
    }

    renderQuestion(data);
    if (data.feedback) {
      showFeedback(data.feedback, data.total);
    }
  } catch (error) {
    showError("welcome-error", error.message);
  }
}

startButton.addEventListener("click", startQuiz);

answerList.addEventListener("click", (event) => {
  const button = event.target.closest(".answer-button");
  if (!button || isAnswered || isBusy || !answerList.contains(button)) return;

  selectedOption = Number(button.dataset.option);
  answerList.querySelectorAll(".answer-button").forEach((answerButton) => {
    answerButton.classList.toggle("is-selected", answerButton === button);
  });
  nextButton.disabled = false;
  selectionHint.textContent = `${answerLetters[selectedOption]} selected · Next to check your answer`;
  showError("quiz-error", "");
});

nextButton.addEventListener("click", () => {
  if (isAnswered) {
    advanceQuiz();
  } else {
    submitAnswer();
  }
});

playAgainButton.addEventListener("click", async () => {
  showScreen("welcome");
  await startQuiz();
});

reviewToggle.addEventListener("click", () => {
  const isExpanded = reviewToggle.getAttribute("aria-expanded") === "true";
  reviewToggle.setAttribute("aria-expanded", String(!isExpanded));
  reviewList.hidden = isExpanded;
});

resumeQuiz();
