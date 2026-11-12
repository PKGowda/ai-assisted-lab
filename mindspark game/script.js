"use strict";

const STORAGE_KEY = "mindspark-progress-v1";
const GAME_INFO = {
	memory: { title: "Memory Matrix", category: "Memory", label: "MEMORY" },
	number: { title: "Number Detective", category: "Logic", label: "LOGIC" },
	color: { title: "Color Confusion", category: "Focus", label: "FOCUS" },
	reflex: { title: "Reflex Challenge", category: "Speed", label: "SPEED" },
	pattern: { title: "Pattern Master", category: "Logic", label: "LOGIC" }
};
const SKILLS = ["Memory", "Logic", "Focus", "Speed"];
const LEVELS = {
	easy: { seconds: 90, points: 80, grid: 3 },
	medium: { seconds: 75, points: 100, grid: 4 },
	hard: { seconds: 60, points: 120, grid: 5 }
};
const COLORS = [
	{ name: "RED", value: "#ff7789" },
	{ name: "BLUE", value: "#69bfff" },
	{ name: "GREEN", value: "#7de0a7" },
	{ name: "YELLOW", value: "#ffd36f" }
];
const SYMBOLS = ["○", "△", "□", "◇", "☆"];
const ROUND_COUNT = 5;

const dashboard = document.querySelector("#dashboard");
const gameView = document.querySelector("#gameView");
const gameContent = document.querySelector("#gameContent");
const difficultySelect = document.querySelector("#difficultySelect");
const progress = loadProgress();
const timers = new Set();
let countdownInterval = null;
let game = null;

function emptyProgress() {
	return {
		totalPoints: 0,
		bestScore: 0,
		completedChallenges: 0,
		skills: Object.fromEntries(SKILLS.map((skill) => [skill, { correct: 0, total: 0 }]))
	};
}

function loadProgress() {
	const fallback = emptyProgress();
	try {
		const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
		if (!saved || typeof saved !== "object") return fallback;
		fallback.totalPoints = validNumber(saved.totalPoints);
		fallback.bestScore = validNumber(saved.bestScore);
		fallback.completedChallenges = validNumber(saved.completedChallenges);
		for (const skill of SKILLS) {
			const metric = saved.skills?.[skill];
			if (metric && typeof metric === "object") {
				fallback.skills[skill] = {
					correct: validNumber(metric.correct),
					total: validNumber(metric.total)
				};
				fallback.skills[skill].correct = Math.min(fallback.skills[skill].correct, fallback.skills[skill].total);
			}
		}
	} catch {
		return fallback;
	}
	return fallback;
}

function validNumber(value) {
	return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function saveProgress() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
	} catch {
		// The game remains playable when browser storage is unavailable.
	}
}

function renderDashboard() {
	document.querySelector("#totalPoints").textContent = progress.totalPoints.toLocaleString();
	document.querySelector("#bestScore").textContent = progress.bestScore.toLocaleString();
	document.querySelector("#completedCount").textContent = progress.completedChallenges.toLocaleString();
	document.querySelector("#todayLabel").textContent = new Intl.DateTimeFormat(undefined, {
		weekday: "short", month: "short", day: "numeric"
	}).format(new Date());

	const dailyGame = getDailyGame();
	document.querySelector("#dailyDescription").textContent = `Today's spark: ${GAME_INFO[dailyGame].title}. Your challenge is the same all day.`;
	document.querySelector("#radarMetrics").innerHTML = SKILLS.map((skill) => {
		const metric = progress.skills[skill];
		const score = metric.total ? Math.round((metric.correct / metric.total) * 100) : 0;
		return `<div class="radar-metric">
			<div class="radar-metric-head"><span>${skill}</span><strong>${metric.total ? `${score}%` : "Not yet played"}</strong></div>
			<div class="meter-track" role="meter" aria-label="${skill} performance" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${score}"><div class="meter-fill" style="width: ${score}%"></div></div>
		</div>`;
	}).join("");
}

function getDailyGame() {
	const date = new Date();
	const dateKey = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
	const dateSeed = [...dateKey].reduce((sum, character) => sum + character.charCodeAt(0), 0);
	return Object.keys(GAME_INFO)[dateSeed % Object.keys(GAME_INFO).length];
}

function clearGameTimers() {
	for (const timer of timers) clearTimeout(timer);
	timers.clear();
	if (countdownInterval !== null) clearInterval(countdownInterval);
	countdownInterval = null;
}

