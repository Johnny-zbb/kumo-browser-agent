/** Aggregate measured outcomes. Never mix deterministic baselines with real-model results. */
export function summarizeEvaluation({ mode, model = null, records, startedAt }) {
  if (!['baseline', 'llm'].includes(mode)) throw new Error('eval_invalid_mode');
  if (!Array.isArray(records) || records.length === 0) throw new Error('eval_no_records');
  const passed = records.filter(item => item.passed).length;
  const avg = key => Number((records.reduce((sum, row) => sum + row[key], 0) / records.length).toFixed(2));
  const failures = {};
  for (const row of records) {
    if (!row.passed) failures[row.failureKind] = (failures[row.failureKind] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    mode,
    model: mode === 'llm' ? model : null,
    fixtureSet: 'kumo-synthetic-v1',
    startedAt,
    total: records.length,
    passed,
    failed: records.length - passed,
    successRate: Number((passed / records.length).toFixed(4)),
    averageTurns: avg('turns'),
    averageLatencyMs: avg('latencyMs'),
    averageModelCalls: avg('modelCalls'),
    failureKinds: failures,
    records
  };
}

export function classifyFailure({ status, reason, error }) {
  if (error) return 'runtime_error';
  if (status === 'approval_required') return 'approval_required';
  if (status === 'max_turns') return 'max_turns';
  if (status === 'stopped') return 'stopped';
  if (/model_|llm_http_|规划|决策失败/.test(reason)) return 'model_error';
  if (/动作失败|动作结果|stale_ref|stale_snapshot/.test(reason)) return 'action_error';
  if (/无法确认|验证/.test(reason)) return 'verification_failed';
  if (/安全策略|用户未批准/.test(reason)) return 'policy_blocked';
  return 'planner_failed';
}
