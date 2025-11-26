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
<CallLogs
  dateRange={{ start: '2025-01-01', end: '2025-01-31' }}
  limit={50}
  onRowClick={(e) => console.log('Selected call:', e.callId)}
  onLoadError={(e) => console.error(e.error)}
/>
```

**Props:**
- `dateRange` - Filter by date range (`{ start?: string, end?: string }`)
- `limit` - Maximum records to display (default: 20)
- `locale` - Custom locale for UI strings
- `formatting` - Date/phone formatting options
- `onLoaderStart` - Callback when loading starts
- `onLoadError` - Callback when loading fails
- `onPageChange` - Callback when pagination changes
- `onRowClick` - Callback when a row is clicked

### Voicemails

Display a list of voicemails with playback controls.

```tsx
<Voicemails
  userId="user-uuid-123"
  onVoicemailSelect={(e) => console.log('Selected:', e.voicemailId)}
  onCallBack={(e) => initiateCall(e.phoneNumber)}
/>
```

**Props:**
- `userId` - User ID to fetch voicemails for (required)
- `locale` - Custom locale for UI strings
- `formatting` - Date/phone formatting options
- `onLoaderStart` - Callback when loading starts
- `onLoadError` - Callback when loading fails
- `onVoicemailSelect` - Callback when a voicemail is selected
- `onVoicemailPlay` - Callback when playback starts
- `onVoicemailPause` - Callback when playback pauses
- `onVoicemailDelete` - Callback when a voicemail is deleted
- `onCallBack` - Callback when call back button is clicked

## Theming

Customize component appearance using CSS variables passed via the `appearance` option during initialization:

```tsx
const dialstack = initialize({
  publishableKey: 'pk_live_YOUR_KEY',
  appearance: {
    theme: 'light', // 'light' | 'dark' | 'auto'
    variables: {
      // Colors
      colorPrimary: '#6772E5',
      colorBackground: '#ffffff',
      colorText: '#1a1a1a',
      colorDanger: '#e5484d',
      colorSuccess: '#30a46c',

      // Typography
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSizeBase: '14px',

      // Spacing
      spacingUnit: '8px',
      borderRadius: '4px',
    },
  },
});
```

All components inherit appearance from the SDK instance and automatically adjust for light/dark themes.

## Internationalization (i18n)

Components support full internationalization via the `locale` prop:

```tsx
import { en } from '@dialstack/sdk/locales';

// Create a custom locale by extending the default
const fr: typeof en = {
  common: {
    loading: 'Chargement...',
    error: 'Erreur',
    // ... other translations
  },
  callLogs: {
    title: 'Journal des appels',
    // ... other translations
  },
  voicemails: {
    title: 'Messagerie vocale',
    // ... other translations
  },
};

<CallLogs locale={fr} />
```

## Formatting

Customize date and phone number formatting:

```tsx
<CallLogs
  formatting={{
    defaultCountry: 'FR',        // ISO 3166-1 alpha-2 country code
    dateLocale: 'fr-FR',         // BCP 47 language tag
    use24HourTime: true,         // 24-hour format
    showTimezone: false,         // Hide timezone
  }}
/>
```

## Accessibility

All components are built with accessibility in mind:

- **ARIA Labels**: Proper `role`, `aria-label`, and `aria-live` attributes
- **Keyboard Navigation**: Full keyboard support (Tab, Enter, Space)
- **Focus Management**: Visible focus rings via CSS variables
- **Screen Reader Support**: Status announcements for loading/error states

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
   POST https://api.dialstack.ai/v1/account_sessions
   Authorization: Bearer sk_live_YOUR_SECRET_KEY
   DialStack-Account: acct_01h2xcejqtf2nbrexx3vqjhp41
   Content-Type: application/json
   ```

2. Pass the returned `client_secret` to the `DialstackComponentsProvider`

Sessions expire after 1 hour. Your application should handle refreshing expired sessions.

**Security Note**: Only server-side API keys can create sessions. Session tokens cannot be used to create new sessions, preventing unauthorized session extension.

## Documentation

Full documentation is available at [https://docs.dialstack.ai](https://docs.dialstack.ai)

## Support

- [Documentation](https://docs.dialstack.ai)
- [GitHub Issues](https://github.com/dialstack/dialstack-sdk/issues)
- [GitHub Discussions](https://github.com/dialstack/dialstack-sdk/discussions)

## License

MIT - See [LICENSE](LICENSE) for details
