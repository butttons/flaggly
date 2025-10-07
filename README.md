# Flaggly

Flaggly is a lightweight, self-hosted feature flag service running on Cloudflare Workers. Deploy your own instance in minutes with boolean flags, payload flags, A/B testing, and progressive rollouts.


> [!CAUTION]
> This is still a WIP. 

## Deployment

### Service bindings
The worker uses the following service bindings to function. 
1. `FLAGGLY_KV` - [Cloudflare Workers KV](https://developers.cloudflare.com/kv/) - The main database for storing flags.
2. `JWT_SECRET` - [Secret](https://developers.cloudflare.com/workers/configuration/secrets/) - The secret for to sign and verify keys for the API.
3. `ORIGIN` - [Environment variable](https://developers.cloudflare.com/workers/configuration/environment-variables/) - Allowed CORS origin or list of origins which can use the service. Use a comma separated list to allow multiple origins.


### Quick Deploy
The quickest way to get an instance up and running is by using the automatic GitHub integration with Cloudflare Workers. This is the recommended way.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/butttons/flaggly)

The automatic deployment will essentially do the following:
1. Clone the repository in your Github account.
2. Use that to build a project.
3. You can configure the variables, secrets and the project name in the setup. Keep note of the `JWT_SECRET`. You will need it later to generate the JWT tokens.

### Manual Deploy
You need to install the following:
1. pnpm - https://pnpm.io/installation
2. wrangler - https://developers.cloudflare.com/workers/wrangler/install-and-update/
3. node - https://nodejs.org/en/download

Then you can manually deploy your project without connecting it to GitHub.
1. Clone the repository
```sh
git clone https://github.com/butttons/flaggly
```

2. Login with wrangler
```sh
cd flaggly
npx wrangler login
```

3. Setup the KV namespace. You will need to remove the default entry in the `wrangler.json` before you can create this binding with the same name. You can safely remove the entire `kv_namespaces` field. Then use the following command to create a KV store or [use the dashboard to create one](https://developers.cloudflare.com/kv/get-started/#2-create-a-kv-namespace).
```sh
npx wrangler kv namespace create FLAGGLY_KV
```
The command should prompt you to add the configuration to the `wrangler.json`. In case you've created the KV store using the dashboard, copy the ID of the KV store from the dashboard and add the following in `wrangler.json`:
```json
// ...
"kv_namespaces": [
  {
    "binding": "FLAGGLY_KV",
    "id": "[KV_STORE_ID]"
  }
]
// ...
```

4. Setup the `ORIGIN` variable - Update the `vars.ORIGIN` value in the `wrangler.json`

5. Deploy to Cloudflare
```sh
pnpm run deploy
```

6. Set the `JWT_SECRET` via CLI or (with the dashboard)[https://developers.cloudflare.com/workers/configuration/secrets/#via-the-dashboard].
```sh
npx wrangler secret put JWT_SECRET
```

### Updating
You can update your worker by just pushing the latest code to your github repository. Here is how you can fetch new updates:
1. Set up git remote url
```sh
git remote set-url flaggly https://github.com/butttons/flaggly.git
```
2. Fetch data
```sh
git fetch flaggly
```



## Configuration
You can interact with your instance once it's deployed. Before proceeding, you will need the following:
1. URL of the worker. You can find this in the `Settings` tab of your worker, under `Domains & Routes`. Here you can also add a custom domain and disable the default worker domain entirely.
2. The JWT keys for the API. You can generate the keys by using the `/__generate` endpoint. By default, it will generate a token with a 6 month expiry. You can create your own longer one at [jwt.io](https://www.jwt.io/)

```sh
curl -X POST https://flaggly.[ACCOUNT].workers.dev/__generate \
  -H "Content-Type: application/json" \
  -d '{
    "secret": "[JWT_SECRET]"  
  }'
```
Response
```json
{
  "user": "JWT_STRING",
  "admin": "JWT_STRING"
}
```


All `/admin/*` requests require a Bearer token:
```sh
Authorization: Bearer ADMIN_JWT
```
Additional headers can be used to define the app and environment:
```sh
X-App-Id: default          # defaults to "default"
X-Env-Id: production       # defaults to "production"
```

Use these to manage flags across different apps and environments:

```sh
# Manage staging environment
curl https://flaggly.[ACCOUNT].workers.dev/admin/flags \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "X-Env-Id: staging"

# Manage different app
curl https://flaggly.[ACCOUNT].workers.dev/admin/flags \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "X-App-Id: mobile-app" \
  -H "X-Env-Id: production"
```


Now you can interact with the API easily:

### Managing flags:

Get all data
```sh
curl https://flaggly.[ACCOUNT].workers.dev/admin/flags \
  -H "Authorization: Bearer {SERVICE_KEY}"
```
Response
```json
{
  "flags": {
    "new-checkout": { ... },
    "dark-mode": { ... }
  },
  "segments": {
    "beta-users": "user.email.endsWith('@company.com')",
    "premium": "user.tier == 'premium'"
  }
}
```

Create / update flag:
Boolean flag:
```sh
curl -X PUT https://flaggly.[ACCOUNT].workers.dev/admin/flags \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "new-checkout",
    "type": "boolean",
    "enabled": true,
    "label": "New Checkout Flow",
    "description": "Redesigned checkout experience"
  }'
```

Variant flag: (A/B test):
```sh
curl -X PUT https://flaggly.[ACCOUNT].workers.dev/admin/flags \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "button-color",
    "type": "variant",
    "enabled": true,
    "variations": [
      { "id": "control", "label": "Blue", "weight": 50, "payload": "#0000FF" },
      { "id": "treatment", "label": "Green", "weight": 50, "payload": "#00FF00" }
    ]
  }'
```

Payload flag:
```sh
curl -X PUT https://flaggly.[ACCOUNT].workers.dev/admin/flags \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "config",
    "type": "payload",
    "enabled": true,
    "payload": {
      "apiUrl": "https://api.example.com",
      "timeout": 5000
    }
  }'
```

Update a flag:
```sh
curl -X PATCH https://flaggly.[ACCOUNT].workers.dev/admin/flags \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": false,
    "description": "Temporarily disabled"
  }'
```

Delete a flag:
```sh
curl -X DELETE https://flaggly.[ACCOUNT].workers.dev/admin/flags/[FLAG_ID] \
  -H "Authorization: Bearer ADMIN_JWT"
```


### Managing segments
Create / update a segment:
```sh
curl -X PUT https://flaggly.[ACCOUNT].workers.dev/admin/segments  \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "team-users",
    "rule": "'\''@company.com'\'' in user.email"
  }'
```

Delete a segment:
```sh
curl -X DELETE https://flaggly.[ACCOUNT].workers.dev/admin/segments/[SEGMENT_ID]  \
  -H "Authorization: Bearer ADMIN_JWT"
```

## Usage
Once you have your flags ready for use, you can install the client side SDK to evaluate them.
```
pnpm i @flaggly/sdk
```
The SDK uses [nanostores](https://github.com/nanostores/nanostores) to manage the flag state. 

### Setup
Setup the client:
```ts 
// src/lib/flaggly.ts
import { FlagglyClient } from '@flaggly/sdk';

type Flags = {
  'new-checkout': { type: 'boolean' };
  'button-color': { type: 'variant'; result: string };
  config: { type: 'payload'; result: { apiUrl: string; timeout: number } };
};

export const flaggly = new FlagglyClient<Flags>({
  url: 'BASE_URL',
  apiKey: 'USER_JWT',
});

// Evaluation
const isNewCheckout = flaggly.getBooleanFlag('new-checkout');
const buttonColor = flaggly.getVariant('button-color');
const config = flaggly.getPayloadFlag('config')
```

For react:
```ts
// src/lib/flaggly.ts
import { FlagValueResult, FlagglyClient } from '@flaggly/sdk';
import { useStore } from '@nanostores/react';

type Flags = {
  'new-checkout': { type: 'boolean' };
  'button-color': { type: 'variant'; result: string };
  config: { type: 'payload'; result: { apiUrl: string; timeout: number } };
};

export const flaggly = new FlagglyClient<Flags>({
  url: 'BASE_URL',
  apiKey: 'USER_JWT',
});

export const useFlag = <K extends keyof Flags>(key: K): FlagValueResult<Flags[K]> => {
  const data = useStore(flaggly.getStore(), {
    keys: [key],
  });
  return data?.[key]?.result ?? false;
};

// Component usage
const isNewCheckout = useFlag('new-checkout');
```

Identifying a user once they log in:
```ts
flaggly.identify(userId: string, user: unknown);
```
This will re-evaluate the flags again and reset the state.

You can disable the flag evaluation on load by passing `lazy: false` to the constructor.