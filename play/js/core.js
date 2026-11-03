/* core: dom helpers, formatting, event bus, api client, toasts, sheets, menus, motion */
import { icon } from "./icons.js";

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const hrs = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (hrs ? hrs + ":" + String(m).padStart(2, "0") : m) + ":" + String(s).padStart(2, "0");
}
export function fmtTotal(sec) {
  const m = Math.round((sec || 0) / 60);
  if (m < 60) return m + " min";
  return Math.floor(m / 60) + " hr" + (m % 60 ? " " + (m % 60) + " min" : "");
}
export const plural = (n, one, many) => n + " " + (n === 1 ? one : (many || one + "s"));
export function fmtBytes(b) {
  if (b < 1048576) return Math.max(1, Math.round(b / 1024)) + " KB";
  return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + " MB";
}

/* ---------- event bus ---------- */
const listeners = {};
export const bus = {
  on(evt, fn) {
    (listeners[evt] = listeners[evt] || new Set()).add(fn);
    return () => listeners[evt].delete(fn);
  },
  emit(evt, data) {
    (listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(evt, e); } });
  },
};

/* ---------- motion ---------- */
const root = document.documentElement;
const reduceMQ = matchMedia("(prefers-reduced-motion: reduce)");
export function motionOK() {
  const m = root.dataset.motion || "auto";
  if (m === "off") return false;
  if (m === "on") return true;
  return !reduceMQ.matches;
}
/** anime.js when motion is allowed and the library loaded, else null */
export const A = () => (motionOK() && window.anime ? window.anime : null);
export const spring = (bounce = 0.18, duration = 520) => window.anime.spring({ bounce, duration });

/** fade/rise children in. cheap no-op without motion. */
export function enter(els, { y = 10, delay = 0, step = 22, max = 18 } = {}) {
  const a = A();
  const list = (Array.isArray(els) ? els : [...els]).slice(0, max);
  if (!a || !list.length) return;
  list.forEach((e) => { e.style.opacity = "0"; });
  a.animate(list, {
    opacity: [0, 1],
    translateY: [y, 0],
    duration: 520,
    delay: a.stagger(step, { start: delay }),
    ease: "outExpo",
  });
}

/* ---------- api ---------- */
let inflight = 0, slowTimer = 0, slow = false;
function netStart() {
  inflight++;
  if (!slowTimer && !slow) slowTimer = setTimeout(() => { slow = true; bus.emit("net:slow", true); }, 2600);
}
function netEnd() {
  inflight = Math.max(0, inflight - 1);
  if (!inflight) {
    clearTimeout(slowTimer); slowTimer = 0;
    if (slow) { slow = false; bus.emit("net:slow", false); }
  }
}

export const api = {
  token: null,
  base: () => window.PLAY_API || "",
  url(path) { return this.base() + path; },
  async call(path, { method = "GET", body, timeout = 60000, headers = {} } = {}) {
    headers = { ...headers };
    if (this.token) headers.Authorization = "Bearer " + this.token;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeout);
    netStart();
    let r;
    try {
      r = await fetch(this.url(path), {
        method, headers, signal: ctrl.signal,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new Error(e.name === "AbortError" ? "the server took too long to answer" : "can't reach the server");
    } finally {
      clearTimeout(timer);
      netEnd();
    }
    let data = null;
    try { data = await r.json(); } catch (e) {}
    if (r.status === 401 && this.token) bus.emit("auth:expired");
    if (!r.ok) throw Object.assign(new Error((data && data.error) || "request failed (" + r.status + ")"), { status: r.status });
    return data;
  },
  get(p, o) { return this.call(p, o); },
  post(p, body = {}) { return this.call(p, { method: "POST", body }); },
  put(p, body) { return this.call(p, { method: "PUT", body }); },
  patch(p, body) { return this.call(p, { method: "PATCH", body }); },
  del(p) { return this.call(p, { method: "DELETE" }); },
  /** multipart upload with progress (xhr: fetch has no upload progress) */
  upload(path, form, onProgress) {
    return new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open("POST", this.url(path));
      if (this.token) x.setRequestHeader("Authorization", "Bearer " + this.token);
      x.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      x.onload = () => {
        let d = null;
        try { d = JSON.parse(x.responseText); } catch (e) {}
        if (x.status >= 200 && x.status < 300) resolve(d);
        else {
          if (x.status === 401) bus.emit("auth:expired");
          reject(new Error((d && d.error) || "upload failed (" + x.status + ")"));
        }
      };
      x.onerror = () => reject(new Error("upload interrupted — check your connection"));
      x.send(form);
    });
  },
  /** whole-file download as a blob (for the offline cache) */
  async blob(path, type) {
    const r = await fetch(this.url(path), { headers: this.token ? { Authorization: "Bearer " + this.token } : {} });
    if (!r.ok) throw new Error("download failed (" + r.status + ")");
    const b = await r.blob();
    return type && b.type !== type ? new Blob([b], { type }) : b;
  },
};