function schedule(callback, delay) {
	const timer = setTimeout(() => {
		timers.delete(timer);
		callback();
	}, delay);
	timers.add(timer);
	return timer;
}

function startGame(gameId, isDaily = false) {
	if (!GAME_INFO[gameId]) return;
	clearGameTimers();
	const difficulty = LEVELS[difficultySelect.value] ? difficultySelect.value : "medium";
	game = {
		id: gameId,
		difficulty,
		isDaily,
		round: 1,
		score: 0,
		correct: 0,
		attempts: 0,
		timeLeft: LEVELS[difficulty].seconds,
		phase: "starting",
		accepting: false,
		targetReady: false,
		questionStartedAt: Date.now(),
		currentQuestion: null
	};
	dashboard.hidden = true;
	gameView.hidden = false;
	renderGameShell();
	updateGameStats();
	countdownInterval = setInterval(() => {
		if (!game || game.phase === "complete") return;
		game.timeLeft = Math.max(0, game.timeLeft - 1);
		updateGameStats();
		if (game.timeLeft === 0) finishGame(true);
	}, 1000);
	startRound();
}

function renderGameShell() {
	const info = GAME_INFO[game.id];
	gameContent.innerHTML = `
		<header class="game-header">
			<button class="text-button" type="button" data-action="dashboard">← Dashboard</button>
			<div class="game-title-block"><p class="eyebrow">${game.isDaily ? "TODAY'S DAILY SPARK" : info.label + " CHALLENGE"}</p><h1>${info.title}</h1></div>
			<div class="game-header-actions"><span class="section-note">${game.difficulty[0].toUpperCase()}${game.difficulty.slice(1)}</span><button class="text-button" type="button" data-action="restart">↻ Restart</button></div>
		</header>
		<section class="session-stats" aria-label="Current challenge status">
			<div class="session-stat"><span>Score</span><strong id="sessionScore">0</strong></div>
			<div class="session-stat"><span>Accuracy</span><strong id="sessionAccuracy">0%</strong></div>
			<div class="session-stat"><span>Time left</span><strong id="sessionTime">${game.timeLeft}s</strong></div>
		</section>
		<div class="progress-wrap"><div class="progress-label"><span>Challenge progress</span><span id="progressText">Round 1 of ${ROUND_COUNT}</span></div><div class="progress-track" role="progressbar" aria-label="Challenge progress" aria-valuemin="0" aria-valuemax="${ROUND_COUNT}" aria-valuenow="0"><div class="progress-fill" id="progressFill"></div></div></div>
		<section class="challenge-panel" aria-live="polite">
			<div class="challenge-prompt" id="challengePrompt"></div>
			<div class="answer-area" id="answerArea"></div>
			<p class="feedback" id="feedback" aria-live="assertive"></p>
		</section>`;
}

function updateGameStats() {
	if (!game) return;
	const scoreElement = document.querySelector("#sessionScore");
	if (!scoreElement) return;
	document.querySelector("#sessionScore").textContent = game.score.toLocaleString();
	document.querySelector("#sessionAccuracy").textContent = `${game.attempts ? Math.round((game.correct / game.attempts) * 100) : 0}%`;
	document.querySelector("#sessionTime").textContent = `${game.timeLeft}s`;
	document.querySelector("#progressText").textContent = `Round ${Math.min(game.round, ROUND_COUNT)} of ${ROUND_COUNT}`;
	const completedRounds = Math.min(game.round - 1, ROUND_COUNT);
	document.querySelector("#progressFill").style.width = `${(completedRounds / ROUND_COUNT) * 100}%`;
	document.querySelector(".progress-track").setAttribute("aria-valuenow", completedRounds);
}

function startRound() {
	if (!game || game.timeLeft <= 0) return;
	game.accepting = false;
	game.targetReady = false;
	game.phase = "answering";
	game.questionStartedAt = Date.now();
	const feedback = document.querySelector("#feedback");
	feedback.textContent = "";
	feedback.className = "feedback";
	updateGameStats();
	if (game.id === "memory") startMemoryRound();
	else if (game.id === "number") showMultipleChoice(makeNumberQuestion());
	else if (game.id === "color") showColorQuestion();
	else if (game.id === "reflex") startReflexRound();
	else showMultipleChoice(makePatternQuestion());
}

function setPrompt(title, detail = "") {
	document.querySelector("#challengePrompt").innerHTML = `<div><h2>${title}</h2>${detail ? `<p>${detail}</p>` : ""}</div>`;
}

