/**
 * Minimal JSON response helper shared by the endpoints.
 * Same-origin only (the same-origin policy): no CORS headers are ever added.
 */
export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders,
    },
  });
}

export async function readJsonBody(request, maxBytes = 32_768) {
  const oversized = { ok: false, status: 413, reason: "Request body is too large." };
  const malformed = { ok: false, status: 400, reason: "Malformed request body." };
  if (Number(request.headers.get("Content-Length")) > maxBytes) return oversized;
  const reader = request.body?.getReader();
  if (!reader) return malformed;
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        return oversized;
      }
      text += decoder.decode(value, { stream: true });
    }
    const body = JSON.parse(text + decoder.decode());
    return body && typeof body === "object" && !Array.isArray(body) ? { ok: true, body } : malformed;
  } catch {
    return malformed;
  } finally {
    reader.releaseLock();
  }
}
