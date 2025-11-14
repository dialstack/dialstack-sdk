/**
 * Type declarations for @dialstack/sdk
 */

declare module '@dialstack/sdk' {
  // Core types
  export interface DialStackOptions {
    publishableKey: string;
    apiUrl?: string;
  }

  export interface DialStackInstance {
    publishableKey: string;
    apiUrl: string;
  }

  export interface SessionOptions {
    accountId: string;
    platformId: string;
  }

  export interface Session {
    clientSecret: string;
    expiresAt: string;
  }

  // Core functions
  export function initialize(options: DialStackOptions): DialStackInstance;
  export function getInstance(): DialStackInstance | null;
  export function createInstance(options: DialStackOptions): DialStackInstance;

  // Web Components
  export class BaseComponent extends HTMLElement {
    protected clientSecret: string;
    protected isInitialized: boolean;
    protected initialize(): void;
    setClientSecret(clientSecret: string): void;
  }

  export class CallLogsComponent extends BaseComponent {}
  export class VoicemailsComponent extends BaseComponent {}

  // React components
  import { FC, ReactNode, RefObject, CSSProperties } from 'react';

  export interface DialstackComponentsProviderProps {
    dialstack: DialStackInstance;
    clientSecret: string;
    children: ReactNode;
  }

  export const DialstackComponentsProvider: FC<DialstackComponentsProviderProps>;
  export function useDialstackComponents(): {
    dialstack: DialStackInstance | null;
    clientSecret: string | null;
  };

  export function useCreateComponent<T extends BaseComponent>(
    ComponentClass: { new(): T },
    options: { clientSecret: string }
  ): RefObject<HTMLDivElement>;

  export function useUpdateWithSetter<T>(
    initialValue: T
  ): [T, (value: T) => void];

  export interface CallLogsProps {
    className?: string;
    style?: CSSProperties;
  }

  export interface VoicemailsProps {
    className?: string;
    style?: CSSProperties;
  }

  export const CallLogs: FC<CallLogsProps>;
  export const Voicemails: FC<VoicemailsProps>;
}
