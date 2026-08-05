const fs = require("fs");
const pluralize = require("pluralize")

const WORDS_FILE = "../words.json";
const CONTEXT_FILE = "context.txt";
const STOP_WORDS_FILE = "stop-words.json";

// Check required files
if (!fs.existsSync(CONTEXT_FILE)) {
  console.error(`${CONTEXT_FILE} not found.`);
  process.exit(1);
}

if (!fs.existsSync(STOP_WORDS_FILE)) {
  console.error(`${STOP_WORDS_FILE} not found.`);
  process.exit(1);
}

// Read context
const paragraph = fs.readFileSync(CONTEXT_FILE, "utf8");

// Read stop words
const STOP_WORDS = new Set(
  JSON.parse(fs.readFileSync(STOP_WORDS_FILE, "utf8"))
);

// Read existing words.json (or create empty object)
let wordsJson = {};

if (fs.existsSync(WORDS_FILE)) {
  try {
    wordsJson = JSON.parse(fs.readFileSync(WORDS_FILE, "utf8"));
  } catch (err) {
    console.error(`Invalid JSON in ${WORDS_FILE}`);
    process.exit(1);
  }
}

// Extract words
const words = paragraph
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean)

  // Keep only plain English words (letters only)
  .filter(word => /^[a-z]+$/.test(word))

  // Convert plurals to singular
  .map(word => pluralize.singular(word))

  // Ignore very short words
  .filter(word => word.length > 3)

  // Remove stop words
  .filter(word => !STOP_WORDS.has(word));

// Remove duplicates
const uniqueWords = [...new Set(words)];

let added = 0;

// Add new words
for (const word of uniqueWords) {
  if (!(word in wordsJson)) {
    wordsJson[word] = "";
    added++;
  }
}

// Save updated JSON
fs.writeFileSync(WORDS_FILE, JSON.stringify(wordsJson, null, 2));

console.log(`Added ${added} new words.`);
console.log(`Total words: ${Object.keys(wordsJson).length}`);