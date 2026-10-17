#!/usr/bin/env node
// Server-side/manual demo: plan one decision from a saved PageSnapshot JSON.
// No browser API keys, no automatic execution. Usage:
// KUMO_LLM_ENDPOINT=https://.../v1/chat/completions KUMO_LLM_MODEL=... KUMO_LLM_API_KEY=... \
//   node scripts/llm-plan.mjs '搜索 agent 实例' snapshot.json
import { readFile } from 'node:fs/promises';
import { LlmPlanner } from '../dist/packages/agent-core/src/llm-planner.js';
import { OpenAICompatibleModel } from '../dist/packages/llm-client/src/openai-compatible.js';

const [task, file] = process.argv.slice(2);
if (!task || !file) {
  console.error('Usage: node scripts/llm-plan.mjs "任务文本" snapshot.json');
  process.exitCode = 2;
} else {
  try {
    const snapshot = JSON.parse(await readFile(file, 'utf8'));
    const model = new OpenAICompatibleModel({
      endpoint: process.env.KUMO_LLM_ENDPOINT ?? '',
      model: process.env.KUMO_LLM_MODEL ?? '',
      apiKey: process.env.KUMO_LLM_API_KEY ?? ''
    });
    const decision = await new LlmPlanner(model).decide(task, snapshot, []);
    console.log(JSON.stringify(decision, null, 2));
  } catch (error) {
    console.error(`Planning failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
