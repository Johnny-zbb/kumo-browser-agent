import type { Decision, PageSnapshot, PlannerPort } from '../../../packages/agent-core/src/types.js';

/** A deterministic teaching planner, not an LLM. Swap this adapter in phase 2. */
export class DemoPlanner implements PlannerPort {
  async decide(task: string, snapshot: PageSnapshot): Promise<Decision> {
    const find = (name: string) => snapshot.elements.find((x) => x.name.includes(name) && !x.disabled);
    if (/创建/.test(task)) {
      if (snapshot.text.includes('已创建实例：kumo-demo')) return { kind: 'done', reason: '已验证实例创建成功' };
      const input = find('实例名称');
      if (input && input.value !== 'kumo-demo') return { kind: 'act', action: { kind: 'input', ref: input.ref, value: 'kumo-demo' }, reason: '填写实例名称' };
      const confirm = find('确认创建');
      if (confirm) return { kind: 'act', action: { kind: 'click', ref: confirm.ref }, reason: '提交创建动作' };
      const create = find('新建实例');
      if (create) return { kind: 'act', action: { kind: 'click', ref: create.ref }, reason: '打开创建表单' };
      return { kind: 'fail', reason: '未找到创建入口' };
    }
    if (/搜索|筛选/.test(task)) {
      if (snapshot.text.includes('筛选结果：agent')) return { kind: 'done', reason: '已验证筛选结果' };
      const input = find('搜索实例');
      if (input && input.value !== 'agent') return { kind: 'act', action: { kind: 'input', ref: input.ref, value: 'agent' }, reason: '输入搜索关键字' };
      const search = find('执行搜索');
      if (search) return { kind: 'act', action: { kind: 'click', ref: search.ref }, reason: '执行搜索' };
      return { kind: 'fail', reason: '搜索控件缺失' };
    }
    if (/滚动/.test(task)) {
      if (snapshot.viewport.atBottom) return { kind: 'done', reason: '已验证滚动终点' };
      return { kind: 'act', action: { kind: 'scroll', direction: 'down' }, reason: '向下滚动页面' };
    }
    return { kind: 'fail', reason: 'v0 规则规划器只支持：搜索实例 / 创建实例 / 滚动页面' };
  }
}
