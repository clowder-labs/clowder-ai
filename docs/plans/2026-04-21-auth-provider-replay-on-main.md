# Auth Provider Replay On Main Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replay the `decoupling` branch's auth-provider architecture onto the main-based replay branch so auth and provider can both switch independently.

**Architecture:** Restore the F140 auth provider runtime as the platform-owned auth layer: plugin-auth contract stays in `packages/plugin-api`, platform session + middleware live under `packages/api/src/auth`, and the web login surface becomes provider-presentation-driven again. Keep the existing provider-runtime decoupling work, but remove the replay branch's fallback CAS-only auth flow so verification can switch both auth and provider.

**Tech Stack:** Fastify, Next.js App Router, Vitest, Node test runner, TypeScript/JavaScript monorepo

---

### Task 1: Re-establish auth red tests

**Files:**
- Modify: `packages/api/test/auth-routes.test.js`
- Create: `packages/api/test/auth-module.test.js`
- Create: `packages/api/test/auth-external-provider-e2e.test.js`
- Modify: `packages/web/src/app/login/__tests__/page.test.tsx`
- Create: `packages/web/src/utils/__tests__/auth-provider.test.ts`

**Step 1: Restore provider-driven auth tests from `decoupling`**

Bring back the tests that prove:
- auth providers are loaded by runtime string id
- `/api/islogin`, `/api/login`, `/api/logout` are provider-driven
- external auth providers can load by module path
- the login page renders from provider presentation schema

**Step 2: Run red tests**

Run:

```bash
pnpm --filter @office-claw/api test -- auth-module.test.js auth-routes.test.js auth-external-provider-e2e.test.js
pnpm --filter @office-claw/web test -- src/app/login/__tests__/page.test.tsx src/utils/__tests__/auth-provider.test.ts
```

Expected: failures because the replay branch still lacks the `packages/api/src/auth/*` runtime and provider-driven login page.

### Task 2: Restore platform auth runtime

**Files:**
- Create: `packages/api/src/auth/middleware.ts`
- Create: `packages/api/src/auth/module.ts`
- Create: `packages/api/src/auth/provider-registry.ts`
- Create: `packages/api/src/auth/providers/huawei-iam.ts`
- Create: `packages/api/src/auth/providers/no-auth.ts`
- Create: `packages/api/src/auth/session-store.ts`
- Create: `packages/api/src/auth/types.ts`
- Modify: `packages/api/src/routes/auth.ts`
- Modify: `packages/api/src/utils/request-identity.ts`

**Step 1: Restore auth runtime files from `decoupling`**

Bring back the auth provider registry, session store, middleware, and built-in providers.

**Step 2: Replace CAS-specific route orchestration**

Switch `packages/api/src/routes/auth.ts` from callback/invitation orchestration back to the provider-driven lifecycle:
- `/api/islogin`
- `/api/login`
- `/api/logout`

**Step 3: Re-run API auth tests**

Run:

```bash
pnpm --filter @office-claw/api test -- auth-module.test.js auth-routes.test.js auth-external-provider-e2e.test.js
```

Expected: green or reduced failures isolated to frontend/session identity wiring.

### Task 3: Restore provider-driven web auth surface

**Files:**
- Create: `packages/web/src/app/login/page.tsx`
- Modify: `packages/web/src/app/login/__tests__/page.test.tsx`
- Create: `packages/web/src/utils/auth-provider.ts`
- Create: `packages/web/src/utils/__tests__/auth-provider.test.ts`
- Modify: `packages/web/src/utils/api-client.ts`
- Modify: `packages/web/src/utils/userId.ts`
- Modify: `packages/web/src/components/ChatContainer.tsx`

**Step 1: Restore schema-driven login page**

Bring back the provider-driven login page from `decoupling`.

**Step 2: Reconnect session identity persistence**

Ensure `/api/islogin` and `/api/login` continue to persist session/user identity through the current replay branch's web client helpers.

**Step 3: Re-run focused web auth tests**

Run:

```bash
pnpm --filter @office-claw/web test -- src/app/login/__tests__/page.test.tsx src/utils/__tests__/auth-provider.test.ts src/utils/__tests__/userId.test.ts
```

Expected: green or failures only in auth-related callers that still assume the old callback flow.

### Task 4: Remove stale callback-only assumptions and verify switching scenario

**Files:**
- Modify: any auth callers or tests that still hardcode `/api/login/callback` or `/login/invitation`
- Verify: `packages/api/test/auth-login-refresh-models.test.js`

**Step 1: Update stale auth callers/tests**

Drop or rewrite callback/invitation-only expectations that contradict F140's provider-driven flow.

**Step 2: Run combined verification**

Run:

```bash
pnpm --filter @office-claw/api test -- auth-module.test.js auth-routes.test.js auth-external-provider-e2e.test.js auth-login-refresh-models.test.js
pnpm --filter @office-claw/web test -- src/app/login/__tests__/page.test.tsx src/utils/__tests__/auth-provider.test.ts src/utils/__tests__/userId.test.ts
```

Expected: auth provider architecture works on the replay branch, and the verification path can switch both auth and provider.
