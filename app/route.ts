import html from '../lib/rlog.html?raw';
export const dynamic = 'force-dynamic';
export async function GET() {
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' } });
}
