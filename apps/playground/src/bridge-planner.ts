import type { AgentTrace, Decision, PageSnapshot, PlannerPort } from '../../../packages/agent-core/src/types.js';
import { parseModelDecision } from '../../../packages/agent-core/src/llm-planner.js';

/** Same-origin, opt-in local model bridge. No API key may ever enter the browser. */
export class BridgePlanner implements PlannerPort {
  async decide(task: string, snapshot: PageSnapshot, history: readonly AgentTrace[], signal?: AbortSignal): Promise<Decision> {
    const recentHistory = history.slice(-4).map(item => ({
      turn: item.turn, decision: item.decision, actionResult: item.actionResult,
      actionVerification: item.actionVerification, taskVerification: item.taskVerification
    }));
    const response = await fetch('/api/agent/decision', {
      method: 'POST', credentials: 'omit', cache: 'no-store',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task, snapshot, history: recentHistory }), ...(signal ? { signal } : {})
    });
    if (!response.ok) throw new Error(`模型服务返回 HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!payload || typeof payload !== 'object' || !('decision' in payload)) throw new Error('bridge_invalid_response');
    return parseModelDecision(JSON.stringify(payload.decision), snapshot);
  }
}
