/*
  Pixel sprites drawn from code, so there are no image files to manage.

  - "parasite": Migi. A pale shape-shifting creature with one big eye on a
    stalk. Its iris is drawn separately (see pet.js) so it can follow the cursor.
    It can also melt flat, stretch up to think, and imitate a bottle.
  - "bottle": a plastic bottle from the wall (cap, label, a green LED inside).
  - any other spec: a small pixel person, colours from experts.json.

  MigiSprites.build(spec) → { w, h, frames: {name: canvas}, eyes: {name: {x, y} | null}, led }
  MigiSprites.avatar(spec, px) → a canvas with the standing frame fitted in px × px
*/
(function () {
  "use strict";

  const W = 16, H = 24;
  const INK = "#1d2033";

  // ───── Migi, the bottle ─────
  const BOTTLE_BODY = [
    "......KKKK......",
    ".....KCCCCK.....",
    ".....KCCCcK.....",
    "......KKKK......",
    "......KWWK......",
    ".....KWWWWK.....",
    "....KWHWWWWK....",
    "...KWHWWWWWwK...",
    "...KWHWWWWWwK...",
    "...KWHEWWEWwK...",
    "...KWHWWWWWwK...",
    "...KWWWMMWWwK...",
    "...KLLLLLLLlK...",
    "...KLLLLLLLlK...",
    "...KWWWGGWWwK...",
    "...KWWGGGGWwK...",
    "...KWWWGGWWwK...",
    "...KWWWWWWWwK...",
    "...KwwwwwwwwK...",
    "....KKKKKKKK...."
  ];
  const BOTTLE_PALETTE = {
    K: INK,
    C: "#3a6fd8",
    c: "#2a50a8",
    W: "rgba(214,240,255,0.93)",
    w: "rgba(160,205,232,0.96)",
    H: "#ffffff",
    E: INK,
    M: INK,
    L: "#f2a65a",
    l: "#c97f3d",
    G: "#7cf29a",
    g: "#3fbf6a",
    F: INK,
    A: INK
  };
  const BOTTLE_LEGS = {
    stand: ["......F..F......", "......F..F......", ".....FF..FF.....", "................"],
    walk1: ["......F..F......", ".....F....F.....", "....FF....FF....", "................"],
    walk3: ["......F..F......", ".......FF.......", "......FFFF......", "................"],
    sit: ["....FFF..FFF....", "................", "................", "................"]
  };

  // ───── a lead, as a pixel person ─────
  const PERSON_BODY = [
    "................",
    "................",
    "................",
    "................",
    ".....hhhhhh.....",
    "....hhhhhhhh....",
    "....hSSSSSSh....",
    "....SSESSESS....",
    "....SSSSSSSS....",
    ".....SSmmSS.....",
    "......SSSS......",
    "....TTTTTTTT....",
    "...TTTTTTTTTT...",
    "..STTTTTTTaTTS..",
    "..STTTTTTTTTTS..",
    "..STTTTTTTTTTS..",
    "....TTTTTTTT....",
    "....PPPPPPPP....",
    "....PPPPPPPP....",
    "....PPP..PPP...."
  ];
  const PERSON_LEGS = {
    stand: ["....PPP..PPP....", "....PPP..PPP....", "....BBB..BBB....", "................"],
    walk1: ["....PPP..PPP....", "...PPP....PPP...", "..BBB......BBB..", "................"],
    walk3: ["....PPP..PPP....", ".....PPPPPP.....", ".....BBBBBB.....", "................"],
    sit: ["...PPPPPPPPPP...", "..BBB......BBB..", "................", "................"]
  };

  function grid(rows) {
    return rows.map((r) => r.split(""));
  }
  function set(g, x, y, ch) {
    if (y >= 0 && y < g.length && x >= 0 && x < W) g[y][x] = ch;
  }

  function bottleFrames() {
    const make = (legs, opts) => {
      const g = grid(BOTTLE_BODY.concat(BOTTLE_LEGS[legs]));
      opts = opts || {};
      if (opts.blink) { set(g, 6, 9, "W"); set(g, 9, 9, "W"); }
      // arms: little ink sticks on both sides
      const left = opts.leftArm || "down", right = opts.rightArm || "down";
      const arm = (side, pose) => {
        const x = side === "l" ? 2 : 13, out = side === "l" ? 1 : 14;
        if (pose === "down") { set(g, x, 13, "A"); set(g, x, 14, "A"); }
        if (pose === "fwd") { set(g, x, 13, "A"); set(g, out, 14, "A"); }
        if (pose === "back") { set(g, x, 12, "A"); set(g, x, 13, "A"); }
        if (pose === "up") { set(g, x, 11, "A"); set(g, out, 10, "A"); set(g, out, 9, "A"); }
      };
      arm("l", left);
      arm("r", right);
      if (opts.bob) g.unshift(g.pop()); // shift the body down a pixel (legs bend)
      return g;
    };
    return {
      stand: make("stand"),
      blink: make("stand", { blink: true }),
      walk1: make("walk1", { leftArm: "fwd", rightArm: "back" }),
      walk2: make("stand", { bob: true }),
      walk3: make("walk3", { leftArm: "back", rightArm: "fwd" }),
      wave: make("stand", { rightArm: "up" }),
      sit: make("sit", { bob: true })
    };
  }

  function personFrames() {
    const make = (legs, opts) => {
      const g = grid(PERSON_BODY.concat(PERSON_LEGS[legs]));
      opts = opts || {};
      if (opts.blink) { g[7][6] = "S"; g[7][9] = "S"; }
      if (opts.wave) {
        for (let y = 13; y <= 15; y++) set(g, 13, y, ".");
        set(g, 13, 12, "S"); set(g, 14, 11, "S"); set(g, 14, 10, "S"); set(g, 14, 9, "S");
      }
      if (opts.swing === 1) { set(g, 2, 15, "."); set(g, 1, 15, "S"); }
      if (opts.swing === 2) { set(g, 13, 15, "."); set(g, 14, 15, "S"); }
      if (opts.bob) g.unshift(g.pop());
      return g;
    };
    return {
      stand: make("stand"),
      blink: make("stand", { blink: true }),
      walk1: make("walk1", { swing: 1 }),
      walk2: make("stand", { bob: true }),
      walk3: make("walk3", { swing: 2 }),
      wave: make("stand", { wave: true }),
      sit: make("sit", { bob: true })
    };
  }

  // ───── Migi, the shape-shifter ─────
  const PARASITE_PALETTE = {
    F: "#e8c4ad", // flesh
    f: "#c4957d", // flesh in shade
    h: "#f8e6da", // highlight
    W: "#ffffff", // eye
    w: "#d5dbe5", // eye, lower lid shade
    M: "#5a1f24", // mouth
    T: "#fff3ea" // teeth
  };

  // One frame of the creature, rasterised from a few numbers.
  // Its body is a dome sitting on row 22; a stalk rises from it to the eye.
  function blob(p) {
    const g = Array.from({ length: H }, () => Array(W).fill("."));
    const cy = 23 - p.ry;
    for (let j = 0; j <= 22; j++) {
      for (let i = 0; i < W; i++) {
        const dx = (i + 0.5 - p.cx) / p.rx, dy = (j + 0.5 - cy) / p.ry;
        if (dx * dx + dy * dy > 1) continue;
        let ch = "F";
        if (dx > 0.45 || dy > 0.62) ch = "f";
        if (dx < -0.3 && dx > -0.72 && dy < -0.3 && dy > -0.8) ch = "h";
        g[j][i] = ch;
      }
    }
    const ex = p.cx + (p.lean || 0), ey = p.eyeY;
    // stalk: two pixels wide, bending toward where the eye leans
    const top = Math.floor(cy - p.ry) + 1;
    for (let j = Math.round(ey); j <= top; j++) {
      const t = top === ey ? 1 : (j - ey) / (top - ey);
      const x = Math.round(p.cx - 1 + (p.lean || 0) * (1 - t));
      if (g[j][x] === ".") g[j][x] = "F";
      if (g[j][x + 1] === ".") g[j][x + 1] = "f";
    }
    // eye
    let eye = null;
    const rx = 3.5, ry = p.blink ? 0.6 : 2.9;
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const dx = (i + 0.5 - ex) / rx, dy = (j + 0.5 - ey) / ry;
        if (dx * dx + dy * dy > 1) continue;
        g[j][i] = p.blink ? "f" : dy > 0.5 ? "w" : "W";
      }
    }
    if (!p.blink) eye = { x: Math.round(ex - 1.5), y: Math.round(ey - 1.5) };
    // mouth, on the side it faces
    if (p.mouth) {
      const my = Math.round(cy - p.ry * 0.05), mx = Math.round(p.cx + p.rx * 0.12);
      if (p.mouth === "open") {
        for (let i = mx - 1; i <= mx + 2; i++) { set(g, i, my - 1, "T"); set(g, i, my, "M"); set(g, i, my + 1, "M"); }
      } else {
        for (let i = mx; i <= mx + 2; i++) set(g, i, my, "M");
      }
    }
    // a little hand grown out of its side
    if (p.wave) {
      const hx = Math.min(13, Math.round(p.cx + p.rx - 1)), hy = Math.round(cy - p.ry * 0.4);
      set(g, hx, hy, "F"); set(g, hx + 1, hy - 1, "F"); set(g, hx + 1, hy - 2, "F");
      for (let i = hx; i <= hx + 2; i++) { set(g, i, hy - 3, "F"); set(g, i, hy - 4, "F"); }
      set(g, hx, hy - 6, "F"); set(g, hx, hy - 5, "F");
      set(g, hx + 1, hy - 7, "F"); set(g, hx + 1, hy - 6, "F"); set(g, hx + 1, hy - 5, "F");
      set(g, hx + 2, hy - 6, "F"); set(g, hx + 2, hy - 5, "F");
      set(g, hx - 1, hy - 4, "f");
    }
    return { grid: g, eye };
  }

  // Migi imitating one of the wall's bottles, with its eye where the cap was.
  function bottleImitation() {
    const g = grid(BOTTLE_BODY.concat(BOTTLE_LEGS.stand));
    for (let j = 0; j < 4; j++) g[j] = Array(W).fill(".");
    g[9] = g[9].map((c) => (c === "E" ? "W" : c));
    const ex = 8, ey = 1.9;
    for (let j = 0; j < 4; j++) {
      for (let i = 0; i < W; i++) {
        const dx = (i + 0.5 - ex) / 3.1, dy = (j + 0.5 - ey) / 2.0;
        if (dx * dx + dy * dy <= 1) g[j][i] = dy > 0.5 ? "y" : "Y";
      }
    }
    return { grid: g, eye: { x: 6, y: 0 } };
  }

  function parasiteDefs() {
    const base = { cx: 8, rx: 5.6, ry: 4.6, lean: 0, eyeY: 6.2, mouth: "line" };
    const f = (over) => {
      const b = blob(Object.assign({}, base, over));
      return { grid: b.grid, eye: b.eye, palette: PARASITE_PALETTE, outline: true };
    };
    const bottle = bottleImitation();
    return {
      stand: f({}),
      blink: f({ blink: true }),
      walk1: f({ rx: 6.6, ry: 3.8, lean: 1, eyeY: 7.6 }),
      walk2: f({ rx: 6.0, ry: 4.2, lean: 0.5, eyeY: 6.9 }),
      walk3: f({ rx: 5.0, ry: 5.2, lean: -0.5, eyeY: 5.6 }),
      wave: f({ wave: true }),
      sit: f({ rx: 6.8, ry: 3.2, eyeY: 10.5, mouth: null }),
      talk: f({ mouth: "open" }),
      think: f({ rx: 5.2, ry: 4.8, eyeY: 2.8 }),
      melt: f({ rx: 7.4, ry: 2.2, eyeY: 15.5, mouth: null }),
      bottle: {
        grid: bottle.grid,
        eye: bottle.eye,
        palette: Object.assign({}, BOTTLE_PALETTE, { Y: "#ffffff", y: "#d5dbe5" }),
        outline: false
      }
    };
  }

  function personPalette(spec) {
    return {
      h: spec.hair || "#2b1d14",
      S: spec.skin || "#c68b59",
      E: INK,
      m: "#7a3b2e",
      T: spec.shirt || "#7cf29a",
      a: spec.accent || "#1f7a43",
      P: spec.pants || "#2c3354",
      B: "#14161f"
    };
  }

  // Paint a char grid into a 1px-per-pixel canvas; optionally add a 1px ink outline.
  function paint(g, palette, outline) {
    const c = document.createElement("canvas");
    c.width = W + 2;
    c.height = H + 2;
    const x = c.getContext("2d");
    const filled = (i, j) => j >= 0 && j < g.length && i >= 0 && i < W && g[j][i] !== "." && palette[g[j][i]];
    if (outline) {
      x.fillStyle = INK;
      for (let j = -1; j <= g.length; j++) {
        for (let i = -1; i <= W; i++) {
          if (filled(i, j)) continue;
          if (filled(i - 1, j) || filled(i + 1, j) || filled(i, j - 1) || filled(i, j + 1)) x.fillRect(i + 1, j + 1, 1, 1);
        }
      }
    }
    for (let j = 0; j < g.length; j++) {
      for (let i = 0; i < W; i++) {
        const col = palette[g[j][i]];
        if (!col) continue;
        x.fillStyle = col;
        x.fillRect(i + 1, j + 1, 1, 1);
      }
    }
    return c;
  }

  const cache = new Map();
  function build(spec) {
    const key = JSON.stringify(spec);
    if (cache.has(key)) return cache.get(key);
    const kind = spec === "bottle" || spec === "parasite" ? spec : "person";
    let defs;
    if (kind === "parasite") {
      defs = parasiteDefs();
    } else {
      const grids = kind === "bottle" ? bottleFrames() : personFrames();
      const palette = kind === "bottle" ? BOTTLE_PALETTE : personPalette(spec);
      defs = {};
      for (const [name, g] of Object.entries(grids)) defs[name] = { grid: g, eye: null, palette, outline: kind !== "bottle" };
    }
    const frames = {}, eyes = {};
    for (const [name, d] of Object.entries(defs)) {
      frames[name] = paint(d.grid, d.palette, d.outline);
      eyes[name] = d.eye ? { x: d.eye.x + 1, y: d.eye.y + 1 } : null; // +1: the canvas margin
    }
    // where the green glow sits: the bottle's LED, a person's badge; Migi's glow follows its eye
    const led = kind === "bottle" ? { x: 8, y: 16 } : kind === "person" ? { x: 11, y: 14 } : null;
    const out = { w: W + 2, h: H + 2, frames, eyes, led, kind, isBottle: kind === "bottle" };
    cache.set(key, out);
    return out;
  }

  function rowPainted(data, width, y) {
    for (let i = 0; i < width; i++) if (data[(y * width + i) * 4 + 3] > 0) return true;
    return false;
  }

  function avatar(spec, px) {
    const s = build(spec);
    const c = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(px * dpr);
    c.height = Math.round(px * dpr);
    c.style.width = px + "px";
    c.style.height = px + "px";
    const x = c.getContext("2d");
    x.imageSmoothingEnabled = false;
    // fit 20 rows from the first painted row (head and body) into the square
    const img = s.frames.stand;
    const data = img.getContext("2d").getImageData(0, 0, img.width, img.height).data;
    let top = 0;
    while (top < img.height && !rowPainted(data, img.width, top)) top++;
    const rows = 20, scale = Math.floor((px * dpr) / rows) || 1;
    const dw = s.w * scale, dh = rows * scale;
    const ox = Math.round((c.width - dw) / 2), oy = Math.round((c.height - dh) / 2);
    x.drawImage(img, 0, top, s.w, rows, ox, oy, dw, dh);
    const eye = s.eyes.stand;
    if (eye) drawIris(x, ox + eye.x * scale, oy + (eye.y - top) * scale, scale);
    return c;
  }

  // Migi's 3 × 3 iris: green ring, dark pupil, a glint. (x, y) is its top-left corner in canvas pixels.
  function drawIris(ctx, x, y, px) {
    const cells = [
      ["#ffffff", "#3fbf6a", "#2a8a4c"],
      ["#3fbf6a", "#141a33", "#3fbf6a"],
      ["#2a8a4c", "#3fbf6a", "#2a8a4c"]
    ];
    for (let j = 0; j < 3; j++) {
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = cells[j][i];
        ctx.fillRect(x + i * px, y + j * px, px, px);
      }
    }
  }

  window.MigiSprites = { build, avatar, drawIris };
})();
