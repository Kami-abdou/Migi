/*
  Migi's brain. Runs in Electron's main process.

  - Every conversation starts with the lab's docs (knowledge/*.md|txt) attached
    as documents with citations on, so answers quote their sources.
  - The docs are cached (prompt caching), so follow-ups and other people's
    questions within a few minutes reuse them cheaply.
  - Each expert has its own system prompt and its own conversation.
  - Answers stream back token by token.
  - With no API key, or with --demo, Migi answers from the docs without Claude.
*/
const fs = require("fs");
const os = require("os");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk").default;

const MODEL = "claude-opus-5-5";
const ROOT = path.join(__dirname, "..");
const KNOWLEDGE_DIR = path.join(ROOT, "knowledge");
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

// ───────────── setup ─────────────

// Minimal .env reader (KEY=value lines), so the key can live next to the app.
function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

function hasCredentials() {
  // The SDK also reads a profile saved by `ant auth login`.
  return Boolean(
    process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      fs.existsSync(path.join(os.homedir(), ".config", "anthropic"))
  );
}

function loadExperts() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "experts.json"), "utf8")).experts;
}

function loadKnowledge() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) return [];
  return fs
    .readdirSync(KNOWLEDGE_DIR)
    .filter((f) => /\.(md|txt)$/i.test(f))
    .sort()
    .map((file) => {
      const text = fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf8");
      const heading = text.match(/^#\s+(.+)$/m);
      return { file, title: heading ? heading[1].trim() : file.replace(/\.\w+$/, ""), text };
    });
}

function systemFor(expert, experts) {
  const others = experts.filter((e) => e.id !== expert.id && e.id !== "migi");
  const lines = [
    expert.voice,
    "You live inside Migi, a small desktop app made by a three-person lab in Tunisia. The lab runs playful technology experiments in the real city, films how people react, and is growing that audience toward a physical café-lab.",
    `You speak for: ${expert.owns}. The lab's own documents are attached to this conversation. Ground every factual claim in them. If they don't cover the question, say so in one short sentence, then give your own suggestion and call it a suggestion.`,
    'Anything the documents mark "(verify)" is unconfirmed: never state it as fact, say it still needs checking.',
    "Reply in the language the person writes in: Tunisian Derja (Arabic script or Arabizi), French or English.",
    "You are a small chat panel on someone's desktop. Keep answers under about 120 words unless asked for more. Use short paragraphs or a short list; no tables and no headings."
  ];
  if (expert.id === "migi" && others.length) {
    lines.push(
      "These leads take the questions that belong to them: " +
        others.map((e) => `${e.id} (${e.title}: ${e.owns})`).join("; ") +
        ". When a question clearly belongs to one lead, answer briefly yourself, then end with one last line, exactly: → ask: <id>"
    );
  } else {
    lines.push("If a question belongs to someone else on the team, say who.");
  }
  return lines.join("\n\n");
}

// ───────────── content blocks ─────────────

function knowledgeBlocks(knowledge) {
  return knowledge.map((k, i) => ({
    type: "document",
    source: { type: "text", media_type: "text/plain", data: k.text },
    title: k.title,
    citations: { enabled: true },
    // The docs are the shared, expensive part: cache up to the last one.
    ...(i === knowledge.length - 1 ? { cache_control: { type: "ephemeral" } } : {})
  }));
}

function attachmentBlock(a) {
  if (a.kind === "pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: a.data },
      title: a.name,
      citations: { enabled: true }
    };
  }
  return {
    type: "document",
    source: { type: "text", media_type: "text/plain", data: a.data },
    title: a.name,
    citations: { enabled: true }
  };
}

// Turn the final content blocks into { parts: [{text, refs}], sources, handoff }.
function toAnswer(content) {
  const parts = [];
  const sources = [];
  const seen = new Map();
  for (const block of content) {
    if (block.type !== "text") continue;
    const refs = [];
    for (const c of block.citations || []) {
      const key = `${c.document_index}|${c.cited_text}`;
      if (!seen.has(key)) {
        seen.set(key, sources.length + 1);
        sources.push({ n: sources.length + 1, title: c.document_title || "Lab docs", quote: (c.cited_text || "").trim() });
      }
      refs.push(seen.get(key));
    }
    parts.push({ text: block.text, refs: [...new Set(refs)] });
  }
  // Migi may hand the question to a lead with a final "→ ask: <id>" line.
  let handoff = null;
  for (let i = parts.length - 1; i >= 0; i--) {
    const m = parts[i].text.match(/\n?[ \t]*→\s*ask:\s*([a-z0-9-]+)\s*$/i);
    if (m) {
      handoff = m[1].toLowerCase();
      parts[i].text = parts[i].text.slice(0, m.index);
      break;
    }
    if (parts[i].text.trim()) break;
  }
  return { parts, sources, handoff };
}

// ───────────── demo mode: answers from the docs, no Claude ─────────────

