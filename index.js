// Builds README.md from README.template.md with a random quote from The Office.
// Uses Node's built-in fetch (Node 18+), so there are no dependencies to keep patched.

const { promises: fs } = require("fs");
const path = require("path");

const ROOT = __dirname;
const TEMPLATE_PATH = path.join(ROOT, "README.template.md");
const README_PATH = path.join(ROOT, "README.md");
const QUOTE_API = "https://officeapi.dev/api/quotes/random";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_QUOTE_LENGTH = 280;
const MAX_NAME_LENGTH = 60;

// Used when the API is down or returns something unexpected,
// so the README is never left with empty or broken placeholders.
const FALLBACK_QUOTES = [
  { content: "Would I rather be feared or loved? Easy. Both.", character: "Michael Scott" },
  { content: "Identity theft is not a joke, Jim!", character: "Dwight Schrute" },
  { content: "I talk a lot, so I've learned to tune myself out.", character: "Kelly Kapoor" },
];

// Text from a third-party API ends up in a public README, so treat it as untrusted:
// flatten whitespace, drop control characters, escape HTML/Markdown, and cap the length.
function sanitize(value, maxLength) {
  let text = String(value)
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length > maxLength) {
    text = text.slice(0, maxLength - 1).trimEnd() + "…";
  }

  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/([\\`*_[\]()!#|~])/g, "\\$1");
}

async function fetchQuote() {
  const response = await fetch(QUOTE_API, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Quote API responded with HTTP ${response.status}`);
  }

  const body = await response.json();
  const content = body?.data?.content;
  const first = body?.data?.character?.firstname;
  const last = body?.data?.character?.lastname;

  if (typeof content !== "string" || !content.trim() || typeof first !== "string") {
    throw new Error("Quote API returned an unexpected response shape");
  }

  return { content, character: [first, last].filter((p) => typeof p === "string").join(" ") };
}

async function getQuote() {
  try {
    return await fetchQuote();
  } catch (error) {
    // Surface the problem in the Actions UI instead of failing silently.
    console.log(`::warning::Falling back to a built-in quote: ${error.message}`);
    return FALLBACK_QUOTES[Math.floor(Math.random() * FALLBACK_QUOTES.length)];
  }
}

async function main() {
  const template = await fs.readFile(TEMPLATE_PATH, "utf8");

  for (const placeholder of ["{office_quote}", "{office_character}"]) {
    if (!template.includes(placeholder)) {
      throw new Error(`Template is missing the ${placeholder} placeholder`);
    }
  }

  const quote = await getQuote();
  const content = sanitize(quote.content, MAX_QUOTE_LENGTH);
  const character = sanitize(quote.character, MAX_NAME_LENGTH);

  // Function replacements so "$&" or "$1" inside a quote are not treated as patterns.
  const readme = template
    .replaceAll("{office_quote}", () => content)
    .replaceAll("{office_character}", () => `- ${character}`);

  await fs.writeFile(README_PATH, readme);
  console.log(`README updated with: "${content}" ${character}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
