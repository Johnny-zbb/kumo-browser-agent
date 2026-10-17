import type { AgentTrace, PagePort, PageSnapshot, PlannerPort, RunResult, TaskVerifierPort } from './types.js';
import { verifyActionEffect } from './action-verifier.js';
import type { ActionPolicyPort, ActionPolicyResult } from './action-policy.js';
import type { PageAction } from './types.js';

export interface AgentRunOptions {
  maxTurns?: number;
  signal?: AbortSignal;
  onTrace?: (trace: AgentTrace) => void;
  onObserve?: (snapshot: PageSnapshot, turn: number) => void;
  /** When present, a planner `done` is not trusted without independent evidence. */
  taskVerifier?: TaskVerifierPort;
  actionPolicy?: ActionPolicyPort;
  requestApproval?: (request: ActionPolicyResult, action: PageAction, snapshot: PageSnapshot, signal?: AbortSignal) => Promise<boolean>;
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
      decision = await planner.decide(task, snapshot, history, options.signal);
    } catch (error) {
      if (options.signal?.aborted) return result('stopped', '用户取消');
      return result('failed', `观察或决策失败：${error instanceof Error ? error.message : String(error)}`);
    }

    const trace: AgentTrace = { turn, snapshot, decision, actionResult: 'skipped' };
    if (decision.kind === 'done' || decision.kind === 'fail') {
      if (decision.kind === 'done' && options.taskVerifier) {
        try {
          trace.taskVerification = await options.taskVerifier.verify(task, snapshot);
        } catch (error) {
          trace.taskVerification = { status: 'inconclusive', reason: `验证器异常：${error instanceof Error ? error.message : String(error)}` };
        }
        if (options.signal?.aborted) return result('stopped', '用户取消');
      }
      history.push(trace);
      options.onTrace?.(trace);
      if (decision.kind === 'fail') return result('failed', decision.reason);
      if (trace.taskVerification && trace.taskVerification.status !== 'passed') {
        return result('failed', `无法确认任务完成：${trace.taskVerification.reason}`);
      }
      return result('completed', trace.taskVerification?.reason ?? decision.reason);
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
    if (options.actionPolicy) {
      const evaluation = options.actionPolicy.assess(decision.action, snapshot);
      trace.actionPolicy = { ...evaluation };
      if (evaluation.decision === 'deny') {
        trace.actionResult = 'skipped';
        history.push(trace);
        options.onTrace?.(trace);
        return result('failed', `安全策略拒绝动作：${evaluation.reason}`);
      }
      if (evaluation.decision === 'confirm') {
        if (!options.requestApproval) {
          history.push(trace);
          options.onTrace?.(trace);
          return result('approval_required', `缺少人工确认：${evaluation.reason}`);
        }
        let allowed = false;
        try { allowed = await options.requestApproval(evaluation, decision.action, snapshot, options.signal); }
        catch (error) {
          if (options.signal?.aborted) return result('stopped', '用户取消');
          trace.error = `approval_error: ${error instanceof Error ? error.message : String(error)}`;
        }
        if (options.signal?.aborted) return result('stopped', '用户取消');
        trace.actionPolicy.approved = allowed;
        if (!allowed) {
          history.push(trace);
          options.onTrace?.(trace);
          return result('failed', `用户未批准操作：${evaluation.reason}`);
        }
      }
    }
    if (options.signal?.aborted) return result('stopped', '用户取消');
    try {
      await page.execute(decision.action, snapshot);
      trace.actionResult = 'ok';
      if (options.signal?.aborted) {
        history.push(trace);
        options.onTrace?.(trace);
        return result('stopped', '用户取消');
      }
      await page.settle();
      if (options.signal?.aborted) {
        history.push(trace);
        options.onTrace?.(trace);
        return result('stopped', '用户取消');
      }
      // Execute success only means the browser accepted an event. Re-observe.
      const after = await page.observe();
      if (options.signal?.aborted) {
        history.push(trace);
        options.onTrace?.(trace);
        return result('stopped', '用户取消');
      }
      trace.actionVerification = verifyActionEffect(decision.action, snapshot, after);
      history.push(trace);
      options.onTrace?.(trace);
      if (trace.actionVerification.status === 'mismatch') {
        return result('failed', `动作结果与预期不符：${trace.actionVerification.reason}`);
      }
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
