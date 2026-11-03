/* auth: google sign-in (redirect flow — works on ios, no popups) → backend jwt */
import { api, bus, toast, store } from "./core.js";

export const auth = {
  user: null,
  /** set when google sent us a drive-mint code (scripts/mint-drive-token.js) */
  mintCode: null,

  async init() {
    const q = new URLSearchParams(location.search);
    const code = q.get("code"), state = q.get("state") || "", err = q.get("error");
    if (code || err) history.replaceState(null, "", location.pathname + (location.hash || "#/"));

    if (code && state === "drive-mint") {
      // this code belongs to the terminal script, not to a sign-in: show it, never spend it
      this.mintCode = code;
    } else if (err) {
      if (err !== "access_denied") toast("Google sign-in failed: " + err, { kind: "error" });
    } else if (code) {
      let expected = null;
      try { expected = sessionStorage.getItem("play_oauth_state"); sessionStorage.removeItem("play_oauth_state"); } catch (e) {}
      if (expected && state !== expected) {
        toast("Sign-in link expired — try again", { kind: "error" });
      } else {
        await this.exchange(code);
      }
    }

    if (!this.user) {
      const token = store.get("play_token"), user = store.get("play_user");
      if (token && user) {
        api.token = token;
        this.user = user;
        // validate quietly; a dead session signs out
        api.get("/api/me").then((d) => {
          this.user = d.user;
          store.set("play_user", d.user);
          bus.emit("auth", this.user);
        }).catch((e) => { if (e.status === 401) this.logout(true); });
      }
    }
    bus.on("auth:expired", () => {
      if (!this.user) return;
      this.logout(true);
      toast("Your session expired — sign in again", { kind: "error" });
    });
  },

  redirectUri() { return location.origin + location.pathname; },

  signIn() {
    const cid = window.GOOGLE_CLIENT_ID;
    if (!cid) return toast("Sign-in isn't configured", { kind: "error" });
    const state = "login-" + Math.random().toString(36).slice(2, 12);
    try { sessionStorage.setItem("play_oauth_state", state); } catch (e) {}
    location.href = "https://accounts.google.com/o/oauth2/v2/auth" +
      "?client_id=" + encodeURIComponent(cid) +
      "&redirect_uri=" + encodeURIComponent(this.redirectUri()) +
      "&response_type=code" +
      "&scope=" + encodeURIComponent("openid email profile") +
      "&access_type=online&prompt=select_account" +
      "&state=" + encodeURIComponent(state);
  },

  async exchange(code) {
    try {
      const d = await api.post("/api/auth/google/code", { code, redirectUri: this.redirectUri() });
      api.token = d.token;
      this.user = d.user;
      store.set("play_token", d.token);
      store.set("play_user", d.user);
      toast("Signed in as " + (d.user.name || d.user.email), { kind: "ok" });
    } catch (e) {
      toast("Sign-in failed: " + e.message, { kind: "error" });
    }
  },

  logout(silent) {
    this.user = null;
    api.token = null;
    store.del("play_token");
    store.del("play_user");
    if (!silent) toast("Signed out");
    bus.emit("auth", null);
  },
};
