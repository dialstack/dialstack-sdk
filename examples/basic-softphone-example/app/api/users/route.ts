import { NextResponse } from 'next/server';

// Lists the account's users so the demo can offer a "connect as" picker. A real
// product would authenticate its own end-user and mint a session for exactly
// that person — it would never expose the whole account's user list. This exists
// only so the example is usable without hardcoding a user id.
export async function GET() {
  const apiBase = process.env.DIALSTACK_API_BASE_URL ?? 'https://api.dialstack.ai';
  const secretKey = process.env.DIALSTACK_SECRET_KEY;

  if (!secretKey) {
    return NextResponse.json({ error: 'Missing DIALSTACK_SECRET_KEY' }, { status: 500 });
  }

  const resp = await fetch(`${apiBase}/v1/users`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });

  if (!resp.ok) {
    const body = await resp.text();
    return NextResponse.json({ error: body }, { status: resp.status });
  }

  const body = (await resp.json()) as {
    data: { id: string; name?: string | null; email?: string | null }[];
  };
  // Pass through only display-safe fields; the secret key never leaves the server.
  // First page only — enough for a demo picker; a real UI would follow
  // next_page_url to page through larger accounts.
  const users = body.data.map((u) => ({ id: u.id, name: u.name, email: u.email }));
  return NextResponse.json({ users });
}
