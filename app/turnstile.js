

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

    this.lastErrorCode = null;
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
      "error-callback": (code) => {
        this._recordError(code);
        this._reset();
      },
    });
    this.ready = true;
  }


  _recordError(code) {
    this.lastErrorCode = code ?? null;
    console.warn(`[porphyrii] Turnstile error (code ${code ?? "unknown"})`);
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
   * `error` state (the challenge behavior: challenge failure is never silent).
   * @returns {Promise<string>}
   */
  getToken() {
    return new Promise((resolve, reject) => {
      if (!this.ready || this.widgetId === null) {
        reject(new Error("Human verification is not ready yet — please wait a moment and try again."));
        return;
      }
      try {
        // Force a fresh single-use token: without a reset, execute() can
        // resolve with the cached (already server-consumed) token — see the
        // header note on widget caching.
        this._reset();
        window.turnstile.execute(this.container, {
          callback: (token) => resolve(token),
          "error-callback": (code) => {
            this._recordError(code);
            reject(
              new Error(
                `Human verification failed (code ${code ?? "unknown"}). Please try again — if this keeps happening, please report the code.`
              )
            );
          },
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
