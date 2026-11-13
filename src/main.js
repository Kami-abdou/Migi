/*
  Migi's main process: two windows and a tray icon.

  - The pet window is a transparent, click-through strip along the bottom of
    the screen's work area, so Migi stands on the taskbar (or the Mac Dock).
    Only the sprite itself catches the mouse.
  - The chat window opens above Migi when you click it.
*/
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, shell } = require("electron");
const path = require("path");
const { createBrain, KNOWLEDGE_DIR } = require("./brain");

const DEMO = process.argv.includes("--demo");
const OPEN_CHAT = process.argv.includes("--open-chat"); // handy for screenshots
const ASK = (process.argv.find((a) => a.startsWith("--ask=")) || "").slice(6); // opens the chat and asks this
const PET_H = 170; // room for the sprite plus its speech bubble
const SPRITE_TOP = 96; // how far above the work-area bottom Migi's head reaches
const CHAT_W = 400;
const CHAT_H = 600;

if (!app.requestSingleInstanceLock()) app.quit();

let petWin = null;
let chatWin = null;
let tray = null;
let brain = null;
let petX = 200; // Migi's centre, in pet-window pixels
let pinned = false; // pinned: the chat stays open when you click elsewhere
let holdOpen = false; // true while the file picker is open
let expertId = "migi";
let paused = false;