function demoAnswer(question, knowledge, expert, experts) {
  const words = question.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  const paras = [];
  knowledge.forEach((k, docIndex) => {
    for (const line of k.text.split(/\n/)) {
      if (/^\s*(\||#|>)/.test(line)) continue; // skip tables, headings, quotes
      const t = line.replace(/^\s*(-|\d+\.)\s+(\[ \]\s*)?/, "").trim();
      if (t.length < 25) continue;
      const lower = t.toLowerCase();
      const score = words.reduce((s, w) => s + (lower.includes(w) ? 1 : 0), 0);
      if (score) paras.push({ t, score, docIndex, title: k.title });
    }
  });
  paras.sort((a, b) => b.score - a.score);
  const top = paras.slice(0, 2);
  if (!top.length) {
    return {
      parts: [{ text: "I'm in demo mode, so I can only look things up in the lab docs, and I didn't find that one. Add a Claude API key and I'll answer properly.", refs: [] }],
      sources: [],
      handoff: null
    };
  }
  const clip = (s) => (s.length > 220 ? s.slice(0, 217).trimEnd() + "…" : s);
  const parts = [{ text: "Demo mode, so here's what the lab docs say:\n\n", refs: [] }];
  const sources = [];
  top.forEach((p, i) => {
    const quote = clip(p.t.replace(/\*\*/g, ""));
    sources.push({ n: i + 1, title: p.title, quote });
    parts.push({ text: quote + (i < top.length - 1 ? "\n\n" : ""), refs: [i + 1] });
  });
  let handoff = null;
  if (expert.id === "migi") {
    const q = question.toLowerCase();
    const lead = experts.find((e) => e.id !== "migi" && e.owns.toLowerCase().split(/[ ,]+/).some((w) => w.length > 4 && q.includes(w)));
    if (lead) handoff = lead.id;
  }
  return { parts, sources, handoff };
}

// ───────────── the brain ─────────────

function createBrain(opts) {
  loadEnv();
  const experts = loadExperts();
  let knowledge = loadKnowledge();
  const histories = new Map(); // expertId → BetaMessageParam[]
  let mode = opts && opts.demo ? "demo" : hasCredentials() ? "live" : "needs-key";
  let client = null;
  let current = null; // the in-flight stream, so it can be cancelled

  const expertById = (id) => experts.find((e) => e.id === id) || experts[0];

  async function ask({ expertId, text, attachments }, emit) {
    const expert = expertById(expertId);
    const history = histories.get(expert.id) || [];
    if (!history.length) knowledge = loadKnowledge(); // pick up edited docs on each new chat

    const content = [];
    if (!history.length) content.push(...knowledgeBlocks(knowledge));
    for (const a of attachments || []) {
      if (a.size > MAX_ATTACHMENT_BYTES) {
        emit({ type: "error", kind: "attachment", message: `${a.name} is over 5 MB.` });
        return;
      }
      content.push(attachmentBlock(a));
    }
    content.push({ type: "text", text });
    const messages = [...history, { role: "user", content }];

    emit({ type: "start", expertId: expert.id });

    if (mode !== "live") {
      const answer = demoAnswer(text, knowledge, expert, experts);
      const full = answer.parts.map((p) => p.text).join("");
      for (const chunk of full.match(/\S+\s*/g) || []) {
        emit({ type: "delta", text: chunk });
        await new Promise((r) => setTimeout(r, 28));
      }
      emit({ type: "done", answer, demo: true, needsKey: mode === "needs-key" });
      return;
    }

    try {
      client = client || new Anthropic();
      current = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 64000,
        output_config: { effort: "low" }, // short chat answers; the docs do the heavy lifting
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default", // if a safety classifier declines, retry on the recommended model
        cache_control: { type: "ephemeral" }, // also cache the growing conversation
        system: systemFor(expert, experts),
        messages
      });
      current.on("text", (delta) => emit({ type: "delta", text: delta }));
      const message = await current.finalMessage();
      current = null;

      if (message.stop_reason === "refusal") {
        emit({ type: "error", kind: "refusal", message: "Migi can't help with that one." });
        return;
      }
      histories.set(expert.id, [...messages, { role: "assistant", content: message.content }]);
      const u = message.usage || {};
      emit({
        type: "done",
        answer: toAnswer(message.content),
        truncated: message.stop_reason === "max_tokens",
        usage: { input: u.input_tokens, cacheRead: u.cache_read_input_tokens, cacheWrite: u.cache_creation_input_tokens, output: u.output_tokens }
      });
    } catch (err) {
      current = null;
      if (err instanceof Anthropic.APIUserAbortError) {
        emit({ type: "cancelled" });
      } else if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
        emit({ type: "error", kind: "setup", message: "That API key didn't work. Check ANTHROPIC_API_KEY in migi/.env." });
      } else if (err instanceof Anthropic.RateLimitError) {
        emit({ type: "error", kind: "busy", message: "Too many questions at once. Try again in a minute." });
      } else if (err instanceof Anthropic.APIConnectionError) {
        emit({ type: "error", kind: "offline", message: "Migi can't reach Claude. Check the internet connection." });
      } else if (err instanceof Anthropic.APIError) {
        emit({ type: "error", kind: "api", message: `Claude returned an error (${err.status}).` });
      } else {
        // e.g. no credentials could be resolved
        emit({ type: "error", kind: "setup", message: "Migi needs a Claude API key. Put ANTHROPIC_API_KEY=… in migi/.env and restart." });
      }
      console.error("[migi]", err);
    }
  }

  return {
    experts,
    get mode() { return mode; },
    get knowledge() { return knowledge.map((k) => ({ file: k.file, title: k.title })); },
    useDemo() { if (mode === "needs-key") mode = "demo"; return mode; },
    ask,
    cancel() { if (current) current.abort(); },
    reset(expertId) { histories.delete(expertId); }
  };
}

module.exports = { createBrain, KNOWLEDGE_DIR, _test: { toAnswer, demoAnswer, systemFor, loadKnowledge, loadExperts } };
