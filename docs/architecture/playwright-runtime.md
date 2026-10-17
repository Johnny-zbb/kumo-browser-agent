# Playwright Browser Runtime v0.5

## Scope

`PlaywrightPagePort` lives in Node. It adapts a **dedicated Playwright page/context** to `PagePort` and composes with the unchanged Agent Runner, LLM Planner, Action Policy and Task Verifier. The DOM Engine is bundled from its compiled JavaScript for injection and retains the same semantic hierarchy, action capabilities, component adapters and ref validation; it is not reimplemented.

The current release is for **authorized development/test sites only**. It is not a containment mechanism for hostile page scripts, a cloud browser service, or a cross-origin controller. It cannot read third-party iframe DOMs or control other tabs. Site scripts may manipulate the page execution context. Use a disposable browser profile with no private credentials.

## Authorization

- All allowed origins must be declared as exact HTTP(S) origins. No wildcard, user-info, file/data/javascript protocol, or path-prefix rules.
- A dedicated context registers a request route that denies *all intercepted off-origin HTTP(S) requests*, including redirects and subresources. Denial is not silently bypassed.
- `navigate()` rejects disallowed URLs before requesting them and checks the final URL. `observe()` and `execute()` recheck the active URL.
- Any main-frame navigation invalidates the previous snapshot, even when the same URL is reloaded. Node-generated observation IDs do not reset on navigation.
- `rootSelector` limits target discovery/actions. The current DOM Engine checks ref ownership, role, name, value, visibility, and disabled state again immediately before dispatch.
- Use `runAgent` with explicit action policy and independent verifier; `PlaywrightPagePort` does not invent a human approval or task-completion assertion.
- **Not a security sandbox:** browser-internal special schemes, JS-controlled DOM code, subframes, popups, browser exploits and DNS-rebinding defense need additional isolation and tests. Do not use against untrusted remote websites yet.

## Example

Start a local fixture site, run `npm run build`, and then specify exactly which site, root, and completion signal to use:

```bash
KUMO_ALLOWED_ORIGINS=http://127.0.0.1:4173 \
KUMO_EXPECT_TEXT='筛选结果：agent' \
KUMO_LLM_ENDPOINT=https://model.example/v1/chat/completions \
KUMO_LLM_MODEL=model-id \
KUMO_LLM_API_KEY=your-local-secret \
node scripts/run-browser-agent.mjs http://127.0.0.1:4173 '搜索 agent 实例' '#sandbox'
```

Never store a real API key in the repo, command history, or browser JS. Missing expected completion evidence refuses a model `done`. If approval is required, the terminal prompts for exact `YES`; non-interactive usage denies approval.

## Verified conditions

`tests/e2e/playwright-runtime.test.mjs` proves a multi-turn DOM operation via Chromium with actual action-verification and task-verification, and checks old refs are unusable after navigation, disallowed URLs are rejected, and cross-origin redirects are blocked. CI runs over real loopback HTTP; the isolated browser fallback tests a restricted subset when this sandbox denies Chromium networking.
