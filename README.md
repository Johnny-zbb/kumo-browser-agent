# Kumo Browser Agent

A small, clean TypeScript monorepo for a **browser agent that can eventually use DOM, Vision or Hybrid perception**.

> Status: `0.2.0` / DOM + accessible-component playground. **This version uses a deterministic demonstration planner, not an LLM.** It does not control arbitrary third-party websites.

## Quick start

```bash
npm install
npm run typecheck
npm test
npm run dev
```

Visit `http://localhost:4173`.

### Agent Mode animation

Press **开始任务** (or any quick-task chip): a circular reveal expands from the trigger, then a rotating multicolor viewport frame indicates that the Agent is working. A live activity pill reports the observed turn and action. The frame is removed on completion, failure, cancellation, or exhaustion of the turn budget. The controlled page and agent decisions are unchanged; this effect is purely a Playground presentation. `prefers-reduced-motion` disables the reveal and rotation.

The circular reveal is adapted from [Lucian UX/UI Prompt #045](https://lucianlabs.dev/uxui-prompt/#045), MIT License © 2026 Seokwoooo, with attribution retained in source. The viewport frame is a custom addition.
 Run one of four demonstration tasks: search instances, create a mock instance, change the custom region selector, or scroll to the bottom. Actions operate only inside the local demonstration page.

## Browser E2E regression tests

Five Chromium journeys exercise the **compiled application**: custom region selection,
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

1. Maintain the [Component Adapter contract](docs/architecture/component-adapters.md) and add browser E2E coverage in CI (a local Chromium smoke test passed).
2. Adapt selected, reviewed `kiki-anti` DOM SDK techniques behind the `dom-engine` interface; test real Ant Design/Tiny widgets as separate fixture-backed adapters.
3. Add action policies, task verification and LLM planner with schema validation.
4. Introduce visual observations and a browser extension/runtime after the DOM path stabilizes.
