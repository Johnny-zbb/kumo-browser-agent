# Local LLM bridge and Action Policy (v0.4)

## Trust boundaries

- Browser never receives `KUMO_LLM_API_KEY`. OpenAI-compatible transport is initialized in the Node server only.
- The in-page Playground is still limited to the *local authorized sandbox*. The HTTP endpoint **only proposes a single decision**, it never executes browser actions remotely.
- Model output is parsed and constrained against the current actionable refs **on both sides** of the bridge. Page text remains untrusted and is not allowed to override higher-level instructions.
- `SandboxActionPolicy` denies destructive targets and secret fields. Creation/submit/authorization actions require a **per-action user click** in a modal. Cancellation removes the pending approval request.
- This is a demonstration policy based on labels, not an enterprise-grade authorization or prompt-injection defense. Higher-risk deployment needs explicit operation allowlists, authentication, immutable action identities and audit logs.

## Run locally

```bash
export KUMO_LLM_ENDPOINT=http://127.0.0.1:1234/v1/chat/completions
export KUMO_LLM_MODEL=local-model
export KUMO_LLM_API_KEY=your-local-token
npm run dev
```

Open the developer inspector, choose **LLM · 本地模型**, then enter a task in the fixed dock. Without these variables, the LLM option is disabled and Demo mode remains usable. Node server binds to `127.0.0.1` only.

## HTTP surface

- `GET /api/agent/config`: `{llmConfigured:boolean}` only; never reveals the endpoint, model key or secret.
- `POST /api/agent/decision`: same-origin JSON with `task`, `snapshot`, and last 4 traces. The server validates shape/size; returns a validated **decision**, not a request to execute actions.
- Disallows cross-origin POST, limits body size, requires local Host, sets `no-store`, and bounds in-flight model requests. This endpoint is a local development service, **not safe to publish directly** without authentication, CSRF protections, rate limits, origin policy, and tenancy isolation.

## Current limits

The example verifier recognizes four demo tasks. Unknown tasks cannot be considered completed without independent evidence. Vision/Hybrid, cross-origin browsing and task execution on real cloud resources are not enabled.
