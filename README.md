# @dialstack/sdk

Official JavaScript SDK for [DialStack](https://dialstack.ai) - Business Voice for Vertical SaaS.

Embed voice capabilities directly into your application with ready-to-use React components for call logs, voicemails, and more.

## Installation

```bash
npm install @dialstack/sdk
```

## Quick Start

### React

```tsx
import { initialize, DialstackComponentsProvider, CallLogs, Voicemails } from '@dialstack/sdk';
import { useEffect, useState } from 'react';

// Initialize DialStack with your publishable key
const dialstack = initialize({
  publishableKey: 'pk_live_YOUR_PUBLISHABLE_KEY',
});

function App() {
  const [clientSecret, setClientSecret] = useState('');

  useEffect(() => {
    // Fetch account session from your backend
    fetch('https://your-backend.com/api/create-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: 'acct_123' }),
    })
      .then((res) => res.json())
      .then((data) => setClientSecret(data.client_secret));
  }, []);

  if (!clientSecret) {
    return <div>Loading...</div>;
  }

  return (
    <DialstackComponentsProvider dialstack={dialstack} clientSecret={clientSecret}>
      <div>
        <h1>My Voice Dashboard</h1>
        <CallLogs />
        <Voicemails />
      </div>
    </DialstackComponentsProvider>
  );
}
```

### Vanilla JavaScript

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://unpkg.com/@dialstack/sdk"></script>
</head>
<body>
  <dialstack-call-logs></dialstack-call-logs>
  <dialstack-voicemails></dialstack-voicemails>

  <script>
    // Initialize DialStack
    const dialstack = DialStack.initialize({
      publishableKey: 'pk_live_YOUR_PUBLISHABLE_KEY'
    });

    // Set client secret on components
    const callLogs = document.querySelector('dialstack-call-logs');
    const voicemails = document.querySelector('dialstack-voicemails');

    // Fetch client secret from your backend
    fetch('https://your-backend.com/api/create-session', {
      method: 'POST',
      body: JSON.stringify({ accountId: 'acct_123' })
    })
      .then(res => res.json())
      .then(data => {
        callLogs.setClientSecret(data.client_secret);
        voicemails.setClientSecret(data.client_secret);
      });
  </script>
</body>
</html>
```

## Components

### CallLogs

Display a list of call history with details like caller, duration, and status.

```tsx
<CallLogs />
```

### Voicemails

Display a list of voicemails with playback controls.

```tsx
<Voicemails />
```

## API Reference

### `initialize(options)`

Initialize the DialStack SDK with your publishable key.

**Parameters:**
- `options.publishableKey` (string, required): Your DialStack publishable key (starts with `pk_live_` or `pk_test_`)
- `options.apiUrl` (string, optional): Custom API endpoint URL

**Returns:** `DialStackInstance`

### `DialstackComponentsProvider`

React Context Provider that makes the DialStack instance and client secret available to child components.

**Props:**
- `dialstack` (DialStackInstance, required): The DialStack instance from `initialize()`
- `clientSecret` (string, required): Account session client secret from your backend
- `children` (ReactNode, required): Child components

## Authentication

The SDK uses account-scoped sessions for authentication. You must:

1. Call your backend to create a session using the DialStack API:
   ```bash
   POST https://api.dialstack.ai/api/v1/accounts/{account_id}/sessions
   Authorization: Bearer sk_live_YOUR_SECRET_KEY
   ```

2. Pass the returned `client_secret` to the `DialstackComponentsProvider`

Sessions expire after 1 hour. Your application should handle refreshing expired sessions.

## Documentation

Full documentation is available at [https://docs.dialstack.ai](https://docs.dialstack.ai)

## Support

- [Documentation](https://docs.dialstack.ai)
- [GitHub Issues](https://github.com/dialstack/dialstack-sdk/issues)
- [GitHub Discussions](https://github.com/dialstack/dialstack-sdk/discussions)

## License

MIT - See [LICENSE](LICENSE) for details
