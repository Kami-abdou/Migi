/*
  Migi's map of the computer: file, folder and app names, built in the
  background and refreshed every 15 minutes. Only names and paths are indexed;
  nothing is read from inside files.

  Searched: your home folder (Desktop, Documents, Downloads, OneDrive…), other
  drives, and installed apps (Start Menu on Windows, /Applications on Mac).
  Skipped: system folders, hidden folders, app data, node_modules and the like.
*/
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

const fsp = fs.promises;
const MAX_ENTRIES = 400000;
const STALE_MS = 15 * 60 * 1000;

const SKIP_DIRS = new Set(
  [
    "node_modules", "appdata", "application data", "local settings", "$recycle.bin", "system volume information",
    "windows", "program files", "program files (x86)", "programdata", "recovery", "perflogs", "msocache",
    "library", "venv", ".venv", "env", "__pycache__", "site-packages", "dist-packages", "bower_components",
    "temp", "tmp", "cache", "caches", "cookies", "recent", "nethood", "printhood", "sendto", "templates",
    "start menu", "my documents", "my music", "my pictures", "my videos", "intelhaxm", "windows.old",
    "target", "obj", "pods", "deriveddata", ".git", "users"
  ]
);
// opening these runs a program, so the chat warns before it happens
const PROGRAM_EXT = new Set([
  ".exe", ".bat", ".cmd", ".com", ".ps1", ".psm1", ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh",
  ".msi", ".msp", ".scr", ".hta", ".cpl", ".jar", ".reg", ".pif", ".sh", ".command"
]);
const APP_EXT = new Set([".lnk", ".url", ".appref-ms"]);

const APPS_FOLDER = "shell:AppsFolder\\";
const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// Windows also has Store apps (Calculator, Notepad\u2026) with no shortcut file; ask Windows for them.
function windowsStartApps() {
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", "Get-StartApps | ConvertTo-Json -Compress"],
      { windowsHide: true, timeout: 20000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err) return resolve([]);
        try {
          const list = JSON.parse(stdout);
          resolve((Array.isArray(list) ? list : [list]).filter((a) => a && a.Name && a.AppID));
        } catch {
          resolve([]);
        }
      }
    );
  });
}

