import type { PageAction, PageSnapshot } from './types.js';

export interface ActionPolicyResult {
  decision: 'allow' | 'confirm' | 'deny';
  reason: string;
}

export interface ActionPolicyPort {
  assess(action: PageAction, snapshot: PageSnapshot): ActionPolicyResult;
}

/** Conservative heuristic for the local demo, NOT a production authorization system. */
export class SandboxActionPolicy implements ActionPolicyPort {
  assess(action: PageAction, snapshot: PageSnapshot): ActionPolicyResult {
    if (action.kind === 'scroll') return { decision: 'allow', reason: '滚动属于低风险操作' };
    const target = snapshot.elements.find(el => el.ref === action.ref);
    if (!target || target.disabled || !target.actions?.includes(action.kind)) {
      return { decision: 'deny', reason: '目标不存在、已禁用或不支持该操作' };
    }
    const label = `${target.name} ${target.role}`;
    if (/(删除|销毁|释放|清空|抹除|delete|destroy|erase|wipe|remove|format)/i.test(label)) {
      return { decision: 'deny', reason: `高风险目标已被禁止：${target.name}` };
    }
    if (action.kind === 'input') {
      if (/(密码|密钥|凭证|令牌|私钥|password|secret|token|credential|api.?key)/i.test(label)) {
        return { decision: 'deny', reason: '不允许通过 Agent 输入敏感凭证' };
      }
      return { decision: 'allow', reason: '普通字段输入' };
    }
    if (action.kind === 'selectOption') return { decision: 'allow', reason: '选择组件选项' };
    if (/(确认|提交|创建|保存|授权|支付|购买|发送|发布|执行|confirm|submit|create|save|grant|pay|purchase|send|publish)/i.test(label)) {
      return { decision: 'confirm', reason: `需要人工确认操作：${target.name}` };
    }
    return { decision: 'allow', reason: '普通点击' };
  }
}
