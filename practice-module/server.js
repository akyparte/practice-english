const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

const WORDS_FILE = path.join(__dirname, "../words.json");
const PROGRESS_FILE = path.join(__dirname, "progress.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function readJSON(file) {
    return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 4));
}

/*
|--------------------------------------------------------------------------
| APIs
|--------------------------------------------------------------------------
*/

// Get all words
app.get("/api/words", (req, res) => {
    res.json(readJSON(WORDS_FILE));
});

// Get progress
app.get("/api/progress", (req, res) => {
    res.json(readJSON(PROGRESS_FILE));
});

// Save completed word
app.post("/api/progress", (req, res) => {

    const { word, currentIndex } = req.body;

    const progress = readJSON(PROGRESS_FILE);

    if (!progress[word]) {
        progress[word] = {
            completed: true,
            count: 0,
            lastPracticed: null
        };
    }

    progress[word].completed = true;
    progress[word].count += 1;
    progress[word].lastPracticed = new Date().toISOString();

    progress._meta.currentIndex = currentIndex;

    writeJSON(PROGRESS_FILE, progress);

    res.json({
        success: true
    });

});

// Reset progress
app.post("/api/reset", (req, res) => {

    writeJSON(PROGRESS_FILE, {
        _meta: {
            currentIndex: 0
        }
    });

    res.json({
        success: true
    });

});

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});