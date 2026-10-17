import type { AgentTrace, PagePort, PageSnapshot, PlannerPort, RunResult } from './types.js';

export interface AgentRunOptions {
  maxTurns?: number;
  signal?: AbortSignal;
  onTrace?: (trace: AgentTrace) => void;
  onObserve?: (snapshot: PageSnapshot, turn: number) => void;
}

/** Deep module: callers don't know about looping, retry policy, snapshot freshness or stop conditions. */
export async function runAgent(task: string, page: PagePort, planner: PlannerPort, options: AgentRunOptions = {}): Promise<RunResult> {
  const maxTurns = options.maxTurns ?? 10;
  const history: AgentTrace[] = [];
  let repeated = 0;
  let lastSignature = '';
  const result = (status: RunResult['status'], reason: string): RunResult => ({ status, reason, history: [...history] });

  if (!task.trim()) return result('failed', '任务不能为空');
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > 50) return result('failed', '最大轮次应为 1–50');

  for (let turn = 1; turn <= maxTurns; turn++) {
    if (options.signal?.aborted) return result('stopped', '用户取消');

    let snapshot;
    let decision;
    try {
      snapshot = await page.observe();
      if (options.signal?.aborted) return result('stopped', '用户取消');
      options.onObserve?.(snapshot, turn);
      decision = await planner.decide(task, snapshot, history);
    } catch (error) {
      return result('failed', `观察或决策失败：${error instanceof Error ? error.message : String(error)}`);
    }

    const trace: AgentTrace = { turn, snapshot, decision, actionResult: 'skipped' };
    if (decision.kind === 'done' || decision.kind === 'fail') {
      history.push(trace);
      options.onTrace?.(trace);
      return result(decision.kind === 'done' ? 'completed' : 'failed', decision.reason);
    }

    // Avoid infinite loops if a plan repeatedly performs the same action without changing observation.
    const signature = JSON.stringify({ action: decision.action, tree: snapshot.tree, elements: snapshot.elements, text: snapshot.text, viewport: snapshot.viewport });
    repeated = signature === lastSignature ? repeated + 1 : 0;
    lastSignature = signature;
    if (repeated >= 2) {
      history.push(trace);
      options.onTrace?.(trace);
      return result('failed', '页面没有进展：连续重复相同动作和观察结果');
    }

    if (options.signal?.aborted) return result('stopped', '用户取消');
    try {
      await page.execute(decision.action, snapshot);
      trace.actionResult = 'ok';
      history.push(trace);
      options.onTrace?.(trace);
      if (options.signal?.aborted) return result('stopped', '用户取消');
      await page.settle();
    } catch (error) {
      trace.actionResult = 'error';
      trace.error = error instanceof Error ? error.message : String(error);
      history.push(trace);
      options.onTrace?.(trace);
      // Stale / failed actions must not cause blind retries: next observation required.
      if (trace.error === 'stale_ref' || trace.error === 'stale_snapshot') continue;
      return result('failed', `动作失败：${trace.error}`);
    }
  }
  return result('max_turns', '达到最大执行轮次');
}
