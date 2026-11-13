/*
  Turns the bottle-wall site's content.js into markdown docs Migi can read.

    npm run knowledge            (reads ../content.js by default)
    node scripts/build-knowledge.js path/to/content.js

  The output goes to knowledge/. Any other .md or .txt file you drop in
  knowledge/ is read by Migi too; this script only rewrites its own three files.
*/
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const src = path.resolve(process.argv[2] || path.join(__dirname, "..", "..", "content.js"));
const outDir = path.join(__dirname, "..", "knowledge");

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(src, "utf8"), sandbox, { filename: src });
const C = sandbox.window.CONTENT;
if (!C) throw new Error("No window.CONTENT found in " + src);

const tx = (s) =>
  String(s)
    .replace(/\{\{verify:\s*([^}]*)\}\}/g, "(verify: $1)")
    .replace(/\{\{verify\}\}/g, "(verify)");

const table = (head, rows) =>
  [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.map(tx).join(" | ")} |`)].join("\n");

const blocks = {
  p: (b) => tx(b.text),
  note: (b) => tx(b.text),
  lead: (b) => `_${tx(b.text)}_`,
  quote: (b) => `> ${tx(b.text)}`,
  bigQuestion: (b) => `Big question: ${tx(b.text)}`,
  terms: (b) => b.items.map(([t, d]) => `- **${tx(t)}**: ${tx(d)}`).join("\n"),
  when: (b) => b.items.map(([t, d]) => `- **${tx(t)}**: ${tx(d)}`).join("\n"),
  ul: (b) => b.items.map((i) => `- ${tx(i)}`).join("\n"),
  moments: (b) => b.items.map((i) => `- ${tx(i)}`).join("\n"),
  questions: (b) => b.items.map((i) => `- ${tx(i)}`).join("\n"),
  ol: (b) => b.items.map((i, k) => `${k + 1}. ${tx(i)}`).join("\n"),
  beats: (b) => b.items.join(" → "),
  table: (b) => table(b.head, b.rows),
  timeline: (b) =>
    b.episodes.map((e) => `### Ep ${e.ep}: ${tx(e.title)}\n\nWhat happens: ${tx(e.what)}\n\nPayoff: ${tx(e.payoff)}`).join("\n\n"),
  flow: (b) => `${tx(b.label)}: ` + b.steps.map((s) => (s.link ? `→ (${s.link}) → ` : "") + `${s.name} (${s.detail})`).join(" "),
  costs: (b) => {
    let lo = 0, hi = 0;
    const rows = b.rows.map(([item, l, h]) => { lo += l; hi += h; return [item, String(l), String(h)]; });
    rows.push(["**Total**", `≈ ${lo.toLocaleString("en-US")}`, `≈ ${hi.toLocaleString("en-US")}`]);
    return table(["Item", `Low (${b.currency})`, `High (${b.currency})`], rows);
  },
  checklist: (b) => b.items.map((i) => `- [ ] ${tx(i.text)}`).join("\n"),
  roadmap: (b) =>
    table(["Phase", "When", "Focus", "Gate to move on"], b.phases.map((p) => [`${p.n} · ${p.name}`, p.when, p.focus, p.gate || "—"])),
  pilots: (b) => `Slots: ${b.slots.map((s, i) => `${i + 1}. ${s}`).join(", ")}. Each free pilot must earn: ${b.earns.join(", ")}.`,
  experiments: (b) => table(["#", "Experiment", "Category", "Level"], b.items)
};

function section(sec) {
  return `## ${tx(sec.title)}\n\n` + sec.blocks.map((b) => (blocks[b.type] ? blocks[b.type](b) : "")).filter(Boolean).join("\n\n");
}

const wall = C.parts.find((p) => p.id === "wall");
const bigger = C.parts.find((p) => p.id === "bigger");
const isIndex = (s) => s.id === "experiments";

const docs = {
  "bottle-wall.md":
    `# The bottle wall: "${C.title}"\n\n` +
    `The lab's first big season: a screen of 512 plastic bottles on a balcony that the neighbourhood plays Snake on.\n\n` +
    `Bottles collected so far: ${C.bottles.collected} / ${C.bottles.goal}.\n\n` +
    wall.sections.map(section).join("\n\n"),
  "cafe-lab.md": `# The bigger plan: the café-lab\n\n` + bigger.sections.filter((s) => !isIndex(s)).map(section).join("\n\n"),
  "experiments.md": `# Experiment index\n\n` + bigger.sections.filter(isIndex).map(section).join("\n\n")
};

fs.mkdirSync(outDir, { recursive: true });
for (const [name, body] of Object.entries(docs)) {
  fs.writeFileSync(path.join(outDir, name), body.trim() + "\n");
  console.log(`wrote knowledge/${name} (${body.length} chars)`);
}