/* ---------- toasts ---------- */
export function toast(msg, { kind = "", ms = 2800, action } = {}) {
  const host = $("#toasts");
  if (!host) return;
  const ic = kind === "error" ? icon("warning-circle", true) : kind === "ok" ? icon("check") : "";
  const el = h(`<div class="toast ${kind}" role="status">${ic}<span>${esc(msg)}</span>${action ? `<button class="toast-act">${esc(action.label)}</button>` : ""}</div>`);
  if (action) el.querySelector("button").onclick = () => { action.fn(); dismiss(); };
  host.appendChild(el);
  while (host.children.length > 3) host.firstElementChild.remove();
  const a = A();
  if (a) a.animate(el, { opacity: [0, 1], translateY: [14, 0], scale: [0.96, 1], duration: 420, ease: spring(0.25, 420) });
  let gone = false;
  function dismiss() {
    if (gone) return; gone = true;
    const a2 = A();
    if (!a2) return el.remove();
    a2.animate(el, { opacity: 0, translateY: 8, duration: 220, ease: "inQuad", onComplete: () => el.remove() });
  }
  setTimeout(dismiss, kind === "error" ? Math.max(ms, 4800) : ms);
  return dismiss;
}

/* ---------- sheets (dialog on desktop, bottom sheet on phones) ---------- */
const isPhone = () => matchMedia("(max-width: 900px)").matches;
let openSheets = [];
export function sheet(html, { cls = "", onClose } = {}) {
  const layer = $("#layer");
  const bg = h(`<div class="sheet-bg"><div class="sheet ${cls}" role="dialog" aria-modal="true">
    <div class="sheet-grab" aria-hidden="true"></div>${html}</div></div>`);
  const panel = bg.firstElementChild;
  const prevFocus = document.activeElement;
  layer.appendChild(bg);
  const a = A();
  if (a) {
    a.animate(bg, { opacity: [0, 1], duration: 220, ease: "outQuad" });
    if (isPhone()) a.animate(panel, { translateY: ["100%", "0%"], duration: 560, ease: spring(0.12, 560) });
    else a.animate(panel, { opacity: [0, 1], scale: [0.94, 1], translateY: [12, 0], duration: 480, ease: spring(0.22, 480) });
  }
  let closed = false;
  const api_ = {
    el: panel,
    close(result) {
      if (closed) return; closed = true;
      openSheets = openSheets.filter((s) => s !== api_);
      const a2 = A();
      const done = () => { bg.remove(); if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); };
      if (onClose) onClose(result);
      if (!a2) return done();
      a2.animate(bg, { opacity: 0, duration: 200, ease: "inQuad", onComplete: done });
      a2.animate(panel, isPhone() ? { translateY: "100%", duration: 240, ease: "inQuad" } : { scale: 0.97, opacity: 0, duration: 180, ease: "inQuad" });
    },
  };
  bg.addEventListener("pointerdown", (e) => { if (e.target === bg) api_.close(null); });
  panel.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => api_.close(null)));
  openSheets.push(api_);
  requestAnimationFrame(() => {
    const f = panel.querySelector("[autofocus], input, textarea") || panel.querySelector("button:not([data-close])");
    if (f && !isPhone()) f.focus({ preventScroll: true });
  });
  return api_;
}
export function closeTopSheet() {
  const s = openSheets[openSheets.length - 1];
  if (s) { s.close(null); return true; }
  return false;
}

