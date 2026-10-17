import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SandboxActionPolicy } from '../dist/packages/agent-core/src/action-policy.js';
import { runAgent } from '../dist/packages/agent-core/src/run-agent.js';

const snapshot = (name = '确认创建') => ({
  id: 1, url: 'http://localhost:4173', title: 'test', text: '', tree: [],
  elements: [{ ref: 1, role: 'button', name, disabled: false, actions: ['click'] }],
  viewport: { scrollTop: 0, clientHeight: 200, scrollHeight: 200, atBottom: true }
});
const page = { observe: async () => snapshot(), execute: async () => { ++page.executed; }, settle: async () => {}, executed: 0 };
const planner = { decide: async () => ({ kind: 'act', reason: 'send', action: { kind: 'click', ref: 1 } }) };

test('safe click, destructive delete, and secret input have distinct policy outcomes', () => {
  const policy = new SandboxActionPolicy();
  assert.equal(policy.assess({kind:'click',ref:1},snapshot('查看详情')).decision,'allow');
  assert.equal(policy.assess({kind:'click',ref:1},snapshot('删除账号')).decision,'deny');
  assert.equal(policy.assess({kind:'click',ref:1},snapshot('确认创建')).decision,'confirm');
  const secret={...snapshot(),elements:[{ref:2,role:'textbox',name:'API Key',disabled:false,actions:['input']}]};
  assert.equal(policy.assess({kind:'input',ref:2,value:'secret'},secret).decision,'deny');
  assert.equal(policy.assess({kind:'click',ref:99},snapshot()).decision,'deny');
});

test('model action is never executed when approval is absent', async () => {
  page.executed=0;
  const result = await runAgent('创建一个实例',page,planner,{actionPolicy:new SandboxActionPolicy(),maxTurns:2});
  assert.equal(result.status,'approval_required');
  assert.equal(page.executed,0);
  assert.equal(result.history[0].actionPolicy.decision,'confirm');
});

test('explicit rejection blocks the action; explicit approval executes exactly once', async () => {
  page.executed=0;
  const opts={actionPolicy:new SandboxActionPolicy(),maxTurns:1};
  const denied=await runAgent('创建一个实例',page,planner,{...opts,requestApproval:async()=>false});
  assert.equal(denied.status,'failed');
  assert.equal(page.executed,0);
  const allowed=await runAgent('创建一个实例',page,planner,{...opts,requestApproval:async()=>true});
  assert.equal(allowed.status,'max_turns');
  assert.equal(page.executed,1);
  assert.equal(allowed.history[0].actionPolicy.approved,true);
});

test('abort during approval does not execute the action', async () => {
  page.executed=0;
  const signal=new AbortController();
  const result=await runAgent('创建一个实例',page,planner,{
    actionPolicy:new SandboxActionPolicy(),signal:signal.signal,
    requestApproval:async()=>{signal.abort();return true;}
  });
  assert.equal(result.status,'stopped');
  assert.equal(page.executed,0);
});
