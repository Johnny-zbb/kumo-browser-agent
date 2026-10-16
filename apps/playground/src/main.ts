import { BrowserDomPage } from '../../../packages/dom-engine/src/browser-dom-page.js';
import { DemoPlanner } from './demo-planner.js';
import { runAgent } from '../../../packages/agent-core/src/run-agent.js';
import type { AgentTrace, PageSnapshot } from '../../../packages/agent-core/src/types.js';

const root = document.getElementById('sandbox') as HTMLElement;
const page = new BrowserDomPage(root);
const planner = new DemoPlanner();
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
  const output = latestSnapshot.elements.map((node) => `[ref=e${node.ref}] ${node.role} "${node.name}"${node.value !== undefined ? ` value=${JSON.stringify(node.value)}` : ''}${node.disabled ? ' [disabled]' : ''}`).join('\n');
  $('snapshot').textContent = `Snapshot #${latestSnapshot.id}\n${output}\n\nVisible text excerpt:\n${latestSnapshot.text}\n\nScroll: ${Math.round(latestSnapshot.viewport.scrollTop)}/${latestSnapshot.viewport.scrollHeight}`;
}

async function refreshSnapshot(): Promise<void> {
  renderSnapshot(await page.observe());
}

function renderTrace(trace: AgentTrace): void {
  const action = trace.decision.kind === 'act' ? `${trace.decision.action.kind}${'ref' in trace.decision.action ? ` e${trace.decision.action.ref}` : ''}` : trace.decision.kind;
  $('timeline').prepend(entry(`#${trace.turn}  ${action}  ·  ${trace.decision.reason}${trace.error ? ` · ${trace.error}` : ''}`, trace.actionResult === 'error' ? 'error' : ''));
}

async function begin(task: string): Promise<void> {
  if (current) return;
  current = new AbortController();
  $('run').setAttribute('disabled', '');
  $('inspect').setAttribute('disabled', '');
  $('stop').removeAttribute('disabled');
  $('timeline').replaceChildren();
  $('status').textContent = `Running · ${task}`;
  try {
    const result = await runAgent(task, page, planner, { maxTurns: 12, signal: current.signal, onTrace: renderTrace, onObserve: renderSnapshot });
    $('status').textContent = `${result.status.toUpperCase()} · ${result.reason} · ${result.history.length} turns`;
  } catch (error) {
    $('status').textContent = `ERROR · ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    current = null;
    $('run').removeAttribute('disabled');
    $('inspect').removeAttribute('disabled');
    $('stop').setAttribute('disabled', '');
    await refreshSnapshot();
  }
}

$('run').addEventListener('click', () => void begin(($('task') as HTMLInputElement).value));
$('stop').addEventListener('click', () => current?.abort());
for (const item of document.querySelectorAll<HTMLButtonElement>('[data-task]')) {
  item.addEventListener('click', () => { const task = item.dataset.task || ''; ($('task') as HTMLInputElement).value = task; void begin(task); });
}
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
