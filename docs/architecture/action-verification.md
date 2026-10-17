# Action Verification and Task Completion

`AgentRunner` separates three assertions:

1. **Dispatched**: `PagePort.execute` returned without error (`trace.actionResult = ok`).
2. **Observed effect**: after `settle()` the runner takes a new `PageSnapshot` and classifies it (`trace.actionVerification`). `matched` proves an input/select value. `changed` only says a click/scroll changed something; it does **not** prove goal completion. `unconfirmed` requires further planning. Explicit value mismatch fails early.
3. **Goal verified**: `PlannerPort` may propose `done`, but `TaskVerifierPort` independently checks the final observation. `passed` is required when a verifier is configured. `rejected` and `inconclusive` both prevent completion. Exceptions are treated as inconclusive, not success.

All state transitions remain in `packages/agent-core`; the demo-specific completion criteria live in `apps/playground/src/demo-task-verifier.ts`. The verifier does not execute actions or mutate DOM. It can be replaced by an assertion-based verifier for other tasks, but must not be replaced by another unverified model claim.

## Guarantees and limits

- Cancellation is checked before and after action settlement; cancellation never reports a verified result.
- A stale observation/ref triggers a new observation rather than blindly replaying an action.
- A click can cause network updates, animations, or effects invisible to the current snapshot. This is reported as unconfirmed rather than assumed successful. For production, use task-specific observable conditions with bounded waits instead of extending arbitrary delays.
- The Playground's demo verifier is intentionally narrow: search, create, region, scroll. It does not prove external side effects such as provisioning a real cloud instance.
- The snapshot has a stable element ref for still-connected elements but observation IDs change. Action effects are checked against fresh observations.

See `tests/action-verification.test.mjs` and `tests/e2e/browser-journeys.test.mjs` for regression coverage.
