/**
 * Debugger chrome only. Kept outside #sandbox so no inspector controls appear
 * in the semantic snapshot or become targets for the browser agent.
 */
export class DevInspector {
  private readonly trigger = document.getElementById('inspector-toggle') as HTMLButtonElement;
  private readonly panel = document.getElementById('dev-inspector') as HTMLElement;
  private readonly backdrop = document.getElementById('inspector-backdrop') as HTMLElement;
  private readonly closeButton = document.getElementById('inspector-close') as HTMLButtonElement;
  private readonly tabs = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-inspector-tab]'));

  constructor() {
    this.trigger.addEventListener('click', () => this.setOpen(this.panel.hidden));
    this.closeButton.addEventListener('click', () => this.setOpen(false));
    this.backdrop.addEventListener('click', () => this.setOpen(false));
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => this.select(tab.dataset.inspectorTab === 'snapshot' ? 'snapshot' : 'trace'));
      tab.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const current = tab.dataset.inspectorTab === 'snapshot' ? 'snapshot' : 'trace';
        const next = current === 'trace' ? 'snapshot' : 'trace';
        this.select(next);
        document.getElementById(`tab-${next}`)?.focus();
      });
    }
    document.addEventListener('keydown', (event) => {
      if (this.panel.hidden) return;
      if (event.key === 'Escape') { this.setOpen(false); return; }
      if (event.key !== 'Tab') return;
      const selected = this.tabs.find(tab => tab.getAttribute('aria-selected') === 'true');
      const focusables = [this.closeButton, ...(selected ? [selected] : []),
        ...(selected?.dataset.inspectorTab === 'snapshot' ? [document.getElementById('inspect') as HTMLButtonElement] : [])];
      const current = focusables.indexOf(document.activeElement as HTMLButtonElement);
      if (current === -1 || (event.shiftKey && current === 0) || (!event.shiftKey && current === focusables.length - 1)) {
        event.preventDefault();
        focusables[event.shiftKey ? focusables.length - 1 : 0]?.focus();
      }
    });
    this.select('trace');
  }

  setOpen(open: boolean): void {
    if (this.panel.hidden === !open) return;
    this.panel.hidden = !open;
    this.backdrop.hidden = !open;
    this.trigger.setAttribute('aria-expanded', String(open));
    this.trigger.setAttribute('aria-label', open ? '关闭开发者检查器' : '打开开发者检查器');
    if (open) this.closeButton.focus();
    else if (this.panel.contains(document.activeElement)) this.trigger.focus();
  }

  private select(view: 'trace' | 'snapshot'): void {
    for (const tab of this.tabs) {
      const active = tab.dataset.inspectorTab === view;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const name of ['trace', 'snapshot']) {
      const region = document.getElementById(`panel-${name}`) as HTMLElement;
      region.hidden = name !== view;
    }
  }
}
