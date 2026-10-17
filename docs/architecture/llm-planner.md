# LLM Planner (opt-in, server-side)

The first real-model adapter is optional: `LlmPlanner` in `packages/agent-core` receives a `DecisionModelPort`, builds a bounded JSON prompt from the current semantic tree, allowed ref targets, task and recent trace, then parses a **strict JSON decision**.

- **No arbitrary tools**: only `click`, `input`, `selectOption`, `scroll`, `done`, `fail`. Reject unknown keys, refs absent from the current observation, disabled targets and actions not advertised by target capabilities.
- **Page text is untrusted**: prompt separates data from instructions; this mitigates but does not eliminate prompt injection. Before production control add an explicit action policy/approval gate and audit for destructive operations.
- **Never trust model `done`**: configure `TaskVerifierPort` in `runAgent`, independent from model text. The rule-based Playground remains the default until real-model interactions have reproducible browser fixtures.
- **Secrets remain server-side**: `OpenAICompatibleModel` is a Node transport, not a browser bundle. It requires HTTPS except loopback HTTP, enforces timeouts, and does not log credentials. Do not expose a generic unauthenticated model proxy to the web.
- **Current boundary**: this PR provides an injectable real-model planner and a server-side CLI for a saved snapshot. It does not yet run a real LLM autonomously through the Playground browser UI. A secure authenticated server runtime and production task-specific verifier are future work.

## Try planning against a saved snapshot

```bash
npm run build
export KUMO_LLM_ENDPOINT="https://your-model-provider.example/v1/chat/completions"
export KUMO_LLM_MODEL="your-model-name"
export KUMO_LLM_API_KEY="your-api-key"
node scripts/llm-plan.mjs "查找实例详情" path/to/snapshot.json
```

The CLI prints a single validated decision. It **does not execute** that decision; use an explicitly authorized browser runtime with a configured verifier for that.