function showMultipleChoice(question) {
	game.currentQuestion = question;
	game.accepting = true;
	setPrompt(question.title, question.instruction || "Choose the best answer.");
	document.querySelector("#answerArea").innerHTML = `<div class="sequence-text">${question.display}</div><div class="choice-grid">${question.choices.map((choice) => `<button class="choice-button" type="button" data-answer="${String(choice).replaceAll('"', "&quot;")}">${choice}</button>`).join("")}</div>`;
	game.questionStartedAt = Date.now();
}

function makeNumberQuestion() {
	const level = game.difficulty;
	const patternType = level === "easy" ? randomInt(0, 1) : level === "medium" ? randomInt(0, 2) : randomInt(0, 3);
	let sequence;
	let answer;
	let explanation;
	if (patternType === 0) {
		const start = randomInt(1, 8);
		const step = randomInt(2, 5);
		sequence = Array.from({ length: 4 }, (_, index) => start + (step * index));
		answer = start + (step * 4);
		explanation = `Each number increases by ${step}.`;
	} else if (patternType === 1) {
		const start = randomInt(2, 5);
		sequence = Array.from({ length: 4 }, (_, index) => start * (2 ** index));
		answer = start * 16;
		explanation = "Each number is doubled.";
	} else if (patternType === 2) {
		const start = randomInt(1, 4);
		const step = randomInt(2, 4);
		sequence = Array.from({ length: 4 }, (_, index) => start + (step * index * (index + 1)) / 2);
		answer = start + (step * 10);
		explanation = `The increases grow by ${step} each time.`;
	} else {
		const first = randomInt(1, 4);
		const second = randomInt(2, 6);
		sequence = [first, second];
		while (sequence.length < 4) sequence.push(sequence.at(-1) + sequence.at(-2));
		answer = sequence.at(-1) + sequence.at(-2);
		explanation = "Each number is the sum of the two before it.";
	}
	const choices = makeNumberChoices(answer);
	return { title: "What number comes next?", display: `${sequence.join(", ")}, <span class="brand-accent">?</span>`, choices, answer, explanation };
}

function makeNumberChoices(answer) {
	const offsets = [-5, -2, 2, 5, 8];
	const choices = new Set([answer]);
	while (choices.size < 4) choices.add(Math.max(0, answer + offsets[randomInt(0, offsets.length - 1)]));
	return shuffle([...choices]);
}

function makePatternQuestion() {
	const offset = randomInt(0, SYMBOLS.length - 1);
	const step = game.difficulty === "easy" ? 1 : randomInt(1, 2);
	const sequence = Array.from({ length: 4 }, (_, index) => SYMBOLS[(offset + (step * index)) % SYMBOLS.length]);
	const answer = SYMBOLS[(offset + (step * 4)) % SYMBOLS.length];
	return {
		title: "Which symbol comes next?",
		display: sequence.join("　") + "　<span class=\"brand-accent\">?</span>",
		choices: shuffle([...SYMBOLS]),
		answer,
		explanation: `The pattern moves ${step === 1 ? "forward one" : "forward two"} symbol${step === 1 ? "" : "s"} each time.`
	};
}

function showColorQuestion() {
	const word = COLORS[randomInt(0, COLORS.length - 1)];
	let ink = COLORS[randomInt(0, COLORS.length - 1)];
	while (ink.name === word.name) ink = COLORS[randomInt(0, COLORS.length - 1)];
	game.currentQuestion = { answer: ink.name, explanation: `The letters were printed in ${ink.name.toLowerCase()}.` };
	game.accepting = true;
	setPrompt("Name the ink color", "Ignore the word itself. Choose the color of the letters.");
	document.querySelector("#answerArea").innerHTML = `<div class="color-word" style="color: ${ink.value}">${word.name}</div><div class="choice-grid">${COLORS.map((color) => `<button class="choice-button color-choice" type="button" data-answer="${color.name}"><span class="color-swatch" style="background: ${color.value}; color: ${color.value}"></span>${color.name[0] + color.name.slice(1).toLowerCase()}</button>`).join("")}</div>`;
	game.questionStartedAt = Date.now();
}

