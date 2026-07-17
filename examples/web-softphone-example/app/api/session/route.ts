import { NextResponse } from 'next/server';
import { DialStack } from '@dialstack/sdk/server';

// Mint a short-lived WebRTC user session on the server, so the sk_live_ key
// never reaches the browser. This mirrors how a real app would mint the token
// (see spineline's webrtc-session route); the browser only ever sees the
// resulting client_secret.
//
// The user is pinned to DIALSTACK_USER_ID from the environment — there is no
// `user` in the request body, so this endpoint can only ever mint a session for
// the one user it is configured for.
export async function POST() {
  const apiBase = process.env.DIALSTACK_API_BASE_URL ?? 'https://api.dialstack.ai';
  const secretKey = process.env.DIALSTACK_SECRET_KEY;
  const userId = process.env.DIALSTACK_USER_ID;

  if (!secretKey || !userId) {
    return NextResponse.json(
      { error: 'Missing DIALSTACK_SECRET_KEY / DIALSTACK_USER_ID' },
      { status: 500 },
    );
  }

  try {
    const dialstack = new DialStack(secretKey, { apiUrl: apiBase });
    const session = await dialstack.userSessions.create({ user: userId });
    return NextResponse.json({
      token: session.client_secret,
      expiresAt: session.expires_at,
      apiBaseUrl: apiBase,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
