// ================================
// State
// ================================

let words = [];
let progress = {};
let currentIndex = 0;
let isSaving = false;

// ================================
// DOM
// ================================

const currentWord = document.getElementById("currentWord");
const currentSentence = document.getElementById("currentSentence");
const typingInput = document.getElementById("typingInput");
const status = document.getElementById("status");

const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const wordNumber = document.getElementById("wordNumber");

const jumpNumber = document.getElementById("jumpNumber");
const jumpWord = document.getElementById("jumpWord");

const jumpNumberBtn = document.getElementById("jumpNumberBtn");
const jumpWordBtn = document.getElementById("jumpWordBtn");

const resetBtn = document.getElementById("resetBtn");

async function loadData() {

    const wordsResponse = await fetch("/api/words");
    const progressResponse = await fetch("/api/progress");

    const wordsData = await wordsResponse.json();
    progress = await progressResponse.json();

    words = Object.entries(wordsData);

    currentIndex = progress._meta?.currentIndex || 0;

    renderWord();

}

function renderWord() {

    const [word, sentence] = words[currentIndex];

    currentWord.textContent = word;

    currentSentence.textContent = sentence;

    wordNumber.textContent =
        `Word #${currentIndex + 1} / ${words.length}`;

    typingInput.value = "";

    typingInput.classList.remove("correct");
    typingInput.classList.remove("wrong");

    status.textContent = "";

    typingInput.focus();

    updateProgressBar();

}

function updateProgressBar() {

    const completed =
        Object.keys(progress)
            .filter(key => key !== "_meta")
            .length;

    progressText.textContent =
        `${completed} / ${words.length} Practiced`;

    const percent =
        (completed / words.length) * 100;

    progressFill.style.width = `${percent}%`;

}

function checkTyping() {

    const typed = typingInput.value;
    const expected = words[currentIndex][1];

    // Remove previous states
    typingInput.classList.remove("correct");
    typingInput.classList.remove("wrong");
    status.textContent = "";

    // Empty input
    if (typed.length === 0) {
        return;
    }

    // Wrong character typed
    if (!expected.startsWith(typed)) {
        typingInput.classList.add("wrong");
        status.textContent = "❌ Typing mistake";
        return;
    }

    // Correct sentence completed
    if (typed.trim() === expected.trim()) {

        typingInput.classList.add("correct");
        status.textContent = "✅ Correct";

        saveProgress();
    }

}

async function saveProgress() {

    if (isSaving) return;

    isSaving = true;

    const word = words[currentIndex][0];

    await fetch("/api/progress", {

        method: "POST",

        headers: {
            "Content-Type": "application/json"
        },

        body: JSON.stringify({
            word,
            currentIndex: currentIndex + 1
        })

    });

    progress[word] = {
        completed: true
    };

    updateProgressBar();

    setTimeout(() => {

        goToNextWord();

        isSaving = false;

    }, 600);

}

function goToNextWord() {

    currentIndex++;

    if (currentIndex >= words.length) {

        currentIndex = 0;

    }

    renderWord();

}

function jumpByNumber() {

    const index = Number(jumpNumber.value) - 1;

    if (index < 0 || index >= words.length) {

        alert("Invalid word number");

        return;
    }

    currentIndex = index;

    renderWord();

}

function jumpByWord() {

    const search = jumpWord.value.trim().toLowerCase();

    const index = words.findIndex(([word]) =>
        word.toLowerCase() === search
    );

    if (index === -1) {

        alert("Word not found");

        return;
    }

    currentIndex = index;

    renderWord();

}

async function resetProgress() {

    if (!confirm("Reset all progress?")) {
        return;
    }

    await fetch("/api/reset", {
        method: "POST"
    });

    progress = {
        _meta: {
            currentIndex: 0
        }
    };

    currentIndex = 0;

    renderWord();

}


typingInput.addEventListener("input", checkTyping);

jumpNumberBtn.addEventListener("click", jumpByNumber);
jumpWordBtn.addEventListener("click", jumpByWord);
resetBtn.addEventListener("click", resetProgress);

loadData();