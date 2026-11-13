// The only bridge between the windows and the main process.
const { contextBridge, ipcRenderer } = require("electron");

const LISTEN = ["chat:event", "pet:state", "pet:paused", "pet:cursor", "app:expert", "chat:visibility"];

contextBridge.exposeInMainWorld("migi", {
  // pet window
  petHover: (over) => ipcRenderer.send("pet:hover", over),
  petPosition: (x) => ipcRenderer.send("pet:position", x),
  petClick: (x) => ipcRenderer.send("pet:click", x),
  petMenu: () => ipcRenderer.send("pet:menu"),
  setTrayIcon: (dataUrl) => ipcRenderer.send("pet:icon", dataUrl),

  // chat window
  getSetup: () => ipcRenderer.invoke("app:setup"),
  useDemo: () => ipcRenderer.invoke("app:demo"),
  setExpert: (id) => ipcRenderer.send("app:expert", id),
  ask: (payload) => ipcRenderer.send("chat:ask", payload),
  cancel: () => ipcRenderer.send("chat:cancel"),
  reset: (id) => ipcRenderer.send("chat:reset", id),
  closeChat: () => ipcRenderer.send("chat:close"),
  pinChat: (on) => ipcRenderer.send("chat:pin", on),
  holdOpen: (on) => ipcRenderer.send("chat:hold-open", on),
  confirm: (id, ok) => ipcRenderer.send("chat:confirm", { id, ok }),
  openPath: (target) => ipcRenderer.invoke("app:open-path", target),
  showInFolder: (target) => ipcRenderer.send("app:show-in-folder", target),
  openUrl: (url) => ipcRenderer.send("app:open-url", url),
  openKnowledge: () => ipcRenderer.send("app:open-knowledge"),

  on(channel, fn) {
    if (!LISTEN.includes(channel)) return () => {};
    const handler = (_e, data) => fn(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  }
});
