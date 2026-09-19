/** Local-only UI fixture server. No credentials or external model calls. */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, extname, sep } from "node:path";
import { resolveScansion } from "../../core/latin-scansion.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const gold = JSON.parse(readFileSync(new URL("../golden/aeneid-1-quantity.json", import.meta.url))).lines;
const strip = (s) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/[()]/g, "").toLowerCase();
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png" };
const stub = `<script>window.turnstile={render:()=>"fixture",reset(){},execute(_node,options){queueMicrotask(()=>options.callback("fixture"))}};</script>`;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  if (url.pathname.startsWith("/api/")) {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = JSON.parse(body || "{}").text ?? "";
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/api/validate") return res.end(JSON.stringify({ ok: true, input_has_macron: false }));
    const prose = /^Gallia|^Quo usque/i.test(input);
    const restored = input.split("\n").map((line) => gold.find((g) => strip(g.input) === strip(line))?.input.replace(/[()]/g, "") ?? line).join("\n");
    const data = resolveScansion({ language: "la", spelling_corrected: false, correction_reason: null,
      original_text_cleaned: input, scansion_text: restored, meter: prose ? "prose" : "dactylic_hexameter",
      meter_confidence: "high", translation: "A deterministic display fixture.", grammar_notes: "Local fixture for rendering and recitation." });
    return res.end(JSON.stringify(data));
  }
  if (url.pathname === "/sw.js") { res.writeHead(404); return res.end(); } // fixtures must never persist in a service worker
  const path = resolve(root, "." + (url.pathname === "/" ? "/index.html" : url.pathname));
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.writeHead(403); return res.end(); }
  try {
    let data = readFileSync(path);
    if (path.endsWith("index.html")) data = data.toString().replace(/<script src="https:\/\/challenges\.cloudflare\.com[^>]+><\/script>/, stub);
    res.setHeader("Content-Type", mime[extname(path)] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "no-store");
    res.end(data);
  } catch { res.writeHead(404); res.end("Not found"); }
});
server.listen(8789, "127.0.0.1", () => console.log("Fixture server: http://127.0.0.1:8789"));
