# Kumo Browser Agent Eval v0.1

The evaluation runner executes real `PlaywrightPagePort` → DOM Engine → `runAgent` actions in an **isolated Chromium profile** against 16 **synthetic, localhost-only fixtures**. It is a development regression tool, not a benchmark for unrestricted internet browsing.

## What is measured?

The 16 cases cover 4 skills (4 examples each):

| Category | Task | Why it matters |
| --- | --- | --- |
| Search | Fill a textbox, press search, observe the result | Multi-turn input and click |
| Details | Choose the correct `查看详情` button in a table of duplicate controls | Contextual semantic tree |
| Tab | Choose among five visible tabs | Target selection and state verification |
| Dialog | Open a named panel, then operate a newly rendered button | Fresh observation across DOM updates |

Each case starts from a fresh, dedicated browser context and clean fixture document. A task is **successful only when** all of these hold: the Agent Runner reports `completed`, the independent `TaskVerifier` confirms the current page's state **and** completion text, the final fixture DOM state matches the case ID, and Chromium reports no page errors. The planner cannot award itself a pass by returning `done`.

The output is a machine-readable JSON file with overall success rate, average turns, per-case end-to-end wall-clock latency, model invocation count, action effects and categorized failures (`model_error`, `action_error`, `verification_failed`, `max_turns`, `policy_blocked`, `runtime_error`, etc.). Latency includes browser context setup and page load per case (not the shared browser process launch); it is not pure inference latency. Counts are exact per run; there is no statistical confidence interval or reproducibility guarantee across providers.

## CI: baseline (not model quality)

```bash
npm install
npx playwright install chromium
npm run eval:baseline
```

CI executes all **16** synthetic cases with `createBaselinePlanner`, a scenario-aware *scripted* planner. It does **not** call a model. The score only protects browser runtime, DOM parsing and verification behavior from regressions. CI archives `test-results/eval/baseline-latest.json`.

A restricted local environment where Chromium cannot navigate HTTP localhost may use:

```bash
KUMO_EVAL_ISOLATED=1 KUMO_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run eval:baseline
```

The isolated fallback loads identical generated fixture HTML in a blank document but **does not test the local HTTP serving path**; GitHub CI runs the normal HTTP mode.

## Opt-in real LLM (never CI)

First copy `.env.example` to **gitignored** `.env.local`, and configure the Groq or Gemini endpoint, model ID, and API key on your own machine. Do not paste keys into chat, source, GitHub issues, trace JSON or screenshots. Only synthetic page content is sent to the provider.

```bash
npm run eval:llm
```

The **LLM mode defaults to four representative tasks** (one per category), to limit free-tier usage; increase cautiously with the flags below. Each Agent turn normally costs one remote model request. Rate limits, available models and free plan conditions may change. Avoid real credentials or production applications in these fixtures. Real-model mode is not triggered by CI or the baseline command.

```bash
# npm run eval:llm -- --cases=search-agent,details-kumo --limit=2 --max-turns=8
# Default report: test-results/eval/llm-latest.json
npm run eval:llm -- --cases=search-agent,details-kumo --limit=2
```

`--cases` is a comma-separated list of stable IDs in `eval/fixtures.mjs`; `--limit` controls the total executed cases (1–16); `--max-turns` bounds each task (1–30); `--report` selects the local JSON output. LLM mode requires all three `KUMO_LLM_*` variables. Reports do not record raw snapshots, model responses, API keys or HTTP headers, but they include task IDs and failure reasons; inspect before sharing externally. **Failed evaluations exit nonzero and still write their report.**

## Interpretation and future work

A 16/16 baseline proves the scripted controller can operate these fixtures; **it does not imply 100% success for Groq, Gemini or real websites**. Compare only reports from the same fixture version, environment, model and settings. Subsequent evaluation iterations should include long pages, nested scrolling, adverse/untrusted content, transient failures and complex UI component libraries, with a separate human-reviewed scoring rubric for real pages. Keep safety-denial tests separate from the completion rate to avoid incentivizing inappropriate actions.
