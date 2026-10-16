# Architecture (v0.2)

## Context

A browser agent has four responsibilities: **observation**, **planning**, **action** and **verification**. Snapshot (DOM) and screenshot (visual) are two possible observations, not two separate agent cores.

```text
                        ┌─────────────────────────┐
Task ──────────────────>│ AgentRunner             │
                        │ state / loop / budgets  │
                        └───────┬─────────┬───────┘
                                │         │
                         PlannerPort   PagePort
                                │         │
                         Demo / LLM  DOM / Vision / Hybrid
                                          │
                                   Browser Runtime
                                   (in-page/extension/CDP)
```

- **Domain**: task, observation, action, outcome. Must not depend on DOM APIs, model vendors or deployment transport.
- **Application**: orchestrates the loop; owns cancellation, stale action recovery, budgets and traces.
- **Infrastructure**: browser integration, semantic snapshot, stable references, actions, component adapters.
- **Presentation**: Playground is a replaceable demo shell; not part of the agent core.

## Component adapter direction

A component adapter should **recognize a rendered component**, **extract concise semantics** and optionally **execute component-level actions**. The engine (not the adapter) must own stable refs and validation. Standard HTML/ARIA is handled generically before adding library-specific adapters.

Avoid hard-coding `ti-*`, `tp-*`, Ant Design classes, Monaco or custom-component names inside the universal DOM traversal. Put those in `adapters/<component-family>` when a real fixture and test exist. See [Component Adapter v0.2](component-adapters.md) for the verified ARIA example, action contract and current limitations.

## Design decisions

- Rename **site-agent → agent-core**, **dom-sdk → dom-engine** conceptually, but migrate behavior incrementally.
- Do **not** copy `target/web-sdk.js`, captured MHTML fixtures, or full Git history into a future public repository.
- **DOM** first; later extend observations to discriminated unions: `{kind:'dom'}`, `{kind:'visual'}`, `{kind:'hybrid'}`.
- Add `TaskVerifier` before trusting LLM `done` in a production workflow.
- Add a new `BrowserRuntime` adapter for Chrome Extension and Playwright. A website script cannot automate arbitrary cross-origin tabs by itself.
- Use observation-scoped element references. Invalid references trigger a fresh observe; do not blindly replay an action.

## Next milestones

1. Add regression fixtures for actual Ant Design/Tiny components; retain the registry/ref separation and add browser E2E in CI.
2. Build a `TaskVerifier` with independent completion criteria and basic action authorization policy.
3. Add one LLM planner with strict action schema and controlled prompt budgets.
4. Add visual observations and coordinate targets with viewport/screenshot version checks.
5. Add repeatable end-to-end tests and deploy the demo under the Kumo website.
