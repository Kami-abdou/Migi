/*
  Only for working on the UI in a normal browser (python -m http.server, then
  open /src/chat/chat.html or /src/pet/pet.html). Inside Electron, preload.js
  has already defined window.migi, so this file does nothing.
*/
(function () {
  "use strict";
  if (window.migi) return;

  const listeners = {};
  const emit = (ch, data) => (listeners[ch] || []).forEach((fn) => fn(data));
  let expertId = "migi";

  const canned = {
    parts: [
      { text: "We're at ", refs: [] },
      { text: "**312 of 512 bottles**", refs: [1] },
      { text: ", so 200 to go. The full wall should land somewhere around ", refs: [] },
      { text: "1,020 to 2,450 TND", refs: [2] },
      { text: ", and the bottles themselves cost nothing.\n\nBefore anything goes on the facade:\n- permission from the syndic and neighbours\n- low voltage outside only, fuses per section", refs: [3] }
    ],
    sources: [
      { n: 1, title: 'The bottle wall: "Our building is a video game"', quote: "Bottles collected so far: 312 / 512." },
      { n: 2, title: 'The bottle wall: "Our building is a video game"', quote: "| **Total** | ≈ 1,020 | ≈ 2,450 |" },
      { n: 3, title: 'The bottle wall: "Our building is a video game"', quote: "Permission from the syndic and neighbours before mounting" }
    ],
    handoff: null
  };

  window.migi = {
    petHover() {},
    petPosition() {},
    petClick() { emit("chat:visibility", true); },
    petMenu() {},
    setTrayIcon() {},
    async getSetup() {
      const r = await fetch("../../experts.json");
      const { experts } = await r.json();
      return { experts, mode: new URLSearchParams(location.search).get("mode") || "live", expertId, knowledge: [] };
    },
    async useDemo() { return "demo"; },
    setExpert(id) { expertId = id; emit("app:expert", id); },
    ask({ text }) {
      emit("pet:state", "thinking");
      if (/^(open|find)\b/i.test(text)) {
        // pretend Migi searched the computer and wants to open the top result
        const items = [
          { name: "Bottle wall budget.xlsx", path: "C:\\Users\\you\\Documents\\Lab\\Bottle wall budget.xlsx", kind: "file", program: false, modified: "2026-11-10" },
          { name: "Lab", path: "C:\\Users\\you\\Documents\\Lab", kind: "folder", program: false },
          { name: "Calculatrice", path: "shell:AppsFolder\\Microsoft.WindowsCalculator_8wekyb3d8bbwe!App", kind: "app", program: false }
        ];
        emit("chat:event", { type: "activity", text: "Searching your computer for “budget”" });
        setTimeout(() => emit("chat:event", { type: "found", title: "Found for “budget”", items }), 500);
        if (/^open/i.test(text)) setTimeout(() => emit("chat:event", { type: "confirm", id: "c1", item: items[0] }), 800);
        setTimeout(() => {
          emit("chat:event", { type: "delta", text: "Found it." });
          emit("chat:event", { type: "done", answer: { parts: [{ text: "Found it.", refs: [] }], sources: [], handoff: null } });
          emit("pet:state", "happy");
        }, 1100);
        return;
      }
      const answer = JSON.parse(JSON.stringify(canned));
      if (/power|pixel|volt/i.test(text)) answer.handoff = "build-lead";
      const full = answer.parts.map((p) => p.text).join("") + (answer.handoff ? "\n→ ask: build-lead" : "");
      const words = full.match(/\S+\s*/g) || [];
      let i = 0;
      setTimeout(function step() {
        if (i < words.length) {
          emit("chat:event", { type: "delta", text: words[i++] });
          emit("pet:state", "talking");
          setTimeout(step, 35);
        } else {
          emit("chat:event", { type: "done", answer });
          emit("pet:state", "happy");
        }
      }, 700);
    },
    cancel() { emit("chat:event", { type: "cancelled" }); },
    reset() {},
    closeChat() {},
    pinChat() {},
    holdOpen() {},
    confirm(id, ok) { console.log("[shim] confirm", id, ok); },
    async openPath(p) { console.log("[shim] open", p); return null; },
    showInFolder(p) { console.log("[shim] show", p); },
    openUrl(u) { console.log("[shim] url", u); },
    openKnowledge() {},
    on(ch, fn) {
      (listeners[ch] = listeners[ch] || []).push(fn);
      return () => {};
    },
    // browser only: pretend to be the main process, e.g. _emit("pet:state", "thinking")
    _emit: emit
  };
})();
