// Lucian UX/UI Prompt #045 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#045
// Inspired by its button-origin circular clip-path reveal (.8s with a soft ease).
// This is presentation-only: it never changes the agent core or the controlled DOM.
export class AgentModeView {
  private readonly html = document.documentElement;
  private readonly portal = document.getElementById('agent-portal') as HTMLElement;
  private readonly hud = document.getElementById('agent-hud') as HTMLElement;
  private readonly hudLabel = document.getElementById('agent-hud-label') as HTMLElement;
  private readonly headerLabel = document.getElementById('agent-header-status') as HTMLElement;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  async enter(trigger: HTMLElement): Promise<void> {
    const box = trigger.getBoundingClientRect();
    const x = Math.min(window.innerWidth, Math.max(0, box.left + box.width / 2));
    const y = Math.min(window.innerHeight, Math.max(0, box.top + box.height / 2));
    this.portal.style.setProperty('--portal-x', `${x}px`);
    this.portal.style.setProperty('--portal-y', `${y}px`);
    this.hud.hidden = false;
    this.hudLabel.textContent = '正在唤醒 Agent…';
    this.headerLabel.textContent = 'ENTERING AGENT MODE';
    this.html.classList.add('agent-active', 'agent-entering');

    if (!this.reducedMotion.matches) {
      // Run the task only after the reveal, so the entire transition is visible.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 800));
    }
    this.html.classList.remove('agent-entering');
    this.headerLabel.textContent = 'AGENT IS WORKING';
  }

  update(turn: number, phase: string): void {
    this.hudLabel.textContent = `第 ${turn} 轮 · ${phase}`;
  }

  leave(status: 'completed' | 'failed' | 'stopped' | 'max_turns' | 'error'): void {
    this.html.classList.remove('agent-entering', 'agent-active');
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
