---
feature_ids: [F140]
topics: [auth, plugin-api, runtime, provider, extension]
doc_kind: architecture
created: 2026-04-09
---

# Auth Provider Extension Model

## Purpose

This document defines how auth providers are extended in Clowder AI.

The goal is to let the host runtime keep control of session, middleware, lifecycle, and route protection, while allowing both built-in and externally implemented auth providers to participate through one stable contract.

This model is designed for two realities at the same time:

1. The host project may internally consist of multiple pnpm packages.
2. External developers should still see one stable public integration surface.

## Scope

This model supports:

- Built-in host providers such as `no-auth` and `huawei-iam`
- External providers implemented in a separate TypeScript repository
- Runtime selection of the active provider through config
- Provider-owned login behavior and presentation metadata

This model does not support:

- Treating `X-Cat-Cafe-User` as an auth credential
- Overriding a built-in provider by reusing the same `providerId`
- Depending on random internal packages from the monorepo
- Automatic runtime discovery based only on TypeScript interfaces

## Core Principles

1. **`plugin-api` is the source-code home for auth contracts** — `packages/plugin-api` organizes the `AuthProvider` interface and related types as an internal monorepo package. It is not independently published to npm.
2. **One stable public entry** — external developers depend on exactly one published package that re-exports the auth contract. The current candidate is `@clowder/core/auth` (pending namespace migration from `@cat-cafe/*` to `@clowder/*`). Internal package layout is an implementation detail invisible to plugin authors.
3. **Built-in and external providers coexist** — built-in providers are host-maintained; external providers use new `providerId` values, never override built-in IDs.
4. **Config selects, never overrides** — `CAT_CAFE_AUTH_PROVIDER` means "activate this provider", not "replace that one".
5. **Host owns the skeleton** — session, middleware, lifecycle, registry, and active-provider selection are host responsibilities.
6. **Providers own implementation** — `authenticate`, provider-specific state, presentation metadata, and optional hooks belong to the provider.

## Public Package Boundary

There are two distinct layers:

- **Source home** (internal): `packages/plugin-api` — the monorepo package where `AuthProvider` and related types are defined and maintained. Not published to npm independently.
- **Public entry** (external): a published package that re-exports the auth contract for external consumption. The target is `@clowder/core/auth` (pending the `@cat-cafe/*` → `@clowder/*` namespace migration tracked in `feat/npm-publish-readiness`).

External provider authors will depend on the public entry only:

```ts
// After namespace migration:
import type { AuthProvider } from '@clowder/core/auth';
```

They must not import from internal implementation packages such as `@clowder/api`, `@clowder/web`, `@clowder/shared`, or internal provider source folders.

> **Transition note**: Until the namespace migration lands, the source-level import path is `@cat-cafe/plugin-api/auth`. This is a monorepo-internal path and should not appear in external developer documentation as a stable dependency target.

## Runtime Model

**Host responsibilities:**

- Registering built-in providers (`no-auth`, `huawei-iam`)
- Accepting externally supplied providers via `CAT_CAFE_AUTH_PROVIDER_MODULES`
- Selecting the active provider by `providerId`
- Issuing and validating opaque session credentials (`SessionAuthority`)
- Building `AuthContext` (userId / sessionId / providerId / authenticated)
- Executing provider lifecycle hooks (`bootstrap`, `postLoginInit`, `logout`)

**Provider responsibilities:**

- Converting credentials into an `ExternalPrincipal` (identity)
- Returning provider-owned opaque `providerState`
- Declaring `presentation` metadata (mode, fields, labels)
- Running provider-specific post-login initialization when triggered by the host

### Data Flow

```text
User Credentials
  → Provider.authenticate()
    → ExternalPrincipal + providerState
      → Platform issues AuthSession (holds providerState as opaque)
        → Platform builds AuthContext (userId / sessionId / providerId / authenticated)
          → Business layer sees only AuthContext via request.auth
```

## Provider Identity Rules

Built-in providers keep stable IDs:

- `no-auth` — zero-config local development
- `huawei-iam` — Huawei Cloud IAM login

External providers must use distinct IDs:

- `corp-huawei-iam` — a corporate customization of Huawei IAM
- `foo-oidc` — a third-party OIDC provider
- `acme-ldap` — an enterprise LDAP provider

