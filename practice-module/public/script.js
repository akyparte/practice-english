
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


// ================================
// Load Words + User Progress
// ================================

async function loadData() {

    try {

        const [wordsResponse, progressResponse] = await Promise.all([
            fetch("/api/words", {
                credentials: "include"
            }),

            fetch("/api/progress", {
                credentials: "include"
            })
        ]);


        // Authentication expired / missing
        if (
            wordsResponse.status === 401 ||
            progressResponse.status === 401
        ) {
            window.location.href = "/login.html";
            return;
        }


        if (!wordsResponse.ok) {
            throw new Error("Failed to load words.");
        }

        if (!progressResponse.ok) {
            throw new Error("Failed to load progress.");
        }


        const wordsData = await wordsResponse.json();

        progress = await progressResponse.json();

        words = Object.entries(wordsData);


        // Resume from user's saved position
        currentIndex =
            progress._meta?.currentIndex || 0;


        // Protect against invalid index
        if (currentIndex < 0) {
            currentIndex = 0;
        }

        if (currentIndex >= words.length) {
            currentIndex = words.length - 1;
        }


        renderWord();

    } catch (error) {

        console.error("Load error:", error);

        status.textContent =
            "Unable to load practice data. Please refresh the page.";
    }
}


// ================================
// Render Current Word
// ================================

function renderWord() {

    if (!words.length) {
        return;
    }


    const [word, sentence] = words[currentIndex];


    currentWord.textContent = word;

    currentSentence.textContent = sentence;


    wordNumber.textContent =
        `Word #${currentIndex + 1} / ${words.length}`;


    // Reset typing box
    typingInput.value = "";

    typingInput.classList.remove("correct");
    typingInput.classList.remove("wrong");


    status.textContent = "";


    typingInput.focus();


    updateProgressBar();
}


// ================================
// Progress Bar
// ================================

function updateProgressBar() {

    const completed =
        Object.keys(progress)
            .filter(key => key !== "_meta")
            .length;


    progressText.textContent =
        `${completed} / ${words.length} Practiced`;


    const percent =
        words.length === 0
            ? 0
            : (completed / words.length) * 100;


    progressFill.style.width =
        `${percent}%`;
}


// ================================
// Typing Validation
// ================================

function checkTyping() {

    const typed = typingInput.value;

    const expected =
        words[currentIndex][1];


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

        status.textContent =
            "❌ Typing mistake";

        return;
    }


    // Correct sentence completed
    if (typed.trim() === expected.trim()) {

        typingInput.classList.add("correct");

        status.textContent =
            "✅ Correct";


        saveProgress();
    }
}


// ================================
// Save Progress
// ================================

async function saveProgress() {

    // Prevent duplicate requests
    if (isSaving) {
        return;
    }


    isSaving = true;


    const word =
        words[currentIndex][0];


    try {

        const response = await fetch("/api/progress", {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            credentials: "include",

            body: JSON.stringify({
                word,
                currentIndex: currentIndex + 1
            })

        });


        // Session expired
        if (response.status === 401) {

            window.location.href = "/login.html";

            return;
        }


        if (!response.ok) {
            throw new Error("Failed to save progress.");
        }


        // Update local progress
        if (!progress[word]) {

            progress[word] = {
                completed: true,
                count: 0,
                lastPracticed: null
            };
        }


        progress[word].completed = true;

        progress[word].count =
            (progress[word].count || 0) + 1;

        progress[word].lastPracticed =
            new Date().toISOString();


        progress._meta = {
            currentIndex: currentIndex + 1
        };


        updateProgressBar();


        // Small delay so user can see green border
        setTimeout(() => {

            goToNextWord();

            isSaving = false;

        }, 600);


    } catch (error) {

        console.error("Save progress error:", error);

        status.textContent =
            "Failed to save progress. Please try again.";

        isSaving = false;
    }
}


// ================================
// Next Word
// ================================

function goToNextWord() {

    currentIndex++;


    if (currentIndex >= words.length) {

        // Start again from Word #1
        currentIndex = 0;
    }


    renderWord();
}


// ================================
// Jump By Number
// ================================

function jumpByNumber() {

    const index =
        Number(jumpNumber.value) - 1;


    if (
        index < 0 ||
        index >= words.length
    ) {

        alert("Invalid word number");

        return;
    }


    currentIndex = index;

    renderWord();

    jumpNumber.value = "";
}


// ================================
// Jump By Word
// ================================

function jumpByWord() {

    const search =
        jumpWord.value
            .trim()
            .toLowerCase();


    const index =
        words.findIndex(([word]) =>
            word.toLowerCase() === search
        );


    if (index === -1) {

        alert("Word not found");

        return;
    }


    currentIndex = index;

    renderWord();

    jumpWord.value = "";
}


// ================================
// Reset Progress
// ================================

async function resetProgress() {

    if (!confirm("Reset all progress?")) {
        return;
    }


    try {

        const response = await fetch("/api/reset", {

            method: "POST",

            credentials: "include"
        });


        if (response.status === 401) {

            window.location.href = "/login.html";

            return;
        }


        if (!response.ok) {
            throw new Error("Failed to reset progress.");
        }


        // Reset local state
        progress = {
            _meta: {
                currentIndex: 0
            }
        };


        currentIndex = 0;


        renderWord();

    } catch (error) {

        console.error("Reset error:", error);

        status.textContent =
            "Failed to reset progress.";
    }
}


// ================================
// Event Listeners
// ================================

typingInput.addEventListener(
    "input",
    checkTyping
);


jumpNumberBtn.addEventListener(
    "click",
    jumpByNumber
);


jumpWordBtn.addEventListener(
    "click",
    jumpByWord
);


resetBtn.addEventListener(
    "click",
    resetProgress
);


// ================================
// Start
// ================================

loadData();
