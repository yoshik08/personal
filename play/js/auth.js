/* auth: google identity services + jwt session */
(function () {
"use strict";
const { api, toast } = window.Play;

const auth = {
  user: null,
  ready: false,

  init() {
    /* handle oauth redirect callback */
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    if (code) {
      // clean url first
      history.replaceState(null, "", location.pathname + location.hash);
      this.handleCode(code).then(() => {
        location.hash = "#/library";
      });
      return;
    }
    const token = localStorage.getItem("play_token");
    const user = localStorage.getItem("play_user");
    if (token && user) {
      try {
        api.setToken(token);
        this.user = JSON.parse(user);
        /* validate in background; drop session if dead */
        api.get("/api/me").then((d) => {
          this.user = d.user;
          localStorage.setItem("play_user", JSON.stringify(d.user));
          document.dispatchEvent(new CustomEvent("auth", { detail: this.user }));
        }).catch(() => this.logout(true));
      } catch (e) { this.logout(true); }
    }
    this.ready = true;
    document.dispatchEvent(new CustomEvent("auth", { detail: this.user }));
  },

  loginUrl: "#/settings",

  /* redirect-based google sign in (works on ios, no popup) */
  signIn() {
    const cid = window.GOOGLE_CLIENT_ID;
    if (!cid) { toast("sign-in not configured yet"); return; }
    const redirectUri = location.origin + location.pathname;
    const url = "https://accounts.google.com/o/oauth2/v2/auth" +
      "?client_id=" + encodeURIComponent(cid) +
      "&redirect_uri=" + encodeURIComponent(redirectUri) +
      "&response_type=code" +
      "&scope=" + encodeURIComponent("openid email profile") +
      "&access_type=online" +
      "&prompt=select_account";
    location.href = url;
  },

  async handleCode(code) {
    try {
      const redirectUri = location.origin + location.pathname;
      const d = await api.post("/api/auth/google/code", { code, redirectUri });
      api.setToken(d.token);
      this.user = d.user;
      localStorage.setItem("play_token", d.token);
      localStorage.setItem("play_user", JSON.stringify(d.user));
      toast("signed in as " + d.user.name);
      document.dispatchEvent(new CustomEvent("auth", { detail: this.user }));
      this.checkDrive();
    } catch (e) {
      toast("sign-in failed: " + e.message);
    }
  },

  renderButton(container) {
    container.innerHTML = "";
    if (!window.GOOGLE_CLIENT_ID) {
      container.innerHTML = '<p class="dim" style="font-size:14px">sign-in not configured yet.</p>';
      return;
    }
    const btn = document.createElement("button");
    btn.className = "btn";
    btn.style.cssText = "display:flex;align-items:center;gap:10px;padding:12px 20px;font-size:15px";
    btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg> sign in with google';
    btn.onclick = () => this.signIn();
    container.appendChild(btn);
  },

  async handleCredential(credential) {
    try {
      const d = await api.post("/api/auth/google", { credential });
      api.setToken(d.token);
      this.user = d.user;
      localStorage.setItem("play_token", d.token);
      localStorage.setItem("play_user", JSON.stringify(d.user));
      toast("signed in as " + d.user.name);
      document.dispatchEvent(new CustomEvent("auth", { detail: this.user }));
      // check drive status
      this.checkDrive();
    } catch (e) {
      toast("sign-in failed: " + e.message);
    }
  },

  async checkDrive() {
    if (!this.user) return false;
    try {
      const d = await api.get("/api/drive/status");
      this.driveConnected = d.connected;
      document.dispatchEvent(new CustomEvent("drive", { detail: d.connected }));
      return d.connected;
    } catch (e) { return false; }
  },

  connectDrive() {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.accounts || !google.accounts.oauth2) {
        reject(new Error("google auth not loaded"));
        return;
      }
      const client = google.accounts.oauth2.initCodeClient({
        client_id: window.GOOGLE_CLIENT_ID,
        scope: "https://www.googleapis.com/auth/drive.file",
        ux_mode: "popup",
        callback: async (resp) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          try {
            await api.post("/api/auth/google/drive", {
              code: resp.code,
              redirectUri: location.origin,
            });
            this.driveConnected = true;
            document.dispatchEvent(new CustomEvent("drive", { detail: true }));
            toast("google drive connected");
            resolve(true);
          } catch (e) {
            reject(e);
          }
        },
      });
      client.requestCode();
    });
  },

  logout(silent) {
    this.user = null;
    api.setToken(null);
    localStorage.removeItem("play_token");
    localStorage.removeItem("play_user");
    if (!silent) toast("signed out");
    document.dispatchEvent(new CustomEvent("auth", { detail: null }));
  },

  require() {
    if (!this.user) {
      toast("sign in to use your library");
      location.hash = "#/settings";
      return false;
    }
    return true;
  },
};

window.Play.auth = auth;
})();
