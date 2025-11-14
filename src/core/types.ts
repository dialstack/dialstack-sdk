/**
 * Core type definitions for the DialStack SDK
 */

export interface DialStackOptions {
  /**
   * Your DialStack publishable API key (starts with pk_live_)
   */
  publishableKey: string;

  /**
   * Optional configuration for API endpoint
   */
  apiUrl?: string;
}

export interface DialStackInstance {
  /**
   * The publishable key used to initialize the SDK
   */
  publishableKey: string;

  /**
   * API endpoint URL
   */
  apiUrl: string;
}

export interface SessionOptions {
  /**
   * Account ID for the session
   */
  accountId: string;

  /**
   * Platform ID for the session
   */
  platformId: string;
}

export interface Session {
  /**
   * Client secret token (starts with sess_)
   */
  clientSecret: string;

  /**
   * Session expiry time
   */
  expiresAt: string;
}