function startMemoryRound() {
	const gridSize = LEVELS[game.difficulty].grid;
	const length = 2 + game.round + (game.difficulty === "hard" ? 1 : 0);
	const sequence = Array.from({ length }, () => randomInt(0, gridSize * gridSize - 1));
	game.currentQuestion = { sequence, gridSize, index: 0 };
	game.phase = "showing";
	setPrompt("Watch the sequence", "The tiles will light up one at a time.");
	renderMemoryGrid(gridSize, false);
	const area = document.querySelector("#answerArea");
	area.insertAdjacentHTML("afterbegin", `<div class="sequence-text" id="memoryHint">Get ready...</div>`);

	const showTile = (index) => {
		if (!game || game.phase !== "showing") return;
		const tiles = document.querySelectorAll(".tile-button");
		tiles.forEach((tile) => tile.classList.remove("is-lit"));
		if (index >= sequence.length) {
			game.phase = "memory-input";
			game.accepting = true;
			game.currentQuestion.index = 0;
			document.querySelector("#memoryHint").textContent = "Repeat the sequence";
			setPrompt("Your turn", "Tap the same tiles in the same order.");
			tiles.forEach((tile) => { tile.disabled = false; });
			game.questionStartedAt = Date.now();
			return;
		}
		tiles[sequence[index]]?.classList.add("is-lit");
		schedule(() => showTile(index + 1), 620);
	};
	schedule(() => showTile(0), 650);
}

function renderMemoryGrid(gridSize, enabled) {
	const area = document.querySelector("#answerArea");
	area.insertAdjacentHTML("beforeend", `<div class="answer-grid tiles memory-grid" style="--grid-size: ${gridSize}" aria-label="Memory tiles">${Array.from({ length: gridSize * gridSize }, (_, index) => `<button class="tile-button" type="button" aria-label="Tile ${index + 1}" data-tile="${index}" ${enabled ? "" : "disabled"}></button>`).join("")}</div>`);
}

function startReflexRound() {
	game.phase = "waiting";
	game.targetReady = false;
	setPrompt("Stay ready", "Tap the target only when it appears. Early taps do not score.");
	document.querySelector("#answerArea").innerHTML = `<div class="reflex-zone" id="reflexZone"><div class="reflex-wait">Wait for the green target...<br>Round ${game.round} of ${ROUND_COUNT}</div></div>`;
	const delay = randomInt(900, 2200);
	schedule(() => {
		if (!game || game.phase !== "waiting") return;
		game.phase = "target";
		game.targetReady = true;
		game.questionStartedAt = Date.now();
		document.querySelector("#reflexZone").innerHTML = `<button type="button" class="reflex-target" data-action="reflex-target" aria-label="Target appeared. Click now.">TAP</button>`;
		setPrompt("Now!", "Tap the target as quickly as you can.");
	}, delay);
}

function handleAnswer(event) {
	if (!game) return;
	const actionButton = event.target.closest("[data-action]");
	if (actionButton?.dataset.action === "dashboard") {
		showDashboard();
		return;
	}
	if (actionButton?.dataset.action === "restart") {
		startGame(game.id, game.isDaily);
		return;
	}
	if (actionButton?.dataset.action === "result-restart") {
		startGame(game.id, game.isDaily);
		return;
	}
	if (actionButton?.dataset.action === "result-dashboard") {
		showDashboard();
		return;
	}
	if (game.phase === "complete") return;
	if (game.id === "reflex" && game.phase === "waiting" && event.target.closest("#answerArea")) {
		registerAnswer(false, "Too soon. Wait for the green target to appear.");
		return;
	}
	if (actionButton?.dataset.action === "reflex-target" && game.phase === "target" && game.targetReady) {
		const reaction = Date.now() - game.questionStartedAt;
		const speedBonus = reaction < 300 ? 50 : reaction < 500 ? 30 : reaction < 800 ? 15 : 0;
		registerAnswer(true, `Nice reaction: ${reaction} ms.`, speedBonus);
		return;
	}
	if (!game.accepting) return;
	const answerButton = event.target.closest("[data-answer]");
	if (answerButton) {
		const isCorrect = answerButton.dataset.answer === String(game.currentQuestion.answer);
		registerAnswer(isCorrect, isCorrect ? game.currentQuestion.explanation : `Not quite. ${game.currentQuestion.explanation}`);
		return;
	}
	const tileButton = event.target.closest("[data-tile]");
	if (tileButton && game.id === "memory" && game.phase === "memory-input") handleMemoryTile(Number(tileButton.dataset.tile));
}

