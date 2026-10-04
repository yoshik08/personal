/* auth: google identity services + jwt session */
(function () {
"use strict";
const { api, toast } = window.Play;

const auth = {
  user: null,
  ready: false,

  init() {
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

  renderButton(container) {
    container.innerHTML = "";
    if (!window.GOOGLE_CLIENT_ID) {
      container.innerHTML = '<p class="dim" style="font-size:14px">sign-in not configured yet.</p>';
      return;
    }
    if (!window.google || !google.accounts) {
      container.innerHTML = '<p class="dim" style="font-size:14px">loading sign-in…</p>';
      setTimeout(() => this.renderButton(container), 1000);
      return;
    }
    google.accounts.id.initialize({
      client_id: window.GOOGLE_CLIENT_ID,
      callback: (resp) => this.handleCredential(resp.credential),
    });
    google.accounts.id.renderButton(container, { theme: "filled_black", size: "large", width: 280 });
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
