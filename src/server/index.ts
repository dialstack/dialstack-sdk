/**
 * DialStack Server SDK
 *
 * Node.js SDK for server-side DialStack API interactions.
 * Keep your API key secure - never expose it in client-side code.
 *
 * @example
 * ```typescript
 * import { DialStack } from '@dialstack/sdk/server';
 *
 * const dialstack = new DialStack(process.env.DIALSTACK_API_KEY);
 *
 * const session = await dialstack.sessions.create({
 *   platform_id: 'platform_123',
 *   account_id: 'account_456',
 * });
 * ```
 */

const DEFAULT_API_URL = 'https://api.dialstack.ai';

interface DialStackConfig {
  apiUrl?: string;
}

interface SessionCreateParams {
  platform_id: string;
  account_id: string;
}

interface SessionCreateResponse {
  client_secret: string;
  expires_at: string;
}

export class DialStack {
  private _apiKey: string;
  private _apiUrl: string;

  constructor(apiKey: string | undefined, config?: DialStackConfig) {
    this._apiKey = apiKey || '';
    this._apiUrl = config?.apiUrl || DEFAULT_API_URL;
  }

  private async _request(path: string, options: RequestInit = {}): Promise<any> {
    const url = `${this._apiUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this._apiKey}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // Use statusText if we can't parse error
      }
      throw new Error(`DialStack API error: ${errorMessage}`);
    }

    return await response.json();
  }

  sessions = {
    create: async (
      params: SessionCreateParams
    ): Promise<SessionCreateResponse> => {
      return this._request(
        `/api/v1/platforms/${params.platform_id}/accounts/${params.account_id}/sessions`,
        {
          method: 'POST',
        }
      );
    },
  };
}