function handleMemoryTile(tileIndex) {
	const question = game.currentQuestion;
	if (!game.accepting || game.phase !== "memory-input") return;
	const tiles = document.querySelectorAll(".tile-button");
	const expectedTile = question.sequence[question.index];
	if (tileIndex !== expectedTile) {
		registerAnswer(false, "That was a different tile. Watch the sequence closely next time.");
		return;
	}
	tiles[tileIndex]?.classList.add("is-lit");
	question.index += 1;
	if (question.index === question.sequence.length) {
		registerAnswer(true, `Sequence recalled: ${question.sequence.length} tiles.`);
	} else {
		schedule(() => tiles[tileIndex]?.classList.remove("is-lit"), 180);
	}
}

function registerAnswer(isCorrect, message, reflexBonus = null) {
	if (!game || !game.accepting && game.phase !== "waiting" && game.phase !== "target") return;
	game.accepting = false;
	game.targetReady = false;
	game.phase = "feedback";
	game.attempts += 1;
	const category = GAME_INFO[game.id].category;
	progress.skills[category].total += 1;
	if (isCorrect) {
		game.correct += 1;
		progress.skills[category].correct += 1;
		const elapsed = Date.now() - game.questionStartedAt;
		const speedBonus = reflexBonus === null ? Math.max(0, Math.round(35 * (1 - Math.min(elapsed, 10000) / 10000))) : reflexBonus;
		const gained = LEVELS[game.difficulty].points + speedBonus;
		game.score += gained;
		progress.totalPoints += gained;
		message += ` +${gained} points`;
	}
	saveProgress();
	const feedback = document.querySelector("#feedback");
	feedback.textContent = message;
	feedback.className = `feedback ${isCorrect ? "is-correct" : "is-wrong"}`;
	updateGameStats();
	const answerButtons = document.querySelectorAll(".choice-button, .tile-button, .reflex-target");
	answerButtons.forEach((button) => { button.disabled = true; });
	schedule(() => {
		if (!game || game.phase === "complete") return;
		if (game.round >= ROUND_COUNT) finishGame(false);
		else {
			game.round += 1;
			startRound();
		}
	}, 1050);
}

function finishGame(timedOut) {
	if (!game || game.phase === "complete") return;
	clearGameTimers();
	game.phase = "complete";
	game.accepting = false;
	progress.completedChallenges += 1;
	progress.bestScore = Math.max(progress.bestScore, game.score);
	saveProgress();
	const accuracy = game.attempts ? Math.round((game.correct / game.attempts) * 100) : 0;
	const title = timedOut ? "Time is up" : "Challenge complete";
	const message = timedOut ? "The clock ran out. Every round is another chance to learn the pattern." : "Well played. Your focus is adding up.";
	gameContent.innerHTML = `<section class="result-panel" aria-live="polite">
		<div class="result-mark" aria-hidden="true">${timedOut ? "⌁" : "✦"}</div>
		<p class="eyebrow">${game.isDaily ? "DAILY SPARK FINISHED" : "SESSION COMPLETE"}</p>
		<h1>${title}</h1><p>${message}</p>
		<div class="result-score">${game.score.toLocaleString()}<span>POINTS EARNED</span></div>
		<div class="result-summary"><div><strong>${accuracy}%</strong>Accuracy</div><div><strong>${game.correct}/${game.attempts}</strong>Correct</div><div><strong>${progress.bestScore.toLocaleString()}</strong>Personal best</div></div>
		<div class="result-actions"><button class="button button-primary" type="button" data-action="result-restart">Play again <span aria-hidden="true">↻</span></button><button class="button button-secondary" type="button" data-action="result-dashboard">Back to dashboard</button></div>
	</section>`;
}

function showDashboard() {
	clearGameTimers();
	game = null;
	gameView.hidden = true;
	dashboard.hidden = false;
	renderDashboard();
	window.scrollTo({ top: 0, behavior: "smooth" });
}

function randomInt(minimum, maximum) {
	return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
}

function shuffle(items) {
	const shuffled = [...items];
	for (let index = shuffled.length - 1; index > 0; index -= 1) {
		const otherIndex = randomInt(0, index);
		[shuffled[index], shuffled[otherIndex]] = [shuffled[otherIndex], shuffled[index]];
	}
	return shuffled;
}

document.addEventListener("click", (event) => {
	const launchButton = event.target.closest("[data-game]");
	if (launchButton) {
		startGame(launchButton.dataset.game);
		return;
	}
	if (event.target.closest("#dailyButton")) {
		startGame(getDailyGame(), true);
		return;
	}
	if (gameContent.contains(event.target)) handleAnswer(event);
});

renderDashboard();
