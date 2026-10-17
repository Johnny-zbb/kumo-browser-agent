import type { ActionVerification, PageAction, PageSnapshot } from './types.js';

/**
 * Classify *observable* effects. 'changed' means something changed, not that
 * the requested task succeeded. Clicks cannot be universally verified here.
 */
export function verifyActionEffect(action: PageAction, before: PageSnapshot, after: PageSnapshot): ActionVerification {
  if (action.kind === 'input' || action.kind === 'selectOption') {
    const target = after.elements.find((node) => node.ref === action.ref);
    if (!target || target.value === undefined) {
      return { status: 'unconfirmed', reason: '目标已消失或没有可读取的值；需要继续观察' };
    }
    return target.value === action.value
      ? { status: 'matched', reason: '重新观察后，目标值符合预期' }
      : { status: 'mismatch', reason: `目标值未更新：预期 ${JSON.stringify(action.value)}，实际 ${JSON.stringify(target.value)}` };
  }

  if (action.kind === 'scroll') {
    if (after.viewport.scrollTop !== before.viewport.scrollTop) {
      return { status: 'changed', reason: '重新观察后，滚动位置已变化' };
    }
    return { status: 'unconfirmed', reason: '滚动位置未变化；可能已到边界或目标未滚动' };
  }

  const semanticChanged = before.text !== after.text ||
    JSON.stringify(before.elements) !== JSON.stringify(after.elements) ||
    JSON.stringify(before.tree) !== JSON.stringify(after.tree);
  return semanticChanged
    ? { status: 'changed', reason: '重新观察后，页面语义发生变化；不等于任务完成' }
    : { status: 'unconfirmed', reason: '点击已发出，但未观察到可确认的语义变化' };
}
