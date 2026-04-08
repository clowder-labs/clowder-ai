# Auth Plugin API & Provider Runtime Implementation Plan

**Feature:** F140 — `docs/features/F140-auth-plugin-api-runtime.md`
**Goal:** Build a pluggable auth runtime that defaults to `no-auth`, loads third-party auth providers through a unified `plugin-api`, and moves identity truth to platform-managed session + middleware.
**Acceptance Criteria:** `plugin-api` contract exists; active provider is env-selected runtime string; SessionAuthority becomes the only identity truth source; AuthContext is platform-built and minimal; `no-auth` / form / redirect providers share one lifecycle; `X-Cat-Cafe-User` is removed from the auth path.
**Architecture:** Add a dedicated `packages/plugin-api` workspace package for provider contracts, then wire `packages/api` to load providers from built-in and external modules. Keep auth runtime concerns in platform land: session issuance, middleware, AuthContext, and hook scheduling. Provider-specific protocol details and post-login init stay behind the provider boundary.
**Tech Stack:** pnpm workspace, TypeScript, Fastify, Next.js, node:test, Vitest
**前端验证:** Yes — reviewer must verify `auto / form / redirect` login flows and provider-driven UI rendering.

---

### Task 1: Create the `plugin-api` contract package

**Files:**
- Create: `packages/plugin-api/package.json`
- Create: `packages/plugin-api/tsconfig.json`
- Create: `packages/plugin-api/src/index.ts`
- Create: `packages/plugin-api/src/auth.ts`
- Modify: `package.json`

**Step 1: Define the terminal auth contract**

Need:
- `AuthProvider` contract
- `AuthPresentation` (`auto / form / redirect`)
- `ExternalPrincipal`
- provider-owned opaque `providerState`
- no runtime dependency on business code

**Step 2: Add workspace exports**

Need:
- `@cat-cafe/plugin-api`
- `@cat-cafe/plugin-api/auth`
- keep the package type-first and minimal

**Step 3: Verify the package builds**

Run: `pnpm --filter @cat-cafe/plugin-api run build`
Expected: green build with `.d.ts` output.

### Task 2: Rebuild auth runtime around the contract

**Files:**
- Modify: `packages/api/src/auth/types.ts`
- Modify: `packages/api/src/auth/provider-registry.ts`
- Modify: `packages/api/src/auth/module.ts`
- Modify: `packages/api/src/auth/providers/no-auth.ts`
- Modify: `packages/api/src/auth/providers/huawei-iam.ts`
- Create: `packages/api/test/auth-module.test.js`
- Modify: `packages/api/test/auth-routes.test.js`

**Step 1: Rewrite auth runtime types to depend on `plugin-api`**

Need:
- provider ID as runtime `string`
- platform session record separate from provider contract
- `presentation` and `ExternalPrincipal` aligned with F140

**Step 2: Keep only runtime concerns in `packages/api`**

Need:
- registry / active provider selection
- built-in providers
- external module loading via env
- no provider-specific switch logic in runtime

**Step 3: Write and run focused backend tests**

Run: `pnpm --dir packages/api exec node --import tsx --test test/auth-routes.test.js test/auth-module.test.js`
Expected: tests cover default `no-auth`, env-selected providers, and external provider loading.

### Task 3: Introduce SessionAuthority and global auth middleware

**Files:**
- Modify: `packages/api/src/auth/session-store.ts`
- Create: `packages/api/src/auth/session-authority.ts`
- Create: `packages/api/src/auth/middleware.ts`
- Modify: `packages/api/src/routes/auth.ts`
- Modify: `packages/api/src/utils/request-identity.ts`
- Modify: `packages/api/src/routes/version.ts`

**Step 1: Move identity truth to opaque sessions**

Need:
- platform-issued opaque session credential
- `AuthContext` built from session record, not by provider
- session expiry handled in store/middleware only

**Step 2: Remove `X-Cat-Cafe-User` from the auth path**

Need:
- keep temporary compatibility wrappers where unavoidable
- route business consumers to `request.auth`
- stop accepting query/body `userId` as identity

**Step 3: Add coverage for expiry and request auth context**

Run: `pnpm --dir packages/api exec node --import tsx --test test/auth-routes.test.js`
Expected: green; new tests prove session truth, expiry, and middleware injection.

### Task 4: Make login lifecycle provider-driven on the frontend

**Files:**
- Modify: `packages/web/src/app/login/page.tsx`
- Modify: `packages/web/src/utils/api-client.ts`
- Modify: `packages/web/src/utils/userId.ts`
- Create: `packages/web/src/utils/auth-provider.ts`
- Create: `packages/web/src/utils/__tests__/auth-provider.test.ts`
- Modify: `packages/web/src/utils/__tests__/userId.test.ts`

**Step 1: Drive UI from provider presentation**

Need:
- `auto` mode for `no-auth`
- `form` mode for credential-based providers
- `redirect` mode placeholder path for future providers

**Step 2: Switch frontend auth transport**

Need:
- use opaque session credential, not userId as auth semantic
- keep returned `viewer/profile` display separate from `AuthContext`
- stop URL/localStorage identity pollution

**Step 3: Verify frontend behavior**

Run: `pnpm --dir packages/web exec vitest run src/utils/__tests__/userId.test.ts src/utils/__tests__/auth-provider.test.ts`
Expected: green.

### Task 5: Move Huawei-specific initialization behind provider hooks

**Files:**
- Modify: `packages/api/src/auth/providers/huawei-iam.ts`
- Modify: `packages/api/src/integrations/huawei-maas.ts`
- Modify: `packages/api/src/routes/auth.ts`
- Modify: `packages/api/test/auth-routes.test.js`

**Step 1: Split authentication from post-login side effects**

Need:
- `authenticate()` only returns identity + providerState
- `postLoginInit` executes after session issuance
- failure does not roll back successful login

**Step 2: Preserve the Huawei-specific value without leaking it**

Need:
- provider-owned `providerState`
- explicit escape hatch for integrations that truly need provider context
- no default business import path to provider internals

**Step 3: Verify Huawei behavior**

Run: `pnpm --dir packages/api exec node --import tsx --test test/auth-routes.test.js`
Expected: green; Huawei login still works and hook failure does not mark auth as failed.

### Task 6: Close the loop on docs, env, and verification

**Files:**
- Modify: `.env.example`
- Modify: `docs/features/F140-auth-plugin-api-runtime.md`
- Modify: `docs/plans/2026-04-08-auth-provider-abstraction.md`

**Step 1: Document the new env surface**

Need:
- `CAT_CAFE_AUTH_PROVIDER`
- `CAT_CAFE_AUTH_PROVIDER_MODULES`
- default `no-auth`
- deprecation note for legacy skip-auth semantics

**Step 2: Run targeted verification**

Run:
- `pnpm --filter @cat-cafe/plugin-api run build`
- `pnpm --dir packages/api exec node --import tsx --test test/auth-routes.test.js test/auth-module.test.js`
- `pnpm --dir packages/web exec vitest run src/utils/__tests__/userId.test.ts src/utils/__tests__/auth-provider.test.ts`

Expected: green, or unrelated existing failures clearly separated from F140.

**Step 3: Prepare for implementation handoff**

Need:
- feature doc and plan stay aligned
- implementation starts from the plugin-api path, not the old shared/auth-types path
- next workflow step is `worktree` → `tdd`
