---
feature_ids: [F140]
topics: [auth, plugin-api, provider, guide]
doc_kind: guide
created: 2026-04-10
---

# Build an Auth Provider

This guide walks you through building a custom auth provider for Clowder AI in an independent repository. By the end you will have a working npm package that the host project can install, configure, and use.

> **Status**: This guide describes the **target-state** integration flow. The public package `@clowder/core` with subpath `./auth` is not yet published — it is pending the `@cat-cafe/*` to `@clowder/*` namespace migration. Until then, the auth contract is only available as the internal monorepo package `@cat-cafe/plugin-api/auth`. Once the migration lands, the import paths in this guide will work as written. See [`auth-provider-extension-model.md`](../architecture/auth-provider-extension-model.md) for the current transition state.

**Prerequisites**: TypeScript, npm/pnpm, basic understanding of authentication flows.

## Overview

An auth provider is a TypeScript module that implements the `AuthProvider` contract. It converts user credentials into an identity (`ExternalPrincipal`). The host platform handles everything else: sessions, middleware, route protection, and frontend rendering.

```text
Your provider                          Host platform
+-----------------------+              +---------------------------+
| authenticate()        | ──────────>  | Session issuance          |
| presentation metadata | ──────────>  | Login UI rendering        |
| postLoginInit()       | <──────────  | Lifecycle hook trigger    |
+-----------------------+              +---------------------------+
```

## Step 1: Create the project

```bash
mkdir acme-auth-provider && cd acme-auth-provider
pnpm init
pnpm add -D typescript @clowder/core
```

> **Note**: The public package name for the auth contract is `@clowder/core` with subpath `./auth`. This is the only dependency you need from the host project.

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

`package.json` additions:

```json
{
  "name": "@acme/auth-provider-ldap",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "prepublishOnly": "tsc"
  }
}
```

## Step 2: Implement the AuthProvider contract

Create `src/index.ts`:

```ts
import type {
  AuthProvider,
  AuthenticateInput,
  AuthenticateOutcome,
  AuthSessionInfo,
} from '@clowder/core/auth';

const acmeLdapProvider: AuthProvider = {
  // ── Required fields ──────────────────────────────────────────

  id: 'acme-ldap',
  displayName: 'Acme LDAP',

  presentation: {
    mode: 'form',
    fields: [
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
    submitLabel: 'Sign In',
    description: 'Sign in with your Acme corporate account.',
  },

  // ── Required method ──────────────────────────────────────────

  async authenticate(input: AuthenticateInput): Promise<AuthenticateOutcome> {
    const { username, password } = input.credentials as {
      username: string;
      password: string;
    };

    // Your authentication logic here (LDAP bind, API call, etc.)
    const user = await ldapBind(username, password);
    if (!user) {
      return { success: false, message: 'Invalid credentials' };
    }

    return {
      success: true,
      principal: {
        userId: `acme:${user.uid}`,
        displayName: user.cn,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000), // 8h
        providerState: { ldapDn: user.dn }, // opaque to platform
      },
    };
  },

  // ── Optional hooks ───────────────────────────────────────────

  async bootstrap() {
    // Called once at startup. Validate config, warm up connections.
    console.log('acme-ldap: bootstrap complete');
  },

  async postLoginInit(session: AuthSessionInfo) {
    // Called AFTER session issuance. Failure here does NOT roll back auth.
    // Use for: quota allocation, audit logging, etc.
    console.log(`acme-ldap: post-login init for ${session.userId}`);
  },

  async logout(session: AuthSessionInfo) {
    // Provider-side cleanup on logout.
    console.log(`acme-ldap: logout for ${session.userId}`);
  },
};

export default acmeLdapProvider;

// ── Your internal helpers (not exported) ───────────────────────

interface LdapUser {
  uid: string;
  cn: string;
  dn: string;
}

async function ldapBind(
  username: string,
  password: string,
): Promise<LdapUser | null> {
  // Replace with real LDAP logic
  if (username === 'demo' && password === 'demo') {
    return { uid: 'demo', cn: 'Demo User', dn: 'cn=demo,dc=acme,dc=com' };
  }
  return null;
}
```

## Step 3: Understand the contract

### Required

| Field/Method | Type | Purpose |
|---|---|---|
| `id` | `string` | Unique provider ID. Must not reuse built-in IDs (`no-auth`, `huawei-iam`). |
| `displayName` | `string` | Human-readable name for logs and admin UI. |
| `presentation` | `AuthPresentation` | Tells the host how to render the login UI. |
| `authenticate()` | `(input) => Promise<AuthenticateOutcome>` | Convert credentials to identity. No side-effects. |

### Presentation modes

| Mode | When to use | What happens | Status |
|---|---|---|---|
| `auto` | No user interaction needed (e.g., API key auth) | Host auto-calls `authenticate()`, skips login page | Available |
| `form` | Username/password or similar form-based login | Host renders form from `presentation.fields` | Available |
| `redirect` | OAuth/OIDC external redirect flow | Host redirects to `presentation.redirectUrl` | **Reserved** — contract defined, end-to-end flow not yet implemented |

### Optional hooks

