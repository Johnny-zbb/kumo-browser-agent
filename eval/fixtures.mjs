/** Synthetic, deterministic and credential-free browser tasks. Not a real-world success benchmark. */
const searches = [
  ['search-agent', 'agent'], ['search-kumo', 'kumo'],
  ['search-demo', 'demo'], ['search-prod', 'prod']
];
const details = [
  ['details-agent', 'agent-prod'], ['details-kumo', 'kumo-dev'],
  ['details-demo', 'demo-west'], ['details-ops', 'ops-east']
];
const tabs = [
  ['tab-logs', '日志'], ['tab-metrics', '监控'],
  ['tab-alerts', '告警'], ['tab-settings', '配置']
];
const dialogs = [
  ['dialog-network', '网络'], ['dialog-storage', '存储'],
  ['dialog-security', '安全'], ['dialog-compute', '计算']
];

export const EVAL_CASES = Object.freeze([
  ...searches.map(([id, target]) => Object.freeze({ id, category: 'search', target, task: `在实例列表中搜索 ${target}，确认搜索结果` })),
  ...details.map(([id, target]) => Object.freeze({ id, category: 'details', target, task: `在实例列表中打开 ${target} 这一行的详情` })),
  ...tabs.map(([id, target]) => Object.freeze({ id, category: 'tab', target, task: `打开 ${target} 标签页，确认内容出现` })),
  ...dialogs.map(([id, target]) => Object.freeze({ id, category: 'dialog', target, task: `展开 ${target} 面板，再查看它的内容` }))
]);

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeJs = value => JSON.stringify(value).replace(/</g, '\\u003c');

export function getEvalCase(id) {
  return EVAL_CASES.find(item => item.id === id);
}

export function fixtureHtml(item) {
  if (!getEvalCase(item?.id)) throw new Error('eval_unknown_case');
  const result = '<p id="eval-result" data-eval-result data-state="pending">尚未完成</p>';
  const finish = `const finish=()=>{const result=document.querySelector('#eval-result');result.dataset.state=${safeJs(item.id)};result.textContent='完成：${escapeHtml(item.id)}';};`;
  let body;
  let script;
  if (item.category === 'search') {
    body = `<section aria-label="实例搜索"><label for="query">实例关键词</label><input id="query" aria-label="实例关键词"><button id="go">查询</button></section>`;
    script = `${finish}document.querySelector('#go').addEventListener('click',()=>{if(document.querySelector('#query').value===${safeJs(item.target)})finish();});`;
  } else if (item.category === 'details') {
    const rows = [...new Set(['agent-prod', 'kumo-dev', 'demo-west', 'ops-east'])];
    body = `<table><thead><tr><th>实例名称</th><th>操作</th></tr></thead><tbody>${rows.map(name => `<tr><td>${escapeHtml(name)}</td><td><button type="button" data-row="${escapeHtml(name)}">查看详情</button></td></tr>`).join('')}</tbody></table>`;
    script = `${finish}document.querySelectorAll('[data-row]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.row===${safeJs(item.target)})finish();}));`;
  } else if (item.category === 'tab') {
    body = `<nav aria-label="实例导航">${['概览', '日志', '监控', '告警', '配置'].map(name => `<button type="button" data-tab="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('')}</nav>`;
    script = `${finish}document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{if(btn.dataset.tab===${safeJs(item.target)})finish();}));`;
  } else if (item.category === 'dialog') {
    body = `<button type="button" id="open">展开${escapeHtml(item.target)}面板</button><div id="dialog-host"></div>`;
    script = `${finish}document.querySelector('#open').addEventListener('click',()=>{const host=document.querySelector('#dialog-host');host.innerHTML=${safeJs(`<dialog open><h2>${item.target}面板</h2><button type="button" id="inspect">查看${item.target}内容</button></dialog>`)};host.querySelector('#inspect').addEventListener('click',finish);});`;
  } else throw new Error('eval_unknown_category');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>Kumo Eval - ${escapeHtml(item.id)}</title></head><body><main id="workspace"><h1>Kumo Agent 任务测试</h1>${body}${result}</main><script>${script}</script></body></html>`;
}

function findTarget(snapshot, name) {
  return snapshot.elements.find(el => el.name === name && !el.disabled);
}
function nestedTarget(nodes, name) {
  for (const node of nodes) {
    if (node.role === 'row' && node.name?.includes(name)) {
      const search = list => {
        for (const item of list) {
          if (item.ref !== undefined && item.name === '查看详情') return item.ref;
          const found = search(item.children ?? []);
          if (found !== undefined) return found;
        }
      };
      return search(node.children ?? []);
    }
    const result = nestedTarget(node.children ?? [], name);
    if (result !== undefined) return result;
  }
}

/** Reference planner for runtime regression only. Never score this as LLM accuracy. */
export function createBaselinePlanner(item) {
  return {
    async decide(_task, snapshot) {
      if (snapshot.text.includes(`完成：${item.id}`)) return { kind: 'done', reason: '页面出现目标完成状态' };
      const click = (ref, reason) => ref === undefined
        ? { kind: 'fail', reason: `无法定位目标：${reason}` }
        : { kind: 'act', action: { kind: 'click', ref }, reason };
      if (item.category === 'search') {
        const input = findTarget(snapshot, '实例关键词');
        if (!input) return { kind: 'fail', reason: '没有搜索输入框' };
        if (input.value !== item.target) return { kind: 'act', action: { kind: 'input', ref: input.ref, value: item.target }, reason: '填写查询关键词' };
        return click(findTarget(snapshot, '查询')?.ref, '触发搜索');
      }
      if (item.category === 'details') return click(nestedTarget(snapshot.tree, item.target), '点击指定实例行的详情');
      if (item.category === 'tab') return click(findTarget(snapshot, item.target)?.ref, '切换标签页');
      if (item.category === 'dialog') {
        const inspect = findTarget(snapshot, `查看${item.target}内容`);
        return click(inspect?.ref ?? findTarget(snapshot, `展开${item.target}面板`)?.ref, '打开面板并查看内容');
      }
      return { kind: 'fail', reason: '未知基线场景' };
    }
  };
}
