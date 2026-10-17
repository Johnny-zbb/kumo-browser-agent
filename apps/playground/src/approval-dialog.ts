import type { ActionPolicyResult } from '../../../packages/agent-core/src/action-policy.js';
import type { PageAction, PageSnapshot } from '../../../packages/agent-core/src/types.js';

export function requestActionApproval(request: ActionPolicyResult, action: PageAction, snapshot: PageSnapshot, signal?: AbortSignal): Promise<boolean> {
  const dialog = document.getElementById('agent-approval') as HTMLElement;
  const description = document.getElementById('approval-description') as HTMLElement;
  const approve = document.getElementById('approve-action') as HTMLButtonElement;
  const reject = document.getElementById('reject-action') as HTMLButtonElement;
  const target = 'ref' in action ? snapshot.elements.find(node => node.ref === action.ref) : undefined;
  description.textContent = `${request.reason}。目标：${target?.name ?? '页面'}；动作：${action.kind}${'value' in action ? `；值：${action.value}` : ''}`;
  dialog.hidden = false;
  approve.focus();
  return new Promise<boolean>(resolve => {
    let settled = false;
    const finish = (allowed: boolean): void => {
      if (settled) return;
      settled = true;
      dialog.hidden = true;
      approve.removeEventListener('click', yes);
      reject.removeEventListener('click', no);
      signal?.removeEventListener('abort', no);
      resolve(allowed);
    };
    const yes = (): void => finish(true);
    const no = (): void => finish(false);
    approve.addEventListener('click', yes);
    reject.addEventListener('click', no);
    signal?.addEventListener('abort', no, { once: true });
    if (signal?.aborted) no();
  });
}