| Hook | When called | Failure behavior |
|---|---|---|
| `bootstrap()` | Once at startup, only for the active provider | Throws = provider activation fails |
| `postLoginInit(session)` | After session issuance | Throws = logged, auth NOT rolled back |
| `logout(session)` | On user logout | Throws = logged, logout still succeeds |
| `refresh(session)` | Before credential expiry | Returns null = session expires normally |
| `restoreSession(userId)` | After server restart | Returns null = user must re-login |
| `handleCallback(params)` | OAuth redirect callback (**reserved**, not yet wired) | Same as `authenticate()` |
| `getPublicConfig()` | On unauthenticated requests | Returns provider-specific public metadata |

### Key types

```ts
// What authenticate() returns on success
interface ExternalPrincipal {
  userId: string;           // unique within your provider's namespace
  displayName?: string;     // shown in UI
  expiresAt: Date | null;   // null = never expires
  providerState?: unknown;  // opaque to platform, only your provider reads it
}

// Passed to your hooks (postLoginInit, logout, refresh)
interface AuthSessionInfo {
  sessionId: string;
  userId: string;
  providerId: string;
  providerState: unknown;   // your opaque data from ExternalPrincipal
  expiresAt: Date | null;
}
```

## Step 4: Provider ID rules

Your `id` must be a new, unique string. The host uses an **additive model** — external providers are registered alongside built-in ones.

**Do:**
- `acme-ldap`, `corp-oidc`, `mycompany-saml`

**Don't:**
- `no-auth` (built-in), `huawei-iam` (built-in)

## Step 5: Build and publish

```bash
pnpm build
npm publish  # or pnpm publish
```

## Step 6: Integrate with the host

In the host project:

```bash
pnpm add @acme/auth-provider-ldap
```

Edit `.env`:

```env
CAT_CAFE_AUTH_PROVIDER=acme-ldap
CAT_CAFE_AUTH_PROVIDER_MODULES=@acme/auth-provider-ldap
```

Restart the host. The runtime will:

1. `import()` your module from `CAT_CAFE_AUTH_PROVIDER_MODULES`
2. Register your provider in the registry
3. Select it as active because `CAT_CAFE_AUTH_PROVIDER` matches your `id`
4. Call `bootstrap()` on the active provider (if defined)
5. Render the login UI from your `presentation`
6. Route `/api/login` to your `authenticate()`

## Step 7: Verify

After restart, confirm:

- [ ] Login page shows your provider's form fields and description
- [ ] Logging in calls your `authenticate()` and creates a session
- [ ] `postLoginInit()` runs after successful login (check your logs)
- [ ] Logging out calls your `logout()` hook
- [ ] No built-in provider ID was reused

## Common patterns

### Environment-based configuration

Read config from env vars in your provider. The host passes its `process.env` to the module loader.

```ts
const provider: AuthProvider = {
  id: 'acme-ldap',
  // ...
  async bootstrap() {
    const url = process.env.ACME_LDAP_URL;
    if (!url) throw new Error('ACME_LDAP_URL is required');
  },
  // ...
};
```

### Storing opaque state

Use `providerState` in `ExternalPrincipal` to store provider-specific data (tokens, credentials) that your hooks need later. The platform stores it in the session but never reads it.

```ts
return {
  success: true,
  principal: {
    userId: 'acme:alice',
    expiresAt: new Date(Date.now() + 3600_000),
    providerState: { accessToken: 'tok_xxx', refreshToken: 'ref_yyy' },
  },
};

// Later, in refresh():
async refresh(session: AuthSessionInfo) {
  const { refreshToken } = session.providerState as { refreshToken: string };
  // ... use refreshToken to get new accessToken ...
}
```

### Handling auth failure with invite/promotion code

Return `needCode: true` to prompt the frontend for an invite code. **Prerequisite**: your `presentation.fields` must include a field named `promotionCode` — the frontend only renders the invite code input when this field exists in the schema.

```ts
// In your provider definition:
presentation: {
  mode: 'form',
  fields: [
    { name: 'username', label: 'Username', type: 'text', required: true },
    { name: 'password', label: 'Password', type: 'password', required: true },
    // This field is hidden by default; shown when needCode is returned
    { name: 'promotionCode', label: 'Invite Code', type: 'text', required: false },
  ],
  // ...
},

// In authenticate(), when invite code is required:
return {
  success: false,
  message: 'Invite code required',
  needCode: true,
};
```

## What NOT to do

- **Don't build `AuthContext`** — only the platform constructs it from the session.
- **Don't manage sessions** — the platform owns session issuance, storage, and expiry.
- **Don't import internal packages** — only depend on the published public entry.
- **Don't perform business side-effects in `authenticate()`** — use `postLoginInit()` instead.
- **Don't assume your `providerState` will be read by anything other than your own hooks.**

## Reference

- Architecture: [`docs/architecture/auth-provider-extension-model.md`](../architecture/auth-provider-extension-model.md)
- Contract source: [`packages/plugin-api/src/auth.ts`](../../packages/plugin-api/src/auth.ts)
- Built-in examples: [`packages/api/src/auth/providers/no-auth.ts`](../../packages/api/src/auth/providers/no-auth.ts), [`huawei-iam.ts`](../../packages/api/src/auth/providers/huawei-iam.ts)
