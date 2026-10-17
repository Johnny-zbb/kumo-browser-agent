import type { PageSnapshot, TaskVerification, TaskVerifierPort } from '../../../packages/agent-core/src/types.js';

/** Independent, deterministic task-success assertions for the local demo only. */
export class DemoTaskVerifier implements TaskVerifierPort {
  verify(task: string, snapshot: PageSnapshot): TaskVerification {
    let fulfilled: boolean;
    let criterion: string;
    if (/创建/.test(task)) {
      fulfilled = snapshot.text.includes('已创建实例：kumo-demo');
      criterion = '已创建实例：kumo-demo';
    } else if (/搜索|筛选/.test(task)) {
      fulfilled = snapshot.text.includes('筛选结果：agent');
      criterion = '筛选结果：agent';
    } else if (/区域|上海|北京|广州/.test(task)) {
      const wanted = /广州/.test(task) ? '华南-广州' : /北京/.test(task) ? '华北-北京四' : '华东-上海一';
      const selected = snapshot.elements.find((x) => x.role === 'combobox' && x.name === '区域');
      fulfilled = selected?.value === wanted && snapshot.text.includes(`当前区域：${wanted}`);
      criterion = `区域控件及页面反馈均为 ${wanted}`;
    } else if (/滚动/.test(task)) {
      fulfilled = snapshot.viewport.atBottom;
      criterion = '浏览器滚动容器已经到底';
    } else {
      return { status: 'inconclusive', reason: '该任务尚无独立验收规则' };
    }
    return fulfilled
      ? { status: 'passed', reason: `独立验证通过：${criterion}` }
      : { status: 'rejected', reason: `未达到验收条件：${criterion}` };
  }
}
