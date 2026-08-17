/**
 * app/turnstile.js — Cloudflare Turnstile invisible-widget wrapper
 * (PRD §7.1/§10-1, UI.md §3.1).
 *
 * Tokens are single-use and expire after 300 s, and both endpoints
 * siteverify independently — so the analysis flow calls getToken() once
 * before /api/validate and again before /api/analyze, never reusing one.
 * expired/timeout callbacks reset the widget; the next getToken() simply
 * executes again (UI.md §3.1 "自动重取").
 *
 * DOM footprint: the caller passes the container element; this module
 * never touches `document` itself (orchestrator stays the only DOM layer).
 */

export class TurnstileManager {
  /**
   * @param {object} args
   * @param {string} args.sitekey public Turnstile sitekey
   * @param {HTMLElement} args.container invisible-widget container
   */
  constructor({ sitekey, container }) {
    this.sitekey = sitekey;
    this.container = container;
    this.widgetId = null;
    this.ready = false;
  }

  /**
   * Render the widget. Must be called after api.js has loaded
   * (`render=explicit&onload=...` in index.html).
   */
  render() {
    if (typeof window.turnstile === "undefined") {
      throw new Error("Turnstile api.js is not loaded");
    }
    if (this.widgetId !== null) return;
    this.widgetId = window.turnstile.render(this.container, {
      sitekey: this.sitekey,
      size: "invisible",
      "expired-callback": () => this._reset(),
      "timeout-callback": () => this._reset(),
      "error-callback": () => this._reset(),
    });
    this.ready = true;
  }

  _reset() {
    if (this.widgetId !== null && typeof window.turnstile !== "undefined") {
      try {
        window.turnstile.reset(this.widgetId);
      } catch {
        /* widget already gone — a fresh render happens on next getToken */
      }
    }
  }

  /**
   * Execute the invisible challenge and resolve with a fresh single-use
   * token. Rejects on challenge failure — the caller maps that to the
   * `error` state (UI.md §3.1: challenge failure is never silent).
   * @returns {Promise<string>}
   */
  getToken() {
    return new Promise((resolve, reject) => {
      if (!this.ready || this.widgetId === null) {
        reject(new Error("Human verification is not ready yet — please wait a moment and try again."));
        return;
      }
      try {
        window.turnstile.execute(this.container, {
          callback: (token) => resolve(token),
          "error-callback": () =>
            reject(new Error("Human verification failed. Please try again.")),
          "expired-callback": () =>
            reject(new Error("Human verification expired. Please try again.")),
          "timeout-callback": () =>
            reject(new Error("Human verification timed out. Please try again.")),
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }
}
