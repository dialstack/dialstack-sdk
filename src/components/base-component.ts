/**
 * Base component class for DialStack Web Components
 */

export interface BaseComponentOptions {
  /**
   * Session client secret for authentication
   */
  clientSecret: string;

  /**
   * Optional container element ID
   */
  container?: string;
}

export abstract class BaseComponent extends HTMLElement {
  protected clientSecret: string;
  protected isInitialized: boolean = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.clientSecret = '';
  }

  /**
   * Called when the element is connected to the DOM
   */
  connectedCallback(): void {
    this.initialize();
  }

  /**
   * Initialize the component
   */
  protected abstract initialize(): void;

  /**
   * Set the client secret for authentication
   */
  setClientSecret(clientSecret: string): void {
    this.clientSecret = clientSecret;
  }
}
