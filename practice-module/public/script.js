let wordsData = {};
let progressData = {};
let words = [];
let currentIndex = 0;

const currentWord = document.getElementById("currentWord");
const currentSentence = document.getElementById("currentSentence");
const typingInput = document.getElementById("typingInput");
const status = document.getElementById("status");

const progressText = document.getElementById("progressText");
const progressFill = document.getElementById("progressFill");
const wordNumber = document.getElementById("wordNumber");

const jumpNumber = document.getElementById("jumpNumber");
const jumpWord = document.getElementById("jumpWord");

const resetBtn = document.getElementById("resetBtn");


/* =========================================================
   INITIAL LOAD
========================================================= */

async function initialize() {
    try {
        const [wordsResponse, progressResponse] = await Promise.all([
            fetch("/api/words", {
                credentials: "include"
            }),

            fetch("/api/progress", {
                credentials: "include"
            })
        ]);

        // User is not authenticated
        if (wordsResponse.status === 401 || progressResponse.status === 401) {
            window.location.href = "/login.html";
            return;
        }

        if (!wordsResponse.ok || !progressResponse.ok) {
            throw new Error("Failed to load practice data.");
        }

        wordsData = await wordsResponse.json();
        progressData = await progressResponse.json();

        words = Object.entries(wordsData);

        currentIndex =
            progressData._meta?.currentIndex || 0;

        // Prevent invalid index
        if (currentIndex >= words.length) {
            currentIndex = words.length - 1;
        }

        if (currentIndex < 0) {
            currentIndex = 0;
        }

        renderWord();

    } catch (error) {
        console.error(error);

        status.textContent =
            "Unable to load practice data. Please refresh the page.";
    }
}


/* =========================================================
   RENDER CURRENT WORD
========================================================= */

function renderWord() {

    if (!words.length) {
        currentWord.textContent = "No words available";
        currentSentence.textContent = "";
        return;
    }

    const [word, sentence] = words[currentIndex];

    currentWord.textContent = word;
    currentSentence.textContent = sentence;

    wordNumber.textContent =
        `Word ${currentIndex + 1} of ${words.length}`;

    typingInput.value = "";
    typingInput.focus();

    status.textContent = "";

    updateProgressBar();
}


/* =========================================================
   PROGRESS BAR
========================================================= */

function updateProgressBar() {

    const completedWords = Object.keys(progressData)
        .filter(key => key !== "_meta")
        .length;

    const totalWords = words.length;

    progressText.textContent =
        `${completedWords} / ${totalWords} words completed`;

    const percentage =
        totalWords === 0
            ? 0
            : (completedWords / totalWords) * 100;

    progressFill.style.width = `${percentage}%`;
}


/* =========================================================
   TYPING
========================================================= */

typingInput.addEventListener("input", () => {

    const typedText = typingInput.value;

    const [, sentence] = words[currentIndex];

    if (typedText === sentence) {
        status.textContent = "✓ Correct!";

        saveProgress();
    }
});


/* =========================================================
   SAVE PROGRESS
========================================================= */

async function saveProgress() {

    const [word] = words[currentIndex];

    // Prevent saving the same word multiple times
    // while user remains on the same word.
    if (
        progressData[word] &&
        progressData[word].lastSavedIndex === currentIndex
    ) {
        return;
    }

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

        if (response.status === 401) {
            window.location.href = "/login.html";
            return;
        }

        if (!response.ok) {
            throw new Error("Failed to save progress.");
        }

        /*
         * Update local progress immediately.
         * This avoids another API request after every word.
         */

        if (!progressData[word]) {
            progressData[word] = {
                completed: true,
                count: 0,
                lastPracticed: null
            };
        }

        progressData[word].completed = true;
        progressData[word].count += 1;
        progressData[word].lastPracticed =
            new Date().toISOString();

        progressData._meta = {
            currentIndex: currentIndex + 1
        };

        progressData[word].lastSavedIndex = currentIndex;

        updateProgressBar();

        /*
         * Move to next word
         */

        if (currentIndex < words.length - 1) {

            currentIndex++;

            renderWord();

        } else {

            status.textContent =
                "🎉 You completed all words!";
        }

    } catch (error) {

        console.error(error);

        status.textContent =
            "Failed to save progress. Please try again.";
    }
}


/* =========================================================
   JUMP BY NUMBER
========================================================= */

jumpNumber.addEventListener("change", () => {

    const number = Number(jumpNumber.value);

    if (
        Number.isNaN(number) ||
        number < 1 ||
        number > words.length
    ) {
        return;
    }

    currentIndex = number - 1;

    renderWord();

    jumpNumber.value = "";
});


/* =========================================================
   JUMP BY WORD
========================================================= */

jumpWord.addEventListener("change", () => {

    const searchWord =
        jumpWord.value.trim().toLowerCase();

    if (!searchWord) {
        return;
    }

    const index = words.findIndex(([word]) =>
        word.toLowerCase() === searchWord
    );

    if (index === -1) {

        status.textContent =
            "Word not found.";

        return;
    }

    currentIndex = index;

    renderWord();

    jumpWord.value = "";
});


/* =========================================================
   RESET PROGRESS
========================================================= */

resetBtn.addEventListener("click", async () => {

    const confirmed = confirm(
        "Are you sure you want to reset your progress?"
    );

    if (!confirmed) {
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

        /*
         * Reset only the current user's local progress.
         */

        progressData = {
            _meta: {
                currentIndex: 0
            }
        };

        currentIndex = 0;

        renderWord();

        status.textContent =
            "Progress reset successfully.";

    } catch (error) {

        console.error(error);

        status.textContent =
            "Failed to reset progress.";
    }
});


/* =========================================================
   START APPLICATION
========================================================= */

initialize();
