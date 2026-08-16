/**
 * Minimal JSON response helper shared by the endpoints.
 * Same-origin only (PRD §10-4): no CORS headers are ever added.
 */
export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}
