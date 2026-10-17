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

/** Semantic context preserved for planning; only actionable leaves receive a ref. */
export interface SemanticTreeNode {
  role: string;
  name?: string;
  ref?: number;
  value?: string;
  disabled?: boolean;
  actions?: readonly PageAction['kind'][];
  children?: readonly SemanticTreeNode[];
}

export interface PageSnapshot {
  id: number;
  url: string;
  title: string;
  /** Context-aware structure, suitable for LLM prompts and inspector rendering. */
  tree: readonly SemanticTreeNode[];
  /** Backward compatible flat target index for the current deterministic planner. */
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
  decide(task: string, snapshot: PageSnapshot, history: readonly AgentTrace[], signal?: AbortSignal): Promise<Decision>;
}

export interface ActionVerification {
  /** matched is a proven target value; changed is observable but not goal confirmation. */
  status: 'matched' | 'changed' | 'unconfirmed' | 'mismatch';
  reason: string;
}

export interface TaskVerification {
  status: 'passed' | 'rejected' | 'inconclusive';
  reason: string;
}

/** Task completion evidence is checked independently of PlannerPort. */
export interface TaskVerifierPort {
  verify(task: string, snapshot: PageSnapshot): TaskVerification | Promise<TaskVerification>;
}

export interface AgentTrace {
  turn: number;
  snapshot: PageSnapshot;
  decision: Decision;
  actionResult: 'ok' | 'error' | 'skipped';
  actionVerification?: ActionVerification;
  taskVerification?: TaskVerification;
  error?: string;
}

export interface RunResult {
  status: 'completed' | 'failed' | 'stopped' | 'max_turns';
  reason: string;
  history: readonly AgentTrace[];
}
