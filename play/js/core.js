/* core: utils, api client, analytics, toast, modal */
(function () {
"use strict";

const API = () => window.PLAY_API || "";

const utils = {
  el(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstChild;
  },
  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  },
  debounce(fn, ms) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  },
  greet() {
    const h = new Date().getHours();
    return h < 12 ? "good morning" : h < 17 ? "good afternoon" : "good evening";
  },
  motionOK() {
    if (document.documentElement.dataset.motion === "off") return false;
    return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  },
};

const api = {
  token: null,
  setToken(t) { this.token = t; },
  async call(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (this.token) headers.Authorization = "Bearer " + this.token;
    if (opts.body && typeof opts.body === "object") {
      headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(opts.body);
    }
    let r;
    try {
      r = await fetch(API() + path, { ...opts, headers });
    } catch (e) {
      throw new Error("network error — is the api reachable?");
    }
    let data = null;
    try { data = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((data && data.error) || ("request failed: " + r.status));
    return data;
  },
  get(p) { return this.call(p); },
  post(p, body) { return this.call(p, { method: "POST", body }); },
  put(p, body) { return this.call(p, { method: "PUT", body }); },
  patch(p, body) { return this.call(p, { method: "PATCH", body }); },
  del(p) { return this.call(p, { method: "DELETE" }); },
  /* raw fetch for blobs with progress callback (sends the jwt) */
  async fetchBlob(path, onProgress) {
    const headers = {};
    if (this.token) headers.Authorization = "Bearer " + this.token;
    const r = await fetch(API() + path, { headers });
    if (!r.ok) throw new Error("download failed: " + r.status);
    const total = parseInt(r.headers.get("Content-Length") || "0", 10);
    const reader = r.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      if (onProgress) onProgress(got, total);
    }
    return new Blob(chunks, { type: "audio/mpeg" });
  },
};

/* privacy-conscious analytics: local-only event log, no third party */
const analytics = {
  KEY: "play_analytics",
  track(event, props) {
    try {
      const log = JSON.parse(localStorage.getItem(this.KEY) || "[]");
      log.push({ event, props: props || {}, at: new Date().toISOString() });
      localStorage.setItem(this.KEY, JSON.stringify(log.slice(-500)));
    } catch (e) {}
  },
  get() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || "[]"); } catch (e) { return []; }
  },
  clear() { localStorage.removeItem(this.KEY); },
};

let toastT = null;
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 2600);
}

function modal(html) {
  const root = document.getElementById("modal-root");
  root.innerHTML = "";
  const bg = utils.el('<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true">' + html + "</div></div>");
  bg.addEventListener("click", (e) => { if (e.target === bg) closeModal(); });
  root.appendChild(bg);
  const input = bg.querySelector("input");
  if (input) input.focus();
  return bg;
}
function closeModal() { document.getElementById("modal-root").innerHTML = ""; }
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

function confirmModal(title, body, okLabel, onOk) {
  const bg = modal(`<h3>${utils.esc(title)}</h3><p class="dim" style="margin-bottom:18px;font-size:14px">${utils.esc(body)}</p>
    <div class="row"><button class="btn ghost" data-x>cancel</button><button class="btn danger" data-ok>${utils.esc(okLabel)}</button></div>`);
  bg.querySelector("[data-x]").onclick = closeModal;
  bg.querySelector("[data-ok]").onclick = () => { closeModal(); onOk(); };
}

window.Play = { utils, api, analytics, toast, modal, closeModal, confirmModal };
})();
