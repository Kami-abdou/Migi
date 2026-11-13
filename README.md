# Migi

A small one-eyed creature that lives on your taskbar (or on top of the Mac
Dock). It wanders, watches your cursor, and when you click it, a chat opens
that answers questions from the lab's own documents and shows where each
answer comes from.

Migi can also hand you to one of the three leads (AI, build, brand). When you
switch, it melts and shape-shifts into them.

Built with Electron and Claude (Opus 5.5).

## Run it

```bash
npm install
```

```bash
npm start
```

No API key yet? `npm start` still works: Migi answers by quoting the docs
directly, and the chat says it's in demo mode. To force demo mode:

```bash
npm run demo
```

## Connect it to Claude

Create a file called `.env` in this folder (copy `.env.example`):

```
ANTHROPIC_API_KEY=sk-ant-...
```

Restart Migi. The key stays on your machine. Never commit `.env`; it's in
`.gitignore`. If you later give Migi to people outside the team, don't ship
your key inside the app: put a small server in between.

## Using it

- **Click Migi** to open or close the chat. **Hover** and it waves.
- **Right-click Migi** (or the tray icon) for the menu: talk to someone else,
  make Migi stay still, open the knowledge folder, quit.
- In the chat, click the name at the top to **switch who you're talking to**.
  Each of them keeps their own conversation.
- **Numbers after a sentence** are sources: click one to highlight the quote.
- **Drop a file** (.md, .txt, .csv, .json, .pdf) on the chat, or use the paper
  clip, to ask about it.
- The chat closes when you click elsewhere. **Pin** it (the pin button) to keep
  it open, for example while you drag a file in from another window.
- `Esc` closes the chat. `+` starts a new conversation.

## Finding and opening things on your computer

Ask in plain words: "open my Downloads folder", "find the bottle wall
budget", "ouvre la calculatrice", "what did I download last?", "open the WLED
docs". Migi can:

- **search your computer** for files, folders and installed apps by name
  (including Windows Store apps like Calculator),
- **list a folder**, newest first if you want,
- **search the web** (only when connected to Claude; each search is billed on
  top of the normal tokens),
- **open** a file, folder, app or web page.

Everything Migi finds shows up in the chat with its own **Open** and **show in
folder** buttons. When Migi itself wants to open something, a card asks you
first; nothing opens until you press **Open**. Programs (.exe, .bat, scripts…)
get a red warning, because opening them runs them. This guard also means a
web page or a file can't trick Migi into opening something on its own.

What it sees: Migi keeps an index of file and folder **names** (your home
folder, other drives, installed apps), built in the background a few seconds
after it starts and refreshed every 15 minutes. It never reads inside your
files to search. System folders, hidden folders, app data and `node_modules`
are skipped. When connected to Claude, the names and paths of what it finds
are sent to Claude to pick the right one. In demo mode (no key) everything
stays on your machine, and "open …" / "find …" still work.

## What Migi knows

Everything in `knowledge/` (`.md` and `.txt` files). Add or edit files there;
Migi rereads them at the start of each new conversation.

Three of the files come from the bottle-wall site. After you change that
site's `content.js`, refresh them with:

```bash
npm run knowledge
```

Anything marked `(verify)` in the docs is treated as unconfirmed, and Migi
says so instead of stating it as fact.

## Who you can talk to

`experts.json` lists Migi and the three leads: their names, what each one
owns, how they speak, suggested questions, and their pixel colours. Put the
founders' real names in `name` when you want them. The first entry is the
default.

## How the answers work

- Model: `claude-opus-5-5`, effort `medium`.
- Tools: `search_computer`, `list_folder`, `open_item`, `open_url` (run by
  Migi, opening always confirmed by you) and Claude's built-in web search
  (up to 3 searches per question).
- The knowledge files are attached to the first message of each conversation
  as documents with **citations** on, which is where the numbered sources come
  from.
- **Prompt caching** keeps the docs cached between questions, so follow-ups
  cost a fraction of the first question. The terminal running Migi prints
  token counts per answer (`[migi] tokens ...`), including cache reads.
- Answers **stream** in word by word.
- If a safety filter declines a question, the request is retried on the
  recommended fallback model (`fallbacks: "default"`).
- Migi ends a reply with `→ ask: <id>` when a question belongs to a lead; the
  chat turns that into an "Ask …" button.

## Files

| File | What it does |
|---|---|
| `src/main.js` | Windows, tray, menu, cursor watching, message passing |
| `src/brain.js` | Talks to Claude: docs, citations, caching, streaming, tools, demo mode |
| `src/finder.js` | The index of file, folder and app names, search and folder listing |
| `src/preload.js` | The bridge between the windows and the main process |
| `src/pet/` | The creature on the taskbar |
| `src/chat/` | The chat panel |
| `src/shared/sprites.js` | All pixel art, drawn from code |
| `src/shared/dev-shim.js` | Lets you open the UI in a normal browser (see below) |
| `knowledge/` | What Migi knows |
| `experts.json` | Who you can talk to |
| `scripts/build-knowledge.js` | Imports the bottle-wall plan into `knowledge/` |

## Working on it

- Open the UI in a normal browser, without Electron:
  `python -m http.server 5174` in this folder, then
  `http://localhost:5174/src/chat/chat.html` or `/src/pet/pet.html`. A shim
  fakes the main process; in the console, `migi._emit("pet:state", "thinking")`
  drives the pet.
- `npx electron . --open-chat` opens the chat at start.
- `npx electron . --ask="How much does the wall cost?"` opens the chat and asks
  (handy for screenshots).
- `MIGI_DEBUG=1` prints every chat event in the terminal.

Not done yet: an installer (electron-builder), launch at login, and a server
so people outside the team can use it without a key.
