// Project only bounded synthetic target context; never serialize raw model output or snapshots.
const label = node => ({ role: node.role.slice(0, 40), ...(node.name ? { name: node.name.slice(0, 90) } : {}) });

function targetContext(nodes, ref, ancestors = []) {
  for (const node of nodes) {
    if (node.ref === ref) return ancestors.slice(-12).map(label);
    const found = targetContext(node.children ?? [], ref, [...ancestors, node]);
    if (found) return found;
  }
  return undefined;
}

export function diagnosticErrorCode(error) {
  const message = error instanceof Error ? error.message : String(error);
  const known = /^(llm_http_\d{3}|llm_response_too_large|llm_invalid_response|llm_missing_content|invalid_model_timeout|model_response_too_large|model_invalid_json|model_invalid_decision|model_invalid_action|model_unknown_ref|model_action_not_allowed|stale_ref|stale_snapshot)$/;
  if (known.test(message)) return message;
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return error.name;
  return 'unclassified_error';
}

export function summarizeAgentTrace(trace) {
  const { decision, snapshot } = trace;
  const action = decision.kind === 'act' ? decision.action : null;
  const target = action?.ref === undefined ? null : snapshot.elements.find(node => node.ref === action.ref);
  return {
    // Input/select values and free-form reasons are deliberately omitted.
    decision: { kind: decision.kind, ...(action ? { action: {
      kind: action.kind,
      ...(action.ref === undefined ? {} : { ref: action.ref }),
      ...(action.kind === 'scroll' ? { direction: action.direction } : {})
    } } : {}) },
    target: target ? { ref: target.ref, ...label(target), ancestors: targetContext(snapshot.tree, target.ref) ?? [] } : null,
    dispatch: trace.actionResult,
    actionVerification: trace.actionVerification?.status ?? null,
    taskVerification: trace.taskVerification?.status ?? null,
    policy: trace.actionPolicy?.decision ?? null,
    ...(trace.error ? { errorCode: diagnosticErrorCode(trace.error) } : {})
  };
}
