# @flaggly/sdk

Client SDK for [Flaggly](https://flaggly.dev) -- a self-hosted feature flag service on Cloudflare Workers.

## Install

```sh
pnpm i @flaggly/sdk
```

## Setup

Define your flag schema and create a client:

```ts
import { Flaggly } from '@flaggly/sdk';

type Flags = {
  'dark-mode': { type: 'boolean' };
  'banner': { type: 'payload'; result: { text: string; color: string } };
  'checkout': { type: 'variant'; result: string };
};

const flaggly = new Flaggly<Flags>({
  url: 'https://flaggly.example.workers.dev',
  apiKey: 'YOUR_USER_JWT',
});
```

Flags are evaluated immediately on creation. Pass `lazy: true` to defer until you call `identify()` or `fetchFlags()`.

## Usage

```ts
// Type-safe getters
const isDarkMode = flaggly.getBooleanFlag('dark-mode');
const banner = flaggly.getPayloadFlag('banner');
const checkout = flaggly.getVariantFlag('checkout');
```

### Identifying users

Call `identify()` when a user logs in. This re-evaluates all flags with the user context:

```ts
await flaggly.identify(userId, { email: user.email, tier: user.tier });
```

### React

```ts
import { Flaggly, FlagValue } from '@flaggly/sdk';
import { useSyncExternalStore } from 'react';

const flaggly = new Flaggly<Flags>({
  url: 'https://flaggly.example.workers.dev',
  apiKey: 'YOUR_USER_JWT',
  lazy: true,
  bootstrap: {
    'dark-mode': false,
  },
});

export const useFlags = () =>
  useSyncExternalStore(flaggly.store.subscribe, flaggly.store.get, flaggly.store.get);

export const useFlag = <K extends keyof Flags>(key: K): FlagValue<Flags[K]> => {
  const data = useFlags();
  return data?.[key].result as FlagValue<Flags[K]>;
};
```

### Cloudflare Workers (service binding)

```ts
const flaggly = new Flaggly<Flags>({
  url: 'https://flaggly.example.workers.dev',
  apiKey: 'YOUR_USER_JWT',
  lazy: true,
  workerFetch: (url, init) => env.FLAGGLY_SERVICE.fetch(url, init),
});
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `url` | `string` | -- | Base URL of your Flaggly worker |
| `apiKey` | `string` | -- | Public user JWT |
| `app` | `string` | `"default"` | App identifier |
| `env` | `string` | `"production"` | Environment identifier |
| `lazy` | `boolean` | `false` | Defer flag evaluation until manual call |
| `bootstrap` | `Partial<FlagValues>` | -- | Default values before first fetch |
| `workerFetch` | `typeof fetch` | `fetch` | Custom fetch for service bindings |
| `getBackupId` | `() => string` | -- | Custom anonymous user ID generator |
| `customStorage` | `CustomStorage` | `localStorage` | Storage for backup IDs |
| `getCurrentRoute` | `() => string \| null` | `window.location.href` | Route provider for non-browser envs |
| `getRandomId` | `() => string` | `crypto.randomUUID` | UUID generator for non-browser envs |

## Docs

Full documentation at [flaggly.dev](https://flaggly.dev).

## License

MIT
