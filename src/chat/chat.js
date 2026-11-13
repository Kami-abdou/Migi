/*
  The chat panel. Talks to the main process through window.migi (preload.js).
  Each expert keeps their own conversation; switching only changes who's shown.
*/
(function () {
  "use strict";

  const migi = window.migi;
  const S = window.MigiSprites;
  const $ = (id) => document.getElementById(id);

  const card = $("card"), thread = $("thread"), input = $("input"), form = $("composer");
  const picker = $("picker"), pickerList = $("picker-list"), pickerSearch = $("picker-search");
  const filesEl = $("files"), fileInput = $("file-input"), drop = $("drop");

  let experts = [];
  let expertId = "migi";
  let mode = "live";
  let busy = false;
  let pending = []; // attachments waiting to be sent
  const transcripts = new Map(); // expertId → [{ role, ... }]
  let live = null; // the answer currently streaming: { el, text, expertId }

  const expert = (id) => experts.find((e) => e.id === (id || expertId)) || experts[0];

  // ───────────── tiny markdown with citation markers ─────────────

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function markdown(src) {
    const lines = esc(src).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").split("\n");
    let html = "", list = null, para = [];
    const flushPara = () => { if (para.length) { html += `<p dir="auto">${para.join("<br>")}</p>`; para = []; } };
    const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      const ul = line.match(/^\s*[-•*]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ul || ol) {
        flushPara();
        const kind = ul ? "ul" : "ol";
        if (list !== kind) { flushList(); html += `<${kind} dir="auto">`; list = kind; }
        html += `<li>${(ul || ol)[1]}</li>`;
      } else if (!line.trim()) {
        flushPara(); flushList();
      } else {
        flushList();
        para.push(line);
      }
    }
    flushPara(); flushList();
    return html;
  }
  // parts: [{text, refs}] → html with [n] buttons where citations end
  function renderParts(parts) {
    const src = parts.map((p) => p.text + (p.refs && p.refs.length ? `\u0001${p.refs.join(",")}\u0002` : "")).join("");
    return markdown(src).replace(/\u0001([\d,]+)\u0002/g, (m, list) =>
      list.split(",").map((n) => `<button type="button" class="ref" data-ref="${n}" aria-label="Source ${n}">${n}</button>`).join("")
    );
  }
  const hideHandoffLine = (text) => text.replace(/\n?[ \t]*→\s*ask:.*$/i, "");
  // quotes come from markdown docs: drop the table pipes, bold marks and bullets
  const cleanQuote = (q) =>
    q
      .replace(/\*\*/g, "")
      .replace(/^\s*[|#>-]+\s*|\s*\|\s*$/g, "")
      .replace(/\s*\|\s*/g, " · ")
      .replace(/\s+/g, " ")
      .trim();

  // ───────────── header and picker ─────────────

  function avatarInto(el, spec, px) {
    el.textContent = "";
    el.appendChild(S.avatar(spec, px));
  }

  function renderHeader() {
    const e = expert();
    $("who-name").textContent = e.name;
    $("who-title").textContent = e.title;
    avatarInto($("who-avatar"), e.sprite, 32);
    $("back-migi").hidden = e.id === experts[0].id;
    input.placeholder = e.id === experts[0].id ? "Ask a question or drop in a file" : `Ask ${e.name} something`;
  }

  function renderPicker() {
    const q = pickerSearch.value.trim().toLowerCase();
    const shown = experts.filter((e) => !q || `${e.name} ${e.title} ${e.owns}`.toLowerCase().includes(q));
    pickerList.textContent = "";
    if (!shown.length) {
      pickerList.innerHTML = `<li class="picker__empty">No one matches “${esc(q)}”.</li>`;
      return;
    }
    for (const e of shown) {
      const li = document.createElement("li");
      li.innerHTML = `<button type="button" class="picker__item" role="option" aria-selected="${e.id === expertId}">
          <span class="picker__avatar"></span>
          <span><span class="picker__name">${esc(e.name)}</span><br><span class="picker__title">${esc(e.title)}</span></span>
          ${e.id === expertId ? '<span class="picker__check" aria-hidden="true">✓</span>' : ""}
        </button>`;
      avatarInto(li.querySelector(".picker__avatar"), e.sprite, 28);
      li.querySelector("button").addEventListener("click", () => { closePicker(); switchTo(e.id); });
      pickerList.appendChild(li);
    }
  }
  function openPicker() {
    picker.hidden = false;
    $("who").setAttribute("aria-expanded", "true");
    pickerSearch.value = "";
    renderPicker();
    pickerSearch.focus();
  }
  function closePicker() {
    picker.hidden = true;
    $("who").setAttribute("aria-expanded", "false");
  }

  function switchTo(id, fromMain) {
    if (!experts.some((e) => e.id === id) || id === expertId) return;
    expertId = id;
    if (!fromMain) migi.setExpert(id);
    renderHeader();
    renderThread();
    input.focus();
  }

  // ───────────── thread ─────────────

  function whoLine(e) {
    const div = document.createElement("div");
    div.className = "msg__who";
    div.innerHTML = `<span class="msg__who-avatar"></span><span>${esc(e.name)}</span><span class="msg__who-title">${esc(e.title)}</span>`;
    avatarInto(div.querySelector(".msg__who-avatar"), e.sprite, 18);
    return div;
  }

  function emptyState() {
    const e = expert();
    const wrap = document.createElement("div");
    wrap.className = "empty";
    const hi = e.id === experts[0].id ? `Hi, I'm ${esc(e.name)}.` : `You're talking to ${esc(e.name)}.`;
    const sub =
      e.id === experts[0].id
        ? "Ask me about the lab's plans, or to find and open anything on this computer. I show where my answers come from."
        : `${esc(e.title)}. Answers about ${esc(e.owns)}.`;
    wrap.innerHTML = `<div class="empty__avatar"></div><p class="empty__hi">${hi}</p><p class="empty__sub">${sub}</p><div class="suggestions"></div>`;
    avatarInto(wrap.querySelector(".empty__avatar"), e.sprite, 60);
    const box = wrap.querySelector(".suggestions");
    for (const s of e.suggestions || []) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "suggestion";
      b.textContent = s;
      b.addEventListener("click", () => send(s));
      box.appendChild(b);
    }
    return wrap;
  }

  function userMsg(m) {
    const div = document.createElement("div");
    div.className = "msg msg--user";
    if (m.files && m.files.length) {
      const f = document.createElement("div");
      f.className = "msg__files";
      f.innerHTML = m.files.map((n) => `<span class="file-chip"><span>${esc(n)}</span></span>`).join("");
      div.appendChild(f);
    }
    const b = document.createElement("div");
    b.className = "bubble";
    b.dir = "auto";
    b.textContent = m.text;
    div.appendChild(b);
    return div;
  }

  // ───────────── things Migi found or wants to open ─────────────

  const ICONS = {
    folder: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 4.5a1 1 0 011-1h3.3l1.4 1.5h6.3a1 1 0 011 1v6.5a1 1 0 01-1 1h-11a1 1 0 01-1-1z" fill="currentColor"/></svg>',
    file: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5l3.5 3.5v9a.5.5 0 01-.5.5H4a.5.5 0 01-.5-.5V2a.5.5 0 01.5-.5z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M9 1.5V5h3.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
    app: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1.2" fill="currentColor"/><rect x="9" y="2" width="5" height="5" rx="1.2" fill="currentColor"/><rect x="2" y="9" width="5" height="5" rx="1.2" fill="currentColor"/><rect x="9" y="9" width="5" height="5" rx="1.2" fill="currentColor" opacity=".5"/></svg>',
    link: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>'
  };
  function shortPath(p) {
    if (!p) return "";
    if (p.startsWith("shell:AppsFolder")) return "App";
    return p.length > 52 ? "…" + p.slice(-50) : p;
  }

  function foundList(t) {
    const box = document.createElement("div");
    box.className = "found";
    if (!t.items.length) {
      box.innerHTML = `<p class="found__title">${esc(t.title)}</p><p class="found__none">Nothing found.</p>`;
      return box;
    }
    box.innerHTML = `<p class="found__title">${esc(t.title)}</p>`;
    for (const it of t.items) {
      const row = document.createElement("div");
      row.className = "found__row";
      row.innerHTML = `<span class="found__icon found__icon--${it.kind}">${ICONS[it.kind] || ICONS.file}</span>
        <span class="found__text"><span class="found__name">${esc(it.name)}${it.program ? ' <span class="tag-program">program</span>' : ""}</span>
        <span class="found__path" title="${esc(it.path)}">${esc(shortPath(it.path))}</span></span>`;
      if (it.kind !== "app") {
        const reveal = document.createElement("button");
        reveal.type = "button";
        reveal.className = "mini mini--ghost";
        reveal.title = "Show in folder";
        reveal.setAttribute("aria-label", `Show ${it.name} in its folder`);
        reveal.innerHTML = ICONS.folder;
        reveal.addEventListener("click", () => migi.showInFolder(it.path));
        row.appendChild(reveal);
      }
      const open = document.createElement("button");
      open.type = "button";
      open.className = "mini";
      open.textContent = "Open";
      open.setAttribute("aria-label", `Open ${it.name}`);
      open.addEventListener("click", async () => {
        const err = await migi.openPath(it.path);
        open.textContent = err ? "Couldn't" : "Opened";
        open.disabled = true;
      });
      row.appendChild(open);
      box.appendChild(row);
    }
    return box;
  }

  function confirmCard(t, m) {
    const card = document.createElement("div");
    card.className = `confirm confirm--${t.state || "waiting"}`;
    const it = t.item;
    const what = it.kind === "link" ? "this page" : it.kind === "app" ? "this app" : it.kind === "folder" ? "this folder" : "this file";
    card.innerHTML = `<p class="confirm__q">${esc(expert(m.expertId).name)} wants to open ${what}</p>
      <div class="confirm__item"><span class="found__icon found__icon--${it.kind}">${ICONS[it.kind] || ICONS.file}</span>
        <span class="found__text"><span class="found__name">${esc(it.name)}</span><span class="found__path" title="${esc(it.path)}">${esc(shortPath(it.path))}</span></span></div>
      ${it.program ? '<p class="confirm__warn">This is a program. Opening it runs it.</p>' : ""}`;
    if (!t.state) {
      const row = document.createElement("div");
      row.className = "confirm__actions";
      row.innerHTML = '<button type="button" class="mini">Open</button><button type="button" class="mini mini--ghost-text">Not now</button>';
      const [yes, no] = row.querySelectorAll("button");
      yes.addEventListener("click", () => { t.state = "accepted"; migi.confirm(t.id, true); replace(m); });
      no.addEventListener("click", () => { t.state = "declined"; migi.confirm(t.id, false); replace(m); });
      card.appendChild(row);
    } else {
      const label = { accepted: "Opening…", opened: "Opened", declined: "Not opened", expired: "No answer, not opened", cancelled: "Stopped" }[t.state] || "";
      card.insertAdjacentHTML("beforeend", `<p class="confirm__state">${label}</p>`);
    }
    return card;
  }

  function toolsArea(m) {
    if (!m.tools || !m.tools.length) return null;
    const wrap = document.createElement("div");
    wrap.className = "tools";
    for (const t of m.tools) wrap.appendChild(t.type === "found" ? foundList(t) : confirmCard(t, m));
    return wrap;
  }

  function answerMsg(m) {
    const e = expert(m.expertId);
    const div = document.createElement("div");
    div.className = "msg msg--bot";
    div.appendChild(whoLine(e));
    const body = document.createElement("div");
    body.className = "answer";
    div.appendChild(body);
    const tools = toolsArea(m);
    if (m.error) {
      body.className = "error";
      body.textContent = m.error;
      if (tools) div.insertBefore(tools, body);
      return div;
    }
    if (!m.answer) {
      // still streaming
      if (m.text) { body.classList.add("is-streaming"); body.innerHTML = markdown(hideHandoffLine(m.text)); }
      else body.innerHTML = '<span class="typing" aria-label="Thinking"><i></i><i></i><i></i></span>';
      if (m.activity) body.insertAdjacentHTML("beforeend", `<p class="activity">${esc(m.activity)}…</p>`);
      if (tools) div.appendChild(tools);
      return div;
    }
    if (tools) div.appendChild(tools);
    body.innerHTML = renderParts(m.answer.parts);
    if (m.answer.sources.length) {
      const ol = document.createElement("ol");
      ol.className = "sources";
      ol.innerHTML =
        `<li class="sources__label">Sources</li>` +
        m.answer.sources
          .map((s) => {
            const c = cleanQuote(s.quote);
            const q = c.length > 150 ? c.slice(0, 147).trimEnd() + "…" : c;
            const title = s.url
              ? `<button type="button" class="source__title source__link" data-url="${esc(s.url)}" title="${esc(s.url)}">${esc(s.title)}</button>`
              : `<span class="source__title">${esc(s.title)}</span>`;
            return `<li class="source" data-src="${s.n}"><span class="source__n">${s.n}</span><span>${title}${q ? `: “${esc(q)}”` : ""}</span></li>`;
          })
          .join("");
      body.appendChild(ol);
    }
    if (m.truncated) body.insertAdjacentHTML("beforeend", '<span class="tag tag--demo">Cut short. Ask me to continue.</span>');
    if (m.demo) body.insertAdjacentHTML("beforeend", '<span class="tag tag--demo">Demo answer, straight from the docs</span>');
    const lead = m.answer.handoff && experts.find((x) => x.id === m.answer.handoff && x.id !== m.expertId);
    if (lead) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "handoff";
      b.innerHTML = `<span class="handoff__avatar"></span>Ask ${esc(lead.name)}`;
      avatarInto(b.querySelector(".handoff__avatar"), lead.sprite, 18);
      b.addEventListener("click", () => {
        const question = m.question;
        switchTo(lead.id);
        if (question) send(question);
      });
      div.appendChild(b);
    }
    return div;
  }

  function renderThread() {
    const list = transcripts.get(expertId) || [];
    thread.textContent = "";
    if (!list.length) { thread.appendChild(emptyState()); return; }
    for (const m of list) {
      const el = m.role === "user" ? userMsg(m) : answerMsg(m);
      m.el = el;
      thread.appendChild(el);
    }
    thread.scrollTop = thread.scrollHeight;
  }

  function replace(m) {
    if (!m.el || !m.el.isConnected) return;
    const el = answerMsg(m);
    m.el.replaceWith(el);
    m.el = el;
  }

  // citation buttons: highlight the matching source line
  thread.addEventListener("click", (e) => {
    const link = e.target.closest(".source__link");
    if (link) { migi.openUrl(link.dataset.url); return; }
    const ref = e.target.closest(".ref");
    if (!ref) return;
    const msg = ref.closest(".msg");
    const n = ref.dataset.ref;
    msg.querySelectorAll(".ref").forEach((r) => r.classList.toggle("is-on", r.dataset.ref === n && !r.classList.contains("is-on")));
    msg.querySelectorAll(".source").forEach((s) => s.classList.toggle("is-on", s.dataset.src === n));
    const src = msg.querySelector(`.source[data-src="${n}"]`);
    if (src) src.scrollIntoView({ block: "nearest" });
  });

  // ───────────── sending ─────────────

  function setBusy(b) {
    busy = b;
    card.classList.toggle("is-busy", b);
    $("send").setAttribute("aria-label", b ? "Stop" : "Send");
    updateSend();
  }
  function updateSend() {
    $("send").disabled = !busy && !input.value.trim();
  }

  function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    const list = transcripts.get(expertId) || [];
    transcripts.set(expertId, list);
    const files = pending.map((f) => f.name);
    list.push({ role: "user", text, files });
    const bot = { role: "bot", expertId, text: "", answer: null, question: text };
    list.push(bot);
    live = bot;
    renderThread();
    migi.ask({ expertId, text, attachments: pending });
    pending = [];
    renderFiles();
    input.value = "";
    autosize();
    setBusy(true);
  }

  migi.on("chat:event", (ev) => {
    if (!live) return;
    if (ev.type === "activity") {
      live.activity = ev.text;
      replace(live);
      return;
    }
    if (ev.type === "found" || ev.type === "confirm") {
      live.tools = live.tools || [];
      live.tools.push(ev.type === "found" ? { type: "found", title: ev.title, items: ev.items } : { type: "confirm", id: ev.id, item: ev.item, state: null });
      live.activity = null;
      replace(live);
      thread.scrollTop = thread.scrollHeight;
      return;
    }
    if (ev.type === "confirm-done" || ev.type === "opened") {
      const t = (live.tools || []).find((x) => x.type === "confirm" && (ev.id ? x.id === ev.id : x.item.path === ev.item.path && x.state === "accepted"));
      if (t) { t.state = ev.type === "opened" ? "opened" : ev.state === "accepted" ? "accepted" : ev.state; replace(live); }
      return;
    }
    if (ev.type === "delta") {
      live.text += ev.text;
      replace(live);
      thread.scrollTop = thread.scrollHeight;
    } else if (ev.type === "done") {
      live.answer = ev.answer;
      live.demo = ev.demo;
      live.truncated = ev.truncated;
      replace(live);
      thread.scrollTop = thread.scrollHeight;
      live = null;
      setBusy(false);
    } else if (ev.type === "error" || ev.type === "cancelled") {
      live.error = ev.type === "cancelled" ? "Stopped." : ev.message;
      replace(live);
      if (ev.kind === "setup") $("notice").hidden = false;
      live = null;
      setBusy(false);
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (busy) { migi.cancel(); return; }
    send(input.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });
  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 120) + "px";
    updateSend();
  }
  input.addEventListener("input", autosize);

  // ───────────── files ─────────────

  function renderFiles() {
    filesEl.textContent = "";
    pending.forEach((f, i) => {
      const chip = document.createElement("span");
      chip.className = "file-chip";
      chip.innerHTML = `<span>${esc(f.name)}</span><button type="button" aria-label="Remove ${esc(f.name)}">×</button>`;
      chip.querySelector("button").addEventListener("click", () => { pending.splice(i, 1); renderFiles(); });
      filesEl.appendChild(chip);
    });
  }
  async function addFiles(list) {
    for (const file of list) {
      const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
      const isText = /\.(md|txt|csv|json)$/i.test(file.name) || file.type.startsWith("text/");
      if (!isPdf && !isText) continue;
      if (isPdf) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let bin = "";
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        pending.push({ name: file.name, kind: "pdf", data: btoa(bin), size: file.size });
      } else {
        pending.push({ name: file.name, kind: "text", data: await file.text(), size: file.size });
      }
    }
    renderFiles();
    input.focus();
  }
  // the native file picker takes focus; keep the chat open meanwhile
  $("attach").addEventListener("click", () => { migi.holdOpen(true); fileInput.click(); });
  fileInput.addEventListener("change", () => { migi.holdOpen(false); addFiles(fileInput.files); fileInput.value = ""; });
  fileInput.addEventListener("cancel", () => migi.holdOpen(false));
  let dragDepth = 0;
  window.addEventListener("dragenter", (e) => { e.preventDefault(); dragDepth++; drop.hidden = false; });
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; drop.hidden = true; } });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
    dragDepth = 0;
    drop.hidden = true;
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // ───────────── header buttons ─────────────

  $("who").addEventListener("click", () => (picker.hidden ? openPicker() : closePicker()));
  pickerSearch.addEventListener("input", renderPicker);
  pickerSearch.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = pickerList.querySelector(".picker__item"); if (first) first.click(); }
    if (e.key === "ArrowDown") { e.preventDefault(); const first = pickerList.querySelector(".picker__item"); if (first) first.focus(); }
  });
  $("back-migi").addEventListener("click", () => switchTo(experts[0].id));
  $("new-chat").addEventListener("click", () => {
    if (busy) return;
    transcripts.delete(expertId);
    migi.reset(expertId);
    renderThread();
    input.focus();
  });
  $("pin").addEventListener("click", (e) => {
    const on = e.currentTarget.getAttribute("aria-pressed") !== "true";
    e.currentTarget.setAttribute("aria-pressed", String(on));
    migi.pinChat(on);
  });
  $("close").addEventListener("click", () => migi.closeChat());
  $("notice-ok").addEventListener("click", () => { $("notice").hidden = true; });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!picker.hidden) closePicker();
    else migi.closeChat();
  });
  document.addEventListener("mousedown", (e) => {
    if (!picker.hidden && !picker.contains(e.target) && !$("who").contains(e.target)) closePicker();
  });
  migi.on("app:expert", (id) => switchTo(id, true));
  migi.on("chat:visibility", (open) => { if (open) input.focus(); });
  window.addEventListener("focus", () => input.focus());

  // ───────────── start ─────────────

  migi.getSetup().then((setup) => {
    experts = setup.experts;
    expertId = setup.expertId || experts[0].id;
    mode = setup.mode;
    $("notice").hidden = mode !== "needs-key";
    renderHeader();
    renderThread();
    updateSend();
    input.focus();
  });
})();
