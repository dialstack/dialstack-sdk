import { NextResponse } from 'next/server';

export async function POST() {
  const apiBase = process.env.DIALSTACK_API_BASE_URL;
  const secretKey = process.env.DIALSTACK_SECRET_KEY;
  const userId = process.env.DIALSTACK_USER_ID;

  if (!apiBase || !secretKey || !userId) {
    return NextResponse.json(
      { error: 'Missing DIALSTACK_API_BASE_URL / DIALSTACK_SECRET_KEY / DIALSTACK_USER_ID' },
      { status: 500 },
    );
  }

  const resp = await fetch(`${apiBase}/v1/user_sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify({ user: userId }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    return NextResponse.json({ error: body }, { status: resp.status });
  }

  const body = (await resp.json()) as { client_secret: string; expires_at: string };
  return NextResponse.json({
    token: body.client_secret,
    expiresAt: body.expires_at,
    apiBaseUrl: apiBase,
  });
}
