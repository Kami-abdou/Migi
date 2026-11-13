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
    openKnowledge() {},
    on(ch, fn) {
      (listeners[ch] = listeners[ch] || []).push(fn);
      return () => {};
    },
    // browser only: pretend to be the main process, e.g. _emit("pet:state", "thinking")
    _emit: emit
  };
})();
