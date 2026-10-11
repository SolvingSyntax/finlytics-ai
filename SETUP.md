# Running FinLytics AI in VS Code

## Step 1 — Install the tools

1. **Node.js 22 or newer** — from https://nodejs.org (LTS installer is fine).
   Check it: `node -v` should print `v22.x` or higher.
2. **Python 3.10 or newer** — only needed for the optional offline FinBERT demo.
3. **VS Code** — from https://code.visualstudio.com.

## Step 2 — Open the project

Unzip the project, then in VS Code choose **File → Open Folder** and pick the folder that
contains `package.json`. Open a terminal inside VS Code with **Ctrl+`** (backtick).

## Step 3 — Install the JavaScript packages

```sh
npm install
```

This takes a couple of minutes and creates `node_modules`.
(`bun install` works too — `bun.lock` is included.)

## Step 4 — Start the app

```sh
npm run dev
```

The terminal prints a local address such as `http://localhost:8080`.
Hold **Ctrl** and click it (or paste it into your browser). The dashboard opens with live
NSE share prices, live index levels and this company's latest news headlines.

The `.env` file in the project root is already filled in with the backend address and its
public key, so nothing else needs configuring.

## Step 5 — FinBERT sentiment labels (no setup)

FinBERT runs **in your browser** inside a Web Worker (`src/lib/finbert.worker.ts`) using
the ONNX build of the model. There is no token, no API key and no Python required.

The first time you open the dashboard it downloads the model weights from the Hugging Face
CDN — the header shows "Downloading FinBERT · 42%" as it goes, and the browser caches the
files so later loads are instant. Once ready, every headline shows its Positive / Neutral /
Negative label with a confidence percentage.

## Step 6 (optional) — Run FinBERT offline in Python

```sh
pip install transformers torch
python nlp/finbert_analyzer.py
```

The first run downloads the model (a few hundred MB). A CPU is enough; expect roughly a
minute for the download and a few seconds per headline. It prints each headline's label,
confidence and an overall market mood.

## Step 7 — Other commands

```sh
npm run build     # production build
npm run preview   # serve the production build
npm run lint      # ESLint checks
npm run test      # Vitest
```

## Running the Ask FinLytics chat locally

The **Ask FinLytics** chat calls the `/api/chat` server route. To run the chat on your
own machine, add a free key to a

file named `.env` in the project folder (create it next to `package.json`):

```sh
# Option A — Groq (free key at https://console.groq.com/keys)
GROQ_API_KEY=gsk_...

# Option B — Google Gemini (free key at https://aistudio.google.com/apikey)
GEMINI_API_KEY=AIza...
```

Only one is needed; Groq is checked first if both are present. Restart `npm run dev` after
saving the file. Without a key the chat shows "unavailable" — every other part of the
dashboard (prices, headlines, FinBERT labels, all the NLP panels) works without it.

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm: command not found` | Node.js isn't installed, or VS Code needs restarting after installing it. |
| Port 8080 already in use | Close the other app, or run `npm run dev -- --port 3000`. |
| Prices or headlines look blank | No internet, or the free endpoint is rate-limiting. Refresh; it usually recovers. The dashboard deliberately leaves values blank rather than inventing them. |
| FinBERT stuck on "Downloading FinBERT" | The weights come from the Hugging Face CDN — check your connection, then press the Retry button in the sentiment panel. |
| `ModuleNotFoundError: transformers` | Run `pip install transformers torch` (Step 6). |
| Permission errors during `npm install` | On macOS/Linux avoid `sudo npm`; reinstall Node.js with nvm instead. |
