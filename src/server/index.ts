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
 * // Create an account
 * const account = await dialstack.accounts.create({ email: 'test@example.com' });
 *
 * // Create a session for embedded components
 * const session = await dialstack.accountSessions.create({
 *   account: account.id,
 * });
 * ```
 */

const DEFAULT_API_URL = 'https://api.dialstack.ai';

interface DialStackConfig {
  apiUrl?: string;
}

interface AccountCreateParams {
  email?: string;
}

interface AccountUpdateParams {
  email?: string;
}

interface Account {
  id: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

interface AccountListResponse {
  accounts: Account[];
  count: number;
}

interface AccountSessionCreateParams {
  account: string;
}

interface AccountSessionCreateResponse {
  client_secret: string;
  expires_at: string;
}

interface UserCreateParams {
  name?: string;
  email?: string;
}

interface UserUpdateParams {
  name?: string;
  email?: string;
}

interface User {
  id: string;
  account_id: string;
  name: string | null;
  email: string | null;
  created_at: string;
  updated_at: string;
}

interface UserListResponse {
  users: User[];
  count: number;
}

export class DialStack {
  private _apiKey: string;
  private _apiUrl: string;

  constructor(apiKey: string | undefined, config?: DialStackConfig) {
    this._apiKey = apiKey || '';
    this._apiUrl = config?.apiUrl || DEFAULT_API_URL;
  }

  private async _request(
    path: string,
    options: RequestInit = {},
    accountId?: string
  ): Promise<any> {
    const url = `${this._apiUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this._apiKey}`,
    };

    if (accountId) {
      headers['DialStack-Account'] = accountId;
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
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

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined;
    }

    return await response.json();
  }

  accounts = {
    create: async (params?: AccountCreateParams): Promise<Account> => {
      return this._request('/v1/accounts', {
        method: 'POST',
        body: JSON.stringify({ email: params?.email }),
      });
    },

    retrieve: async (accountId: string): Promise<Account> => {
      return this._request(`/v1/accounts/${accountId}`, {
        method: 'GET',
      });
    },

    update: async (
      accountId: string,
      params: AccountUpdateParams
    ): Promise<Account> => {
      return this._request(`/v1/accounts/${accountId}`, {
        method: 'PUT',
        body: JSON.stringify(params),
      });
    },

    del: async (accountId: string): Promise<void> => {
      return this._request(`/v1/accounts/${accountId}`, {
        method: 'DELETE',
      });
    },

    list: async (): Promise<AccountListResponse> => {
      return this._request('/v1/accounts', {
        method: 'GET',
      });
    },
  };

  users = {
    create: async (
      accountId: string,
      params?: UserCreateParams
    ): Promise<User> => {
      return this._request(
        '/v1/users',
        {
          method: 'POST',
          body: JSON.stringify(params || {}),
        },
        accountId
      );
    },

    retrieve: async (accountId: string, userId: string): Promise<User> => {
      return this._request(`/v1/users/${userId}`, { method: 'GET' }, accountId);
    },

    update: async (
      accountId: string,
      userId: string,
      params: UserUpdateParams
    ): Promise<User> => {
      return this._request(
        `/v1/users/${userId}`,
        {
          method: 'PUT',
          body: JSON.stringify(params),
        },
        accountId
      );
    },

    del: async (accountId: string, userId: string): Promise<void> => {
      return this._request(
        `/v1/users/${userId}`,
        { method: 'DELETE' },
        accountId
      );
    },

    list: async (accountId: string): Promise<UserListResponse> => {
      return this._request('/v1/users', { method: 'GET' }, accountId);
    },
  };

  accountSessions = {
    create: async (
      params: AccountSessionCreateParams
    ): Promise<AccountSessionCreateResponse> => {
      return this._request('/v1/account_sessions', {
        method: 'POST',
        body: JSON.stringify({ account: params.account }),
      });
    },
  };

  /**
   * @deprecated Use `accountSessions` instead
   */
  sessions = this.accountSessions;
}
