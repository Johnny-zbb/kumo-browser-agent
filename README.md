# Kumo Browser Agent

A small, clean TypeScript monorepo for a **browser agent that can eventually use DOM, Vision or Hybrid perception**.

> Status: `0.1.0` / DOM playground. **This version uses a deterministic demonstration planner, not an LLM.** It does not control arbitrary third-party websites.

## Quick start

```bash
npm install
npm run typecheck
npm test
npm run dev
```

Visit `http://localhost:4173`. Run one of the three demonstration tasks: search instances, create a mock instance, or scroll to the bottom. Actions operate only inside the local demonstration page.

## Workspace

- `packages/agent-core`: task language (`PageSnapshot`, `PageAction`, `Decision`) and the agent loop. No browser DOM dependencies.
- `packages/dom-engine`: in-page DOM snapshot and action implementation, including the `ComponentAdapterRegistry` extension point.
- `apps/playground`: standalone controlled demo and deterministic planner.
- `tests`: core loop tests; includes stale refs, cancellation, no-progress detection, and max turns.
- `docs/architecture`: design decisions and next milestones.

## Design principles

1. **DDD-lite**: domain vocabulary is independent of the browser; application orchestration is a deep module.
2. **Ports & Adapters**: the core depends on interfaces, not a specific page implementation.
3. **Observe → Decide → Act → Observe**: an action always belongs to an observation and is followed by a fresh observation.
4. **Explicit security boundary**: an in-page agent can only touch DOM it is permitted to access. Extension/CDP runtimes need separate authorization.
5. **Honest capability**: Vision/Hybrid, complex components, Shadow DOM and cross-origin frames are planned, not claimed to be shipped.

See [architecture](docs/architecture/overview.md) for the upgrade path, including how to bring *audited, original* `kiki-anti` DOM SDK behaviors across without copying the original reverse-engineering history or third-party bundles.

## Repository

GitHub: <https://github.com/Johnny-zbb/kumo-browser-agent>

This repository starts from an independent, clean source tree. It does not include Git history, reverse-engineering targets, captured pages or third-party bundles from the private `kiki-anti` research repository.

The initial repository is public. A software license has not yet been selected; do not assume the code is licensed for reuse until one is added.

## Next steps

1. Verify actual browser interactions and add end-to-end coverage in CI.
2. Reuse selected, reviewed `kiki-anti` DOM SDK techniques behind the `dom-engine` interface; add component-specific adapters from tested fixtures.
3. Add action policies, task verification and LLM planner with schema validation.
4. Introduce visual observations and a browser extension/runtime after the DOM path stabilizes.
