/** The language spoken by the Agent. No DOM / browser types leak into the domain. */
export interface PageElement {
  ref: number;
  role: string;
  name: string;
  value?: string;
  disabled: boolean;
  /** Actions explicitly supported by this target (useful for custom widgets). */
  actions?: readonly PageAction['kind'][];
}

export interface PageSnapshot {
  id: number;
  url: string;
  title: string;
  elements: readonly PageElement[];
  text: string;
  viewport: { scrollTop: number; clientHeight: number; scrollHeight: number; atBottom: boolean };
}

export type PageAction =
  | { kind: 'click'; ref: number }
  | { kind: 'input'; ref: number; value: string }
  | { kind: 'selectOption'; ref: number; value: string }
  | { kind: 'scroll'; direction: 'up' | 'down'; ref?: number };

export type Decision =
  | { kind: 'act'; action: PageAction; reason: string }
  | { kind: 'done'; reason: string }
  | { kind: 'fail'; reason: string };

export interface PagePort {
  observe(): Promise<PageSnapshot>;
  execute(action: PageAction, observed: PageSnapshot): Promise<void>;
  settle(): Promise<void>;
}

export interface PlannerPort {
  decide(task: string, snapshot: PageSnapshot, history: readonly AgentTrace[]): Promise<Decision>;
}

export interface AgentTrace {
  turn: number;
  snapshot: PageSnapshot;
  decision: Decision;
  actionResult: 'ok' | 'error' | 'skipped';
  error?: string;
}

export interface RunResult {
  status: 'completed' | 'failed' | 'stopped' | 'max_turns';
  reason: string;
  history: readonly AgentTrace[];
}