export function confirmSheet(title, body, okLabel = "Confirm", danger = false) {
  return new Promise((resolve) => {
    const s = sheet(`<h3 class="sheet-title">${esc(title)}</h3><p class="sheet-text">${esc(body)}</p>
      <div class="sheet-actions"><button class="btn ghost" data-close>Cancel</button>
      <button class="btn ${danger ? "danger" : "primary"}" data-ok>${esc(okLabel)}</button></div>`,
      { cls: "narrow", onClose: (r) => resolve(!!r) });
    s.el.querySelector("[data-ok]").onclick = () => s.close(true);
  });
}

/** fields: [{name, label, value, placeholder, maxlength}] → values or null */
export function formSheet(title, fields, okLabel = "Save") {
  return new Promise((resolve) => {
    const s = sheet(`<form class="form"><h3 class="sheet-title">${esc(title)}</h3>
      ${fields.map((f) => `<label class="field"><span>${esc(f.label)}</span>
        <input name="${esc(f.name)}" value="${esc(f.value || "")}" placeholder="${esc(f.placeholder || "")}"
          maxlength="${f.maxlength || 200}" autocomplete="off" spellcheck="false"></label>`).join("")}
      <div class="sheet-actions"><button type="button" class="btn ghost" data-close>Cancel</button>
      <button class="btn primary">${esc(okLabel)}</button></div></form>`,
      { cls: "narrow", onClose: (r) => resolve(r || null) });
    s.el.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const out = {};
      fields.forEach((f) => { out[f.name] = s.el.querySelector(`[name="${f.name}"]`).value.trim(); });
      s.close(out);
    };
  });
}

/* ---------- menus (popover on desktop, action sheet on phones) ----------
   items: [{label, icon, danger, fn}] or "-" for a divider */
let openMenu = null;
export function menu(anchor, items, title = "") {
  closeMenu();
  if (isPhone()) {
    const s = sheet(`${title ? `<div class="menu-head">${title}</div>` : ""}<div class="menu menu-sheet">${menuItems(items)}</div>`);
    bindMenu(s.el, items, () => s.close());
    return;
  }
  const el = h(`<div class="menu menu-pop" role="menu">${menuItems(items)}</div>`);
  document.body.appendChild(el);
  const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
  const w = el.offsetWidth, hgt = el.offsetHeight;
  let x = r.right - w, y = r.bottom + 6;
  if (x < 8) x = r.left;
  if (y + hgt > innerHeight - 8) y = Math.max(8, r.top - hgt - 6);
  el.style.left = clamp(x, 8, innerWidth - w - 8) + "px";
  el.style.top = y + "px";
  el.style.transformOrigin = (y < r.top ? "bottom " : "top ") + (x + w / 2 < r.left ? "left" : "right");
  const a = A();
  if (a) a.animate(el, { opacity: [0, 1], scale: [0.92, 1], duration: 300, ease: spring(0.2, 300) });
  bindMenu(el, items, closeMenu);
  openMenu = el;
  setTimeout(() => {
    document.addEventListener("pointerdown", outside, true);
    el.querySelector("button")?.focus({ preventScroll: true });
  });
  function outside(e) { if (!el.contains(e.target)) { closeMenu(); } }
  el._outside = outside;
}
export function closeMenu() {
  if (!openMenu) return false;
  document.removeEventListener("pointerdown", openMenu._outside, true);
  openMenu.remove();
  openMenu = null;
  return true;
}
function menuItems(items) {
  return items.map((it, i) => it === "-" ? `<div class="menu-sep"></div>`
    : `<button class="menu-item${it.danger ? " danger" : ""}" data-i="${i}" role="menuitem">
        ${it.icon ? icon(it.icon) : ""}<span>${esc(it.label)}</span></button>`).join("");
}
function bindMenu(el, items, close) {
  el.querySelectorAll("[data-i]").forEach((b) => b.addEventListener("click", () => {
    close();
    const it = items[+b.dataset.i];
    if (it && it.fn) it.fn();
  }));
  el.addEventListener("keydown", (e) => {
    const btns = [...el.querySelectorAll("button")];
    const i = btns.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    if (e.key === "ArrowUp") { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
  });
}

/* ---------- local storage, never throwing ---------- */
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} },
};