function createFinder(places) {
  let dirs = []; // folder paths, shared by their entries
  let dirsLower = [];
  let entries = []; // { name, lower, dir, kind, depth }
  let builtAt = 0;
  let building = null;
  let launchable = new Map(); // shell:AppsFolder target → app name, only ones Migi found itself

  function roots() {
    const out = [{ dir: places.home, depth: 8 }];
    if (process.platform === "win32") {
      for (let c = 67; c <= 90; c++) {
        const drive = String.fromCharCode(c) + ":\\";
        if (!fs.existsSync(drive)) continue;
        // C:\ itself: only its own folders (home is covered above, system folders are skipped)
        out.push({ dir: drive, depth: drive === "C:\\" ? 4 : 6 });
      }
    } else if (process.platform === "darwin" && fs.existsSync("/Volumes")) {
      out.push({ dir: "/Volumes", depth: 4 });
    }
    return out;
  }

  function appDirs() {
    if (process.platform === "win32") {
      return [
        path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
        path.join(process.env.APPDATA || path.join(places.home, "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs")
      ];
    }
    if (process.platform === "darwin") return ["/Applications", "/System/Applications", path.join(places.home, "Applications")];
    return ["/usr/share/applications", path.join(places.home, ".local", "share", "applications")];
  }

  async function walk(root, maxDepth, add, isAppDir) {
    const queue = [{ dir: root, depth: 0 }];
    let n = 0;
    while (queue.length && entries.length + add.count < MAX_ENTRIES) {
      const { dir, depth } = queue.shift();
      let handle;
      try { handle = await fsp.opendir(dir); } catch { continue; }
      const di = add.dir(dir);
      try {
        for await (const d of handle) {
          const name = d.name;
          if (name.startsWith(".") || name.startsWith("$") || name.startsWith("~$")) continue;
          if (d.isSymbolicLink()) continue;
          if (d.isDirectory()) {
            if (isAppDir && process.platform === "darwin" && name.endsWith(".app")) { add.entry(name.slice(0, -4), di, "app", depth); continue; }
            if (SKIP_DIRS.has(name.toLowerCase())) continue;
            if (!isAppDir) add.entry(name, di, "folder", depth);
            if (depth + 1 < maxDepth) queue.push({ dir: path.join(dir, name), depth: depth + 1 });
          } else if (d.isFile()) {
            const ext = path.extname(name).toLowerCase();
            if (isAppDir) {
              if (APP_EXT.has(ext) || ext === ".desktop") add.entry(name, di, "app", depth);
            } else {
              add.entry(name, di, "file", depth);
            }
          }
          if (++n % 3000 === 0) await new Promise((r) => setImmediate(r)); // stay responsive
        }
      } catch { /* folder vanished or no permission */ }
    }
  }

  async function build() {
    const nextDirs = [], nextDirsLower = [], next = [];
    const seenDirs = new Map();
    const seenApps = new Set();
    const add = {
      get count() { return next.length; },
      dir(p) {
        if (seenDirs.has(p)) return seenDirs.get(p);
        seenDirs.set(p, nextDirs.length);
        nextDirs.push(p);
        nextDirsLower.push(norm(p));
        return nextDirs.length - 1;
      },
      entry(name, dir, kind, depth) {
        if (kind === "app") {
          const label = name.replace(/\.(lnk|url|appref-ms|desktop)$/i, "");
          if (seenApps.has(label.toLowerCase())) return;
          seenApps.add(label.toLowerCase());
          next.push({ name, label, lower: norm(label), dir, kind, depth: 0 });
          return;
        }
        next.push({ name, label: name, lower: norm(name), dir, kind, depth });
      }
    };
    for (const d of appDirs()) await walk(d, 5, add, true);
    const nextLaunchable = new Map();
    if (process.platform === "win32") {
      const shellDir = add.dir(APPS_FOLDER.slice(0, -1));
      for (const a of await windowsStartApps()) {
        if (seenApps.has(a.Name.toLowerCase())) continue;
        seenApps.add(a.Name.toLowerCase());
        next.push({ name: a.AppID, label: a.Name, lower: norm(a.Name), dir: shellDir, kind: "app", depth: 0, appId: true });
        nextLaunchable.set(APPS_FOLDER + a.AppID, a.Name);
      }
    }
    for (const r of roots()) await walk(r.dir, r.depth, add, false);
    dirs = nextDirs;
    dirsLower = nextDirsLower;
    entries = next;
    launchable = nextLaunchable;
    builtAt = Date.now();
  }

  function refresh() {
    if (building) return building;
    building = build()
      .catch((e) => console.error("[migi] index failed", e))
      .finally(() => { building = null; });
    return building;
  }

  const fullPath = (e) => (e.appId ? APPS_FOLDER + e.name : path.join(dirs[e.dir], e.name));

  function describe(e) {
    const p = fullPath(e);
    const ext = e.appId ? "" : path.extname(e.name).toLowerCase();
    let modified = null;
    if (!e.appId) { try { modified = fs.statSync(p).mtime.toISOString().slice(0, 10); } catch { /* gone */ } }
    return {
      name: e.label,
      path: p,
      kind: e.kind,
      program: e.kind === "file" && PROGRAM_EXT.has(ext),
      modified
    };
  }

  async function search(query, kind, limit) {
    if (!builtAt) await refresh();
    else if (Date.now() - builtAt > STALE_MS) refresh();
    const tokens = norm(String(query || "")).split(/[\s_\-.]+/).filter(Boolean);
    if (!tokens.length) return [];
    const whole = tokens.join(" ");
    const matches = [];
    for (const e of entries) {
      if (kind && kind !== "any" && e.kind !== kind) continue;
      let score = 0;
      let ok = true;
      for (const t of tokens) {
        if (e.lower.includes(t)) score += e.lower.startsWith(t) ? 30 : 20;
        else if (dirsLower[e.dir].includes(t)) score += 4;
        else { ok = false; break; }
      }
      if (!ok) continue;
      const bare = e.lower.replace(/\.[a-z0-9]+$/, "");
      if (bare === whole || e.lower === whole) score += 100;
      if (e.kind === "app") score += 25;
      if (e.kind === "folder") score += 5;
      score -= e.depth * 1.5 + e.lower.length * 0.05;
      matches.push({ e, score });
      if (matches.length > 20000) break;
    }
    matches.sort((a, b) => b.score - a.score);
    return matches.slice(0, Math.min(Math.max(limit || 8, 1), 20)).map((m) => describe(m.e));
  }

  async function list(where, sort) {
    const target = places.named[String(where || "").toLowerCase()] || where;
    if (!target || !path.isAbsolute(target)) throw new Error("Give a full folder path, or one of: " + Object.keys(places.named).join(", "));
    const items = [];
    for (const d of await fsp.readdir(target, { withFileTypes: true })) {
      if (d.name.startsWith(".") || d.name.startsWith("$") || d.name === "desktop.ini") continue;
      const p = path.join(target, d.name);
      let modified = 0;
      try { modified = fs.statSync(p).mtimeMs; } catch { /* skip */ }
      const ext = path.extname(d.name).toLowerCase();
      items.push({ name: d.name, path: p, kind: d.isDirectory() ? "folder" : "file", program: !d.isDirectory() && PROGRAM_EXT.has(ext), modified });
    }
    if (sort === "recent") items.sort((a, b) => b.modified - a.modified);
    else items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "folder" ? -1 : 1));
    return {
      folder: target,
      total: items.length,
      items: items.slice(0, 60).map((i) => ({ ...i, modified: i.modified ? new Date(i.modified).toISOString().slice(0, 10) : null }))
    };
  }

  function isProgram(p) {
    return PROGRAM_EXT.has(path.extname(p).toLowerCase());
  }

  // Is this something Migi may open? A path that exists, or a Windows app it found itself.
  function canOpen(target) {
    if (typeof target !== "string" || !target) return false;
    if (target.startsWith(APPS_FOLDER)) return launchable.has(target);
    return path.isAbsolute(target) && fs.existsSync(target);
  }

  function appName(target) {
    return launchable.get(target) || null;
  }

  return {
    refresh,
    search,
    list,
    isProgram,
    canOpen,
    appName,
    APPS_FOLDER,
    get status() { return { entries: entries.length, builtAt, building: Boolean(building) }; }
  };
}

module.exports = { createFinder };
