import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const apiBase = process.env.DIALSTACK_API_BASE_URL ?? 'https://api.dialstack.ai';
  const secretKey = process.env.DIALSTACK_SECRET_KEY;

  if (!secretKey) {
    return NextResponse.json({ error: 'Missing DIALSTACK_SECRET_KEY' }, { status: 500 });
  }

  const { user } = (await req.json()) as { user?: string };

  const resp = await fetch(`${apiBase}/v1/user_sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify({ user }),
  });

  if (!resp.ok) {
    const body = await resp.text();
    return NextResponse.json({ error: body }, { status: resp.status });
  }

  const body = (await resp.json()) as { client_secret: string };
  return NextResponse.json({
    token: body.client_secret,
    apiBaseUrl: apiBase,
  });
}