Reusing a built-in `providerId` is forbidden. The model is **additive** — external providers are registered alongside built-in ones, and one is selected via config.

## Configuration Model

Minimum configuration:

```env
CAT_CAFE_AUTH_PROVIDER=corp-huawei-iam
```

Its meaning is simple: among all registered providers, activate `corp-huawei-iam`. If not set, defaults to `no-auth`.

For external module loading:

```env
CAT_CAFE_AUTH_PROVIDER_MODULES=@acme/auth-provider-ldap
```

The host runtime calls `import()` on each module specifier, expecting a default export that satisfies the `AuthProvider` contract.

## External Integration Flow

An external TypeScript repository integrates with the host in six steps:

1. **Install** the public auth entry package (e.g. `pnpm add @clowder/core`)
2. **Implement** a provider using the `AuthProvider` contract
3. **Assign** a new `providerId` (never reuse built-in IDs)
4. **Export** the provider as the package's default export
5. **Configure** the host: set `CAT_CAFE_AUTH_PROVIDER` and `CAT_CAFE_AUTH_PROVIDER_MODULES`
6. **Verify** the runtime selected the external provider

Example provider implementation:

```ts
import type {
  AuthProvider,
  AuthenticateInput,
  AuthenticateOutcome,
} from '@clowder/core/auth';

const acmeLdapProvider: AuthProvider = {
  id: 'acme-ldap',
  displayName: 'Acme LDAP',
  presentation: {
    mode: 'form',
    fields: [
      { name: 'username', label: 'Username', type: 'text', required: true },
      { name: 'password', label: 'Password', type: 'password', required: true },
    ],
    submitLabel: 'Sign In',
  },

  async authenticate(input: AuthenticateInput): Promise<AuthenticateOutcome> {
    const { username, password } = input.credentials as { username: string; password: string };
    // ... LDAP verification logic ...
    return {
      success: true,
      principal: {
        userId: `acme:${username}`,
        displayName: username,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      },
    };
  },
};

export default acmeLdapProvider;
```

Host `.env`:

```env
CAT_CAFE_AUTH_PROVIDER=acme-ldap
CAT_CAFE_AUTH_PROVIDER_MODULES=@acme/auth-provider-ldap
```

## Frontend Surface Model

The selected provider determines not only backend auth behavior but also the login experience.

Providers declare a `presentation.mode`:

| Mode | Behavior |
|------|----------|
| `auto` | No login UI; provider auto-authenticates (e.g., `no-auth`) |
| `form` | Host renders a login form from `presentation.fields` |
| `redirect` | Host redirects to `presentation.redirectUrl` for external auth |

The host is responsible for rendering and routing. The provider supplies metadata — it does not own the rendering runtime.

Future extension: providers may declare `static` mode with a web manifest pointing to provider-owned static assets (login page HTML/CSS/JS). The host would mount these via `@fastify/static` path mapping, similar to Java classpath resource mapping.

## Verification Checklist

A provider integration is considered valid only when all of the following are true:

- [ ] The provider is successfully registered in the host runtime
- [ ] `CAT_CAFE_AUTH_PROVIDER` matches the provider's `id`
- [ ] Backend auth requests execute against that provider
- [ ] The frontend login experience matches the provider's `presentation`
- [ ] No built-in `providerId` was reused
- [ ] Provider author depends only on the published public entry, not on internal monorepo packages
- [ ] `postLoginInit` (if declared) executes after session issuance
- [ ] Provider failure in `postLoginInit` does not roll back authentication

## Anti-Patterns

The following are explicitly disallowed:

| Anti-Pattern | Why |
|---|---|
| Using `X-Cat-Cafe-User` as a credential | Plaintext userId cannot carry auth semantics |
| Reusing `huawei-iam` or `no-auth` as an external provider ID | Additive model only; no same-ID override |
| Importing from internal monorepo packages (`plugin-api`, `api`, `shared`) | Only the published public entry is stable |
| Expressing provider replacement via hidden precedence rules | Config means "select", not "override" |
| Treating TypeScript interface implementation as runtime discovery | Explicit registration is required |
| Provider building `AuthContext` | Only the platform builds AuthContext from session |
| Leaking `providerState` into business layer | providerState is opaque; only the provider reads it |
