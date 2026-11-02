/** Process alive. No dependencies checked (that is /readyz). */
export function GET() {
  return Response.json({ ok: true });
}