const webPreferences = {
  preload: path.join(__dirname, "preload.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true
};

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function placePet() {
  const wa = workArea();
  petWin.setBounds({ x: wa.x, y: wa.y + wa.height - PET_H, width: wa.width, height: PET_H });
}

function createPet() {
  petWin = new BrowserWindow({
    width: 800,
    height: PET_H,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    alwaysOnTop: true,
    show: false,
    webPreferences
  });
  placePet();
  petWin.setAlwaysOnTop(true, "floating");
  if (process.platform === "darwin") petWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  petWin.setIgnoreMouseEvents(true, { forward: true });
  petWin.loadFile(path.join(__dirname, "pet", "pet.html"));
  petWin.once("ready-to-show", () => petWin.showInactive());
}

function createChat() {
  chatWin = new BrowserWindow({
    width: CHAT_W,
    height: CHAT_H,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    webPreferences
  });
  chatWin.loadFile(path.join(__dirname, "chat", "chat.html"));
  chatWin.setAlwaysOnTop(true, "floating");
  chatWin.on("hide", () => sendPet("chat:visibility", false));
  chatWin.on("show", () => sendPet("chat:visibility", true));
  // Like a popover: clicking elsewhere closes it, unless it's pinned.
  chatWin.on("blur", () => {
    if (!pinned && !holdOpen && chatWin.isVisible()) chatWin.hide();
  });
}

function sendPet(channel, data) {
  if (petWin && !petWin.isDestroyed()) petWin.webContents.send(channel, data);
}
function sendChat(channel, data) {
  if (chatWin && !chatWin.isDestroyed()) chatWin.webContents.send(channel, data);
}

function placeChat() {
  const wa = workArea();
  const x = Math.round(Math.min(Math.max(wa.x + petX - CHAT_W / 2, wa.x + 8), wa.x + wa.width - CHAT_W - 8));
  const y = Math.round(Math.max(wa.y + 8, wa.y + wa.height - SPRITE_TOP - CHAT_H));
  chatWin.setBounds({ x, y, width: CHAT_W, height: CHAT_H });
}

function showChat(inactive) {
  placeChat();
  if (inactive) { chatWin.showInactive(); return; }
  chatWin.show();
  chatWin.focus();
}
function toggleChat() {
  if (chatWin.isVisible()) chatWin.hide();
  else showChat();
}

function setExpert(id) {
  if (!brain.experts.some((e) => e.id === id)) return;
  expertId = id;
  sendPet("app:expert", id);
  sendChat("app:expert", id);
}

function menuTemplate() {
  return [
    { label: chatWin && chatWin.isVisible() ? "Hide chat" : "Ask Migi…", click: toggleChat },
    {
      label: "Talk to",
      submenu: brain.experts.map((e) => ({ label: `${e.name} (${e.title})`, type: "radio", checked: e.id === expertId, click: () => setExpert(e.id) }))
    },
    { label: paused ? "Let Migi walk" : "Stay still", click: () => { paused = !paused; sendPet("pet:paused", paused); } },
    { type: "separator" },
    { label: "Open the knowledge folder", click: () => shell.openPath(KNOWLEDGE_DIR) },
    { type: "separator" },
    { label: "Quit Migi", click: () => app.quit() }
  ];
}

// Migi's eye follows the cursor anywhere on screen, not only over its window.
function watchCursor() {
  let lastX = null, lastY = null;
  setInterval(() => {
    if (!petWin || petWin.isDestroyed()) return;
    const p = screen.getCursorScreenPoint();
    if (p.x === lastX && p.y === lastY) return;
    lastX = p.x;
    lastY = p.y;
    const b = petWin.getBounds();
    sendPet("pet:cursor", { x: p.x - b.x, y: p.y - b.y });
  }, 90);
}

// ───────────── IPC ─────────────

ipcMain.on("pet:hover", (_e, over) => {
  if (!petWin) return;
  if (over) petWin.setIgnoreMouseEvents(false);
  else petWin.setIgnoreMouseEvents(true, { forward: true });
});
ipcMain.on("pet:position", (_e, x) => { petX = x; });
ipcMain.on("pet:click", (_e, x) => { petX = x; toggleChat(); });
ipcMain.on("pet:menu", () => Menu.buildFromTemplate(menuTemplate()).popup({ window: petWin }));
ipcMain.on("pet:icon", (_e, dataUrl) => {
  const icon = nativeImage.createFromDataURL(dataUrl);
  if (tray) { tray.setImage(icon); return; }
  tray = new Tray(icon);
  tray.setToolTip("Migi");
  tray.on("click", toggleChat);
  tray.on("right-click", () => tray.popUpContextMenu(Menu.buildFromTemplate(menuTemplate())));
});

ipcMain.handle("app:setup", () => ({ experts: brain.experts, mode: brain.mode, expertId, knowledge: brain.knowledge }));
ipcMain.handle("app:demo", () => brain.useDemo());
ipcMain.on("app:expert", (_e, id) => setExpert(id));
ipcMain.on("app:open-knowledge", () => shell.openPath(KNOWLEDGE_DIR));

ipcMain.on("chat:ask", (_e, payload) => {
  sendPet("pet:state", "thinking");
  brain.ask(payload, (event) => {
    sendChat("chat:event", event);
    if (event.type === "delta") sendPet("pet:state", "talking");
    if (event.type === "done") sendPet("pet:state", "happy");
    if (event.type === "error" || event.type === "cancelled") sendPet("pet:state", "idle");
    if (event.type === "done" && event.usage) console.log("[migi] tokens", event.usage);
    if (process.env.MIGI_DEBUG && event.type !== "delta") console.log("[migi] event", JSON.stringify(event).slice(0, 300));
  });
});
ipcMain.on("chat:cancel", () => brain.cancel());
ipcMain.on("chat:reset", (_e, id) => brain.reset(id));
ipcMain.on("chat:close", () => chatWin.hide());
ipcMain.on("chat:pin", (_e, on) => { pinned = Boolean(on); });
ipcMain.on("chat:hold-open", (_e, on) => { holdOpen = Boolean(on); });

// ───────────── lifecycle ─────────────

app.on("second-instance", () => chatWin && showChat());

app.whenReady().then(() => {
  if (process.platform === "darwin" && app.dock) app.dock.hide(); // Migi lives on the Dock, not in it
  brain = createBrain({ demo: DEMO });
  createPet();
  createChat();
  watchCursor();
  screen.on("display-metrics-changed", placePet);
  screen.on("display-added", placePet);
  screen.on("display-removed", placePet);
  // --ask opens the chat without taking focus, so it doesn't interrupt whatever you're typing
  if (OPEN_CHAT || ASK) chatWin.once("ready-to-show", () => setTimeout(() => showChat(Boolean(ASK)), 600));
  if (ASK) {
    chatWin.webContents.once("did-finish-load", () =>
      setTimeout(() => {
        chatWin.webContents.executeJavaScript(
          `document.getElementById("input").value = ${JSON.stringify(ASK)}; document.getElementById("composer").requestSubmit();`
        );
      }, 1500)
    );
  }
});

// The pet window never closes on its own; quitting goes through the menu.
app.on("window-all-closed", (e) => e.preventDefault());
