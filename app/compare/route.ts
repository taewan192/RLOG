import { GET as renderPage } from '../route';
export const dynamic = 'force-dynamic';
export async function GET() { return renderPage(); }
