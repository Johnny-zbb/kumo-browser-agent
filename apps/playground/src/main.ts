import { BrowserDomPage } from '../../../packages/dom-engine/src/browser-dom-page.js';
import { ariaSelectAdapter } from '../../../packages/dom-engine/src/adapters/aria-select.js';
import { DemoPlanner } from './demo-planner.js';
import { runAgent } from '../../../packages/agent-core/src/run-agent.js';
import type { AgentTrace, PagePort, PageSnapshot } from '../../../packages/agent-core/src/types.js';
import { AgentModeView } from './agent-mode.js';
import { DevInspector } from './dev-inspector.js';

const root = document.getElementById('sandbox') as HTMLElement;
const page = new BrowserDomPage(root, [ariaSelectAdapter]);
const planner = new DemoPlanner();
const agentMode = new AgentModeView();
const inspector = new DevInspector();
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const text = (value: unknown) => document.createTextNode(String(value));
let current: AbortController | null = null;
let latestSnapshot: PageSnapshot | null = null;
let instanceCount = 3;

function entry(value: string, className = ''): HTMLElement {
  const item = document.createElement('div');
  item.className = `trace-item ${className}`;
  item.append(text(value));
  return item;
}

function renderSnapshot(snapshot: PageSnapshot): void {
  latestSnapshot = snapshot;
  const output = latestSnapshot.elements.map((node) => `[ref=e${node.ref}] ${node.role} "${node.name}"${node.value !== undefined ? ` value=${JSON.stringify(node.value)}` : ''}${node.disabled ? ' [disabled]' : ''}${node.actions ? ` [actions=${node.actions.join(',')}]` : ''}`).join('\n');
  $('snapshot').textContent = `Snapshot #${latestSnapshot.id}\n${output}\n\nVisible text excerpt:\n${latestSnapshot.text}\n\nScroll: ${Math.round(latestSnapshot.viewport.scrollTop)}/${latestSnapshot.viewport.scrollHeight}`;
}

async function refreshSnapshot(): Promise<void> {
  renderSnapshot(await page.observe());
}

function renderTrace(trace: AgentTrace): void {
  const action = trace.decision.kind === 'act' ? `${trace.decision.action.kind}${'ref' in trace.decision.action ? ` e${trace.decision.action.ref}` : ''}` : trace.decision.kind;
  $('timeline').prepend(entry(`#${trace.turn}  ${action}  ·  ${trace.decision.reason}${trace.error ? ` · ${trace.error}` : ''}`, trace.actionResult === 'error' ? 'error' : ''));
  agentMode.update(trace.turn, trace.decision.reason);
}

// Playback pacing belongs to the demo, never to agent-core or the DOM engine.
// It makes observe/act/observe visible without altering the actual decisions.
const demonstratedPage: PagePort = {
  observe: () => page.observe(),
  execute: (action, observation) => page.execute(action, observation),
  async settle() {
    await page.settle();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 300));
    }
  }
};

async function begin(task: string): Promise<void> {
  if (current) return;
  const controller = new AbortController();
  current = controller;
  const input = $('task') as HTMLInputElement;
  const runButton = $('run') as HTMLButtonElement;
  input.disabled = true;
  runButton.textContent = '■ 停止任务';
  runButton.setAttribute('aria-label', '停止 Agent 任务');
  $('inspect').setAttribute('disabled', '');
  $('timeline').replaceChildren();
  $('status').textContent = `启动中 · ${task}`;
  let finalStatus: 'completed' | 'failed' | 'stopped' | 'max_turns' | 'error' = 'error';
  try {
    inspector.setOpen(false);
    await agentMode.enter(runButton);
    if (controller.signal.aborted) {
      finalStatus = 'stopped';
      $('status').textContent = 'STOPPED · 用户在启动时取消';
      return;
    }
    $('status').textContent = `RUNNING · ${task}`;
    const result = await runAgent(task, demonstratedPage, planner, {
      maxTurns: 12,
      signal: controller.signal,
      onTrace: renderTrace,
      onObserve: (snapshot, turn) => {
        renderSnapshot(snapshot);
        agentMode.update(turn, '观察页面快照');
      }
    });
    finalStatus = result.status;
    $('status').textContent = `${result.status.toUpperCase()} · ${result.reason} · ${result.history.length} turns`;
  } catch (error) {
    $('status').textContent = `ERROR · ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    agentMode.leave(finalStatus);
    current = null;
    input.disabled = false;
    runButton.textContent = '✦ 启动 Agent';
    runButton.setAttribute('aria-label', '启动 Agent 任务');
    $('inspect').removeAttribute('disabled');
    await refreshSnapshot();
  }
}

$('task-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (current) {
    current.abort();
    // Exit immediately even if the initial circular reveal is still underway.
    agentMode.leave('stopped');
    $('status').textContent = 'STOPPING · 正在取消任务';
    return;
  }
  const task = ($('task') as HTMLInputElement).value.trim();
  if (!task) {
    $('status').textContent = '请输入任务描述';
    ($('task') as HTMLInputElement).focus();
    return;
  }
  void begin(task);
});
$('inspect').addEventListener('click', () => void refreshSnapshot());
$('search-btn').addEventListener('click', () => {
  const keyword = ($('search') as HTMLInputElement).value;
  $('search-result').textContent = `筛选结果：${keyword}`;
  for (const row of document.querySelectorAll<HTMLElement>('.resource-row')) row.hidden = !row.textContent?.toLowerCase().includes(keyword.toLowerCase());
});
$('create-btn').addEventListener('click', () => {
  $('create-dialog').hidden = false;
  // Every observed ref is scoped to the current snapshot; after DOM change it is reobserved.
});
$('cancel-create').addEventListener('click', () => { $('create-dialog').hidden = true; });
$('confirm-create').addEventListener('click', () => {
  const value = ($('instance-name') as HTMLInputElement).value.trim();
  if (!value) { $('create-feedback').textContent = '请填写实例名称'; return; }
  instanceCount++;
  const el = document.createElement('div');
  el.className = 'resource-row';
  el.textContent = `ECS · ${value} · running · ID-${instanceCount}`;
  $('instance-list').prepend(el);
  $('create-feedback').textContent = `已创建实例：${value}`;
  $('create-dialog').hidden = true;
});
root.addEventListener('scroll', () => { if (!current) void refreshSnapshot(); });
void refreshSnapshot();

// Minimal accessible-select fixture; the adapter only invokes DOM events.
// All application-specific state transitions are owned by this page.
$('region-select').addEventListener('click', () => {
  const combobox = $('region-select');
  const menu = $('region-options');
  const opening = combobox.getAttribute('aria-expanded') !== 'true';
  combobox.setAttribute('aria-expanded', String(opening));
  menu.hidden = !opening;
});
for (const option of document.querySelectorAll<HTMLElement>('#region-options [role="option"]')) {
  option.addEventListener('click', () => {
    const value = option.dataset.value ?? option.textContent?.trim() ?? '';
    $('region-select').setAttribute('aria-valuetext', value);
    $('region-select').textContent = `${value} ▾`;
    $('region-select').setAttribute('aria-expanded', 'false');
    $('region-options').hidden = true;
    $('region-feedback').textContent = `当前区域：${value}`;
    for (const peer of document.querySelectorAll<HTMLElement>('#region-options [role="option"]')) {
      peer.setAttribute('aria-selected', String(peer === option));
    }
  });
}
