/*
  The pet: walks along the bottom edge of its window (which sits on the
  taskbar), idles, rests, waves when hovered, and thinks while Claude answers.
  Only the sprite's own box catches the mouse; everything else clicks through.

  Migi (the "parasite" sprite) also: watches the cursor anywhere on screen,
  stretches its eye up to think, talks with its mouth, now and then imitates
  a bottle from the wall, and melts before shape-shifting into a lead.
*/
(function () {
  "use strict";

  const migi = window.migi;
  const S = window.MigiSprites;
  const canvas = document.getElementById("stage");
  const ctx = canvas.getContext("2d");

  const SCALE = 3; // one sprite pixel = 3 screen pixels
  const SPEED = 30; // px per second
  const FRAME_RATE = 6; // walk-cycle frames per second
  const FEET_ROW = 24; // sprite rows down to just below the feet (incl. margin)

  let W = 0, H = 0, dpr = 1;
  let experts = [];
  let current = null; // the expert being shown
  let sprite = null;

  const pet = {
    x: 0,
    dir: 1,
    mode: "walk", // walk | idle | sit | imitate
    since: 0,
    until: 0,
    hop: 0,
    hover: false,
    chatOpen: false,
    paused: false,
    brain: "idle", // idle | thinking | talking
    bubble: null,
    puff: 0,
    swap: null, // { at, expert } while melting before a shape-shift
    cursor: null, // { x, y, t } in window coordinates
    look: { x: 0, y: 0 } // where the eye wanders when the cursor is still
  };

  // ───── sizing ─────
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    if (!pet.x) pet.x = Math.round(W * (0.35 + Math.random() * 0.3));
    pet.x = Math.min(Math.max(pet.x, 40), Math.max(40, W - 40));
  }

  function spriteBox() {
    const w = sprite.w * SCALE, h = FEET_ROW * SCALE;
    const hopY = pet.hop > 0 ? Math.round(Math.sin(pet.hop * Math.PI) * 10) : 0;
    return { x: Math.round(pet.x - w / 2), y: H - h - hopY, w, h };
  }

  // ───── behaviour ─────
  function decide(now) {
    pet.since = now;
    if (pet.chatOpen || pet.paused || pet.hover || pet.brain !== "idle") {
      pet.mode = "idle";
      pet.until = now + 1000;
      return;
    }
    const r = Math.random();
    if (r < 0.5) {
      pet.mode = "walk";
      if (Math.random() < 0.4) pet.dir *= -1;
      pet.until = now + 3000 + Math.random() * 6000;
    } else if (r < 0.82) {
      pet.mode = "idle";
      pet.until = now + 1800 + Math.random() * 3500;
    } else if (r < 0.94 || !sprite.frames.bottle) {
      pet.mode = "sit";
      pet.until = now + 4000 + Math.random() * 6000;
    } else {
      pet.mode = "imitate"; // pretend to be one of the wall's bottles for a bit
      pet.until = now + 3600;
    }
  }

  function say(text, ms) {
    pet.bubble = { text, until: performance.now() + ms };
  }

  // ───── drawing ─────
  function frameName(now) {
    const f = sprite.frames;
    if (pet.swap && f.melt) return "melt";
    if (pet.brain === "thinking" && f.think) return "think";
    if (pet.brain === "talking" && f.talk) return Math.floor(now / 150) % 2 ? "talk" : "stand";
    if (pet.hover && !pet.chatOpen) return "wave";
    if (pet.mode === "imitate") {
      const t = now - pet.since, left = pet.until - now;
      return t < 260 || left < 260 ? "melt" : "bottle";
    }
    if (pet.mode === "sit") return "sit";
    if (pet.mode === "walk") return ["walk1", "walk2", "walk3", "walk2"][Math.floor((now / 1000) * FRAME_RATE) % 4];
    return now % 4200 < 150 ? "blink" : "stand";
  }

  function drawBubble(box, text) {
    ctx.font = "600 12px 'Segoe UI', system-ui, sans-serif";
    const tw = Math.ceil(ctx.measureText(text).width);
    const bw = tw + 20, bh = 24;
    const bx = Math.round(Math.min(Math.max(box.x + box.w / 2 - bw / 2, 4), W - bw - 4));
    const by = Math.max(2, box.y - bh - 10);
    ctx.fillStyle = "#1d2033";
    ctx.beginPath();
    ctx.roundRect(bx - 2, by - 2, bw + 4, bh + 4, 9);
    ctx.fill();
    ctx.fillStyle = "#fffdf6";
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 7);
    ctx.fill();
    const tx = Math.round(box.x + box.w / 2);
    ctx.fillStyle = "#1d2033";
    ctx.fillRect(tx - 4, by + bh, 8, 4);
    ctx.fillRect(tx - 2, by + bh + 4, 4, 3);
    ctx.fillStyle = "#fffdf6";
    ctx.fillRect(tx - 2, by + bh, 4, 3);
    ctx.fillStyle = "#1d2033";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + 10, by + bh / 2 + 1);
  }

  // where the iris sits inside the eye: toward the cursor, or wandering
  function irisOffset(eyeX, eyeY, now) {
    if (pet.brain === "thinking") return { x: Math.round(Math.sin(now / 420) * 1.2), y: -1 };
    let tx, ty;
    if (pet.cursor && now - pet.cursor.t < 3000) {
      tx = pet.cursor.x - eyeX;
      ty = pet.cursor.y - eyeY;
    } else {
      if (Math.random() < 0.01) pet.look = { x: (Math.random() - 0.5) * 400, y: -Math.random() * 300 };
      tx = pet.look.x;
      ty = pet.look.y;
    }
    const d = Math.hypot(tx, ty) || 1;
    let ox = Math.abs(tx) / d > 0.38 ? Math.sign(tx) : 0;
    let oy = Math.abs(ty) / d > 0.38 ? Math.sign(ty) : 0;
    if (d < 24) { ox = 0; oy = 0; }
    return { x: ox, y: oy };
  }

  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!sprite) return;
    const box = spriteBox();
    const name = frameName(now);
    const flip = pet.dir < 0;
    const mirrorX = (px) => (flip ? sprite.w - px : px); // sprite px → facing-corrected px

    // a soft shadow on the taskbar edge
    ctx.fillStyle = "rgba(0,0,0,0.22)";
    ctx.beginPath();
    ctx.ellipse(pet.x, H - 2, box.w * 0.32 * (pet.hop > 0 ? 0.8 : 1), 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // green glow: the bottle's LED, a lead's badge, or Migi's eye while it thinks
    const busy = pet.brain !== "idle";
    const eye = sprite.eyes[name];
    let glowAt = null;
    if (sprite.led) glowAt = sprite.led;
    else if (eye && busy) glowAt = { x: eye.x + 1, y: eye.y + 1 };
    if (glowAt) {
      const a = busy ? 0.5 + 0.35 * Math.sin(now / 160) : 0.25 + 0.1 * Math.sin(now / 900);
      const gx = box.x + mirrorX(glowAt.x + 0.5) * SCALE, gy = box.y + (glowAt.y + 0.5) * SCALE;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, SCALE * (sprite.isBottle ? 9 : 6));
      g.addColorStop(0, `rgba(124,242,154,${a})`);
      g.addColorStop(1, "rgba(124,242,154,0)");
      ctx.fillStyle = g;
      ctx.fillRect(gx - 40, gy - 40, 80, 80);
    }

    // the sprite, flipped when facing left
    ctx.imageSmoothingEnabled = false;
    const img = sprite.frames[name] || sprite.frames.stand;
    ctx.save();
    if (flip) {
      ctx.translate(box.x + box.w, box.y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, sprite.w * SCALE, sprite.h * SCALE);
    } else {
      ctx.drawImage(img, box.x, box.y, sprite.w * SCALE, sprite.h * SCALE);
    }
    ctx.restore();

    // Migi's iris, drawn on top so it can follow the cursor
    if (eye) {
      const ex = box.x + (flip ? sprite.w - eye.x - 3 : eye.x) * SCALE;
      const ey = box.y + eye.y * SCALE;
      const o = irisOffset(ex + 1.5 * SCALE, ey + 1.5 * SCALE, now);
      S.drawIris(ctx, ex + o.x * SCALE, ey + o.y * SCALE, SCALE);
    }

    // a burst of pixels when Migi turns into someone else
    if (pet.puff > 0) {
      const t = 1 - pet.puff;
      ctx.fillStyle = `rgba(232,196,173,${pet.puff})`;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.fillRect(pet.x + Math.cos(a) * (10 + t * 34) - 2, box.y + box.h * 0.6 + Math.sin(a) * (8 + t * 26) - 2, 4, 4);
      }
    }

    // speech bubble
    let text = null;
    if (pet.brain === "thinking") text = ".".repeat(1 + (Math.floor(now / 350) % 3));
    else if (pet.hover && !pet.chatOpen) text = current ? current.name : "Migi";
    else if (pet.bubble && now < pet.bubble.until) text = pet.bubble.text;
    if (text) drawBubble(box, text);
  }

  function become(expert) {
    current = expert;
    sprite = S.build(expert.sprite);
  }

  // ───── loop ─────
  let last = performance.now();
  let lastSent = 0;
  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (pet.swap && now >= pet.swap.at) {
      become(pet.swap.expert);
      pet.swap = null;
      pet.puff = 1;
      pet.hop = 1;
    }
    if (now > pet.until) decide(now);
    if (pet.mode === "walk" && !pet.hover && !pet.chatOpen && !pet.paused && pet.brain === "idle" && !pet.swap) {
      pet.x += pet.dir * SPEED * dt;
      if (pet.x < 40) { pet.x = 40; pet.dir = 1; }
      if (pet.x > W - 40) { pet.x = W - 40; pet.dir = -1; }
    }
    if (pet.hop > 0) pet.hop = Math.max(0, pet.hop - dt * 2.2);
    if (pet.puff > 0) pet.puff = Math.max(0, pet.puff - dt * 2.5);
    if (now - lastSent > 400) { lastSent = now; migi.petPosition(Math.round(pet.x)); }
    draw(now);
  }

  // ───── mouse: only the sprite catches it ─────
  function overSprite(e) {
    if (!sprite) return false;
    const b = spriteBox();
    return e.clientX >= b.x - 6 && e.clientX <= b.x + b.w + 6 && e.clientY >= b.y - 6 && e.clientY <= b.y + b.h + 4;
  }
  window.addEventListener("mousemove", (e) => {
    const over = overSprite(e);
    if (over === pet.hover) return;
    pet.hover = over;
    document.body.classList.toggle("is-hover", over);
    migi.petHover(over);
  });
  window.addEventListener("mouseleave", () => {
    if (!pet.hover) return;
    pet.hover = false;
    document.body.classList.remove("is-hover");
    migi.petHover(false);
  });
  window.addEventListener("click", (e) => {
    if (!overSprite(e)) return;
    pet.hop = 1;
    migi.petClick(Math.round(pet.x));
  });
  window.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    if (overSprite(e)) migi.petMenu();
  });

  // ───── messages from the main process ─────
  migi.on("pet:cursor", (p) => { pet.cursor = { x: p.x, y: p.y, t: performance.now() }; });
  migi.on("chat:visibility", (open) => {
    pet.chatOpen = open;
    pet.mode = "idle";
    pet.until = performance.now() + 800;
  });
  migi.on("pet:paused", (p) => { pet.paused = p; });
  migi.on("pet:state", (s) => {
    if (s === "happy") { pet.hop = 1; pet.brain = "idle"; return; }
    pet.brain = s;
  });
  migi.on("app:expert", (id) => {
    const e = experts.find((x) => x.id === id);
    if (!e || e === current) return;
    // melt first (if this form can), then take the new shape
    pet.swap = { at: performance.now() + (sprite && sprite.frames.melt ? 320 : 0), expert: e };
  });

  // ───── start ─────
  window.addEventListener("resize", resize);
  resize();
  migi.getSetup().then((setup) => {
    experts = setup.experts;
    become(experts.find((x) => x.id === setup.expertId) || experts[0]);
    migi.setTrayIcon(S.avatar(experts[0].sprite, 32).toDataURL("image/png"));
    say("Hm. A question?", 6000);
    requestAnimationFrame(tick);
  });
})();
