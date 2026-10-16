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

  async enter(): Promise<void> {
    const generation = ++this.generation;
    // The button is above the sandbox; the reveal starts within the controlled viewport.
    this.portal.style.setProperty('--portal-x', `${this.stage.clientWidth / 2}px`);
    this.portal.style.setProperty('--portal-y', `${this.stage.clientHeight / 2}px`);
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

  leave(status: 'completed' | 'failed' | 'stopped' | 'max_turns' | 'error'): void {
    ++this.generation;
    this.stage.classList.remove('agent-entering', 'agent-active');
    this.hud.hidden = true;
    this.headerLabel.textContent = ({
      completed: 'TASK COMPLETED',
      failed: 'TASK FAILED',
      stopped: 'TASK STOPPED',
      max_turns: 'TURN LIMIT REACHED',
      error: 'AGENT ERROR'
    })[status];
  }
}
