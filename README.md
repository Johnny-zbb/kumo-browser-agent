# Kumo Browser Agent

A small, clean TypeScript monorepo for a **browser agent that can eventually use DOM, Vision or Hybrid perception**.

> Status: `0.2.0` / DOM + accessible-component playground. **Demo mode uses deterministic rules; opt-in local LLM mode requires server-side configuration.** It does not control arbitrary third-party websites.

## Quick start

```bash
npm install
npm run typecheck
npm test
npm run dev
```

Visit `http://localhost:4173`.

### Agent Mode animation

Press **启动 Agent** in the fixed Sandbox composer: a circular reveal expands from the trigger, then a rotating multicolor **Sandbox-scoped** frame indicates that the Agent is working. A live activity pill reports the observed turn and action. The frame is removed on completion, failure, cancellation, or exhaustion of the turn budget. The controlled page and agent decisions are unchanged; this effect is purely a Playground presentation. `prefers-reduced-motion` disables the reveal and rotation.

The circular reveal is adapted from [Lucian UX/UI Prompt #045](https://lucianlabs.dev/uxui-prompt/#045), MIT License © 2026 Seokwoooo, with attribution retained in source. The viewport frame is a custom addition.

Run one of four demonstration tasks: search instances, create a mock instance, change the custom region selector, or scroll to the bottom. Actions operate only inside the local demonstration page.

## Browser E2E regression tests

Chromium journeys exercise the **compiled application**: custom region selection,
search, create instance, scrolling to the bottom and cancelling during the Agent Mode
transition. A failed journey writes a screenshot and error details to `test-results/e2e/`.

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

CI installs the browser and runs these journeys against the real local HTTP server.
In environments where Chromium blocks *all* HTTP navigation by administrator policy,
`KUMO_E2E_ISOLATED=1 npm run test:e2e` runs the same compiled modules in an
isolated document. This opt-in mode validates the UI/agent path but **does not**
prove the HTTP server path. For system-installed Chromium, optionally set
`KUMO_CHROMIUM_EXECUTABLE=/path/to/chromium`.

## Workspace

- `packages/agent-core`: task language (`PageSnapshot`, `PageAction`, `Decision`) and the agent loop. No browser DOM dependencies.
- `packages/dom-engine`: in-page DOM snapshot and action implementation, including `ComponentAdapterRegistry` and the tested ARIA-combobox `selectOption` adapter.
- `apps/playground`: standalone controlled demo and deterministic planner.
- `tests`: core loop tests; includes stale refs, cancellation, no-progress detection, and max turns.
- `docs/architecture`: design decisions and next milestones.

## Design principles

1. **DDD-lite**: domain vocabulary is independent of the browser; application orchestration is a deep module.
2. **Ports & Adapters**: the core depends on interfaces, not a specific page implementation.
3. **Observe → Decide → Act → Observe**: an action always belongs to an observation and is followed by a fresh observation.
4. **Explicit security boundary**: an in-page agent can only touch DOM it is permitted to access. Extension/CDP runtimes need separate authorization.
5. **Honest capability**: Vision/Hybrid, framework-specific Ant Design/Tiny adapters, Shadow DOM and cross-origin frames remain future work. The accessible combobox demo is not a guarantee of compatibility with all component libraries.

See [architecture](docs/architecture/overview.md) for the upgrade path, including how to bring *audited, original* `kiki-anti` DOM SDK behaviors across without copying the original reverse-engineering history or third-party bundles.

## Repository

GitHub: <https://github.com/Johnny-zbb/kumo-browser-agent>

This repository starts from an independent, clean source tree. It does not include Git history, reverse-engineering targets, captured pages or third-party bundles from the private `kiki-anti` research repository.

The initial repository is public. A software license has not yet been selected; do not assume the code is licensed for reuse until one is added.

## Next steps

1. Add an authorized browser runtime for non-demo pages, with explicit origin-scoped permissions and browser E2E.
2. Evaluate a real LLM against stable fixtures, including failures, retries and unknown tasks.
3. Extend standard HTML/ARIA semantics and add real Ant Design/Tiny fixtures.
4. Add visual observations and an explicit DOM/Vision fallback after the browser runtime is proven.

### Action and task verification

Every successful action is followed by `settle()` and a **new observation**. Input/select actions verify the observed target value; clicks report `changed` or `unconfirmed` without claiming that a task succeeded. An optional independent `TaskVerifierPort` checks any planner `done` decision; the Playground enables it through `DemoTaskVerifier` for all four supported tasks. If independent evidence is missing, the run fails rather than reporting success. See [verification design](docs/architecture/action-verification.md).

## Local LLM Mode (opt-in, development only)

The Playground starts in **Demo** mode without any model or credentials. The developer inspector contains the Planner switch. To enable the **LLM · 本地模型** option, configure an OpenAI-compatible model in the Node server environment:

```bash
KUMO_LLM_ENDPOINT=http://127.0.0.1:1234/v1/chat/completions \
KUMO_LLM_MODEL=your-local-model \
KUMO_LLM_API_KEY=your-local-token npm run dev
```

The API key is never sent to the browser. The server returns validated **single-step decisions only**. Browser execution is scoped to the local Sandbox and guarded by `SandboxActionPolicy`: destructive targets and credential fields are denied; commit/submit operations request a **human approval click** before executing. Cancelling aborts the model request or pending approval. For detailed boundaries, read [Model Bridge & Action Policy](docs/architecture/model-bridge.md). This local development bridge is **not** a production-ready authenticated browser automation API.


### Local Playground HTTP serving (development-only)

The Node server serves **only** the Playground HTML, stylesheet and compiled browser-side modules under `dist/apps/playground`, `dist/packages/agent-core`, and `dist/packages/dom-engine`. It does not expose repository source, `.env`, dependencies, tests, server files or compiled `llm-client` code. It also rejects unexpected Host/Origin headers and refuses symlink escapes, while setting restrictive security headers.

This is a defense-in-depth boundary for local development, **not a production security audit**. Do not expose the Node bridge on a public network. The whitelist is in `scripts/playground-static.mjs`; add a route only after verifying it is safe for browser consumption. `npm test` includes regression tests for private-file access and Host-header attacks.

## Playwright Browser Runtime (opt-in, v0.5)

The Node-only `PlaywrightPagePort` connects an explicitly authorized Chromium page to the **existing DOM Engine** and `runAgent` contract. It **does not** give the browser unrestricted website access. A dedicated Playwright context is required.

- Configure exact HTTP(S) origins, such as `http://127.0.0.1:4173`. URLs with credentials, wildcard domains, or other schemes are refused. Requests to other origins (including subresources and redirects) are aborted.
- Call `start()` then `navigate(allowedUrl)`. `observe()` generates the usual Semantic Snapshot; `execute()` checks observation freshness and the authorized root. Navigating invalidates all previous observations.
- The injected browser driver is generated by `npm run build` from the **same DOM Engine** code. Node callers load `dist/browser-dom-driver.js` and provide its contents as `driverSource`; do not expose the driver bundle or server-side credentials in arbitrary pages.
- Keep using `runAgent` with an explicit Action Policy, human approval callback, and independent task verification. The runtime does not supply them automatically.
- This is a **local/development runtime**, not an isolation boundary for hostile JavaScript, arbitrary remote browsing, authentication, or third-party sites. A trusted/isolated profile and controlled test pages are required; no arbitrary cross-origin iframe control, no Vision.

See [runtime architecture](docs/architecture/playwright-runtime.md), the opt-in `scripts/run-browser-agent.mjs` CLI, and `tests/e2e/playwright-runtime.test.mjs` for an end-to-end fixture.

### 免费 LLM API（Groq / Gemini）

现有的 OpenAI-compatible Node Bridge 支持免费 API，不需要将密钥交给聊天助手。复制 `.env.example` 到 Git 忽略的 `.env.local`，在本地填写 Key，运行 `npm run dev:llm`。安装步骤、额度和数据隐私边界见 [免费 LLM 接入指南](docs/guides/free-llm-api.md)。**不要把本地 Bridge 暴露在公网，也不要处理包含秘密的真实控制台页面。**
