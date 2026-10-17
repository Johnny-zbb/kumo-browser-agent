// Lucian UX/UI Prompt #045 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#045
// Its circular .8s reveal is scoped to the Browser Sandbox rather than the viewport.
// Presentation stays outside the observed #sandbox DOM so it cannot affect snapshots.
export class AgentModeView {
  private readonly stage = document.getElementById('browser-stage') as HTMLElement;
  private readonly portal = document.getElementById('agent-portal') as HTMLElement;
  private readonly hud = document.getElementById('agent-hud') as HTMLElement;
  private readonly hudLabel = document.getElementById('agent-hud-label') as HTMLElement;
  private readonly headerLabel = document.getElementById('agent-header-status') as HTMLElement;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private generation = 0;

  async enter(trigger?: HTMLElement): Promise<void> {
    const generation = ++this.generation;
    // Start at the task trigger inside the sandbox. Fall back to stage center for programmatic use.
    const stageBox = trigger ? this.stage.getBoundingClientRect() : null;
    const triggerBox = trigger?.getBoundingClientRect();
    const x = triggerBox && stageBox ? triggerBox.left + triggerBox.width / 2 - stageBox.left : this.stage.clientWidth / 2;
    const y = triggerBox && stageBox ? triggerBox.top + triggerBox.height / 2 - stageBox.top : this.stage.clientHeight / 2;
    this.portal.style.setProperty('--portal-x', `${Math.min(this.stage.clientWidth, Math.max(0, x))}px`);
    this.portal.style.setProperty('--portal-y', `${Math.min(this.stage.clientHeight, Math.max(0, y))}px`);
    this.hud.hidden = false;
    this.hudLabel.textContent = '正在唤醒 Agent…';
    this.headerLabel.textContent = 'ENTERING AGENT MODE';
    this.stage.classList.add('agent-active', 'agent-entering');

    if (!this.reducedMotion.matches) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 800));
    }
    // Ignore an old animation when the user stopped the task during the reveal.
    if (generation !== this.generation) return;
    this.stage.classList.remove('agent-entering');
    this.headerLabel.textContent = 'AGENT IS WORKING';
  }

  update(turn: number, phase: string): void {
    if (this.stage.classList.contains('agent-active')) {
      this.hudLabel.textContent = `第 ${turn} 轮 · ${phase}`;
    }
  }

  leave(status: 'completed' | 'failed' | 'stopped' | 'max_turns' | 'approval_required' | 'error'): void {
    ++this.generation;
    this.stage.classList.remove('agent-entering', 'agent-active');
    this.hud.hidden = true;
    this.headerLabel.textContent = ({
      completed: 'TASK COMPLETED',
      failed: 'TASK FAILED',
      stopped: 'TASK STOPPED',
      max_turns: 'TURN LIMIT REACHED',
      approval_required: 'APPROVAL REQUIRED',
      error: 'AGENT ERROR'
    })[status];
  }
}
