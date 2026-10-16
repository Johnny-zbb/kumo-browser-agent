import type { PageAction, PageElement, PagePort, PageSnapshot } from '../../agent-core/src/types.js';
import { ComponentAdapterRegistry, type ComponentAdapter } from './component-adapters.js';

function isVisible(el: Element): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const style = getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse' && el.getClientRects().length > 0;
}

function roleOf(el: HTMLElement): string | null {
  const explicit = el.getAttribute('role');
  if (explicit) return explicit;
  if (el instanceof HTMLButtonElement) return 'button';
  if (el instanceof HTMLTextAreaElement) return 'textbox';
  if (el instanceof HTMLSelectElement) return 'combobox';
  if (el instanceof HTMLInputElement) return el.type === 'checkbox' ? 'checkbox' : el.type === 'radio' ? 'radio' : 'textbox';
  if (el instanceof HTMLAnchorElement && el.href) return 'link';
  return el.isContentEditable ? 'textbox' : null;
}

function nameOf(el: HTMLElement): string {
  const labelId = el.getAttribute('aria-labelledby');
  const labelled = labelId?.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').filter(Boolean).join(' ');
  const htmlLabel = 'labels' in el && el.labels instanceof NodeList ? Array.from(el.labels).map((label) => label.textContent?.trim()).join(' ') : '';
  return (labelled || el.getAttribute('aria-label') || htmlLabel || el.getAttribute('placeholder') || el.getAttribute('title') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90);
}

/** v0 in-page PagePort. Later swap for Chrome extension or Playwright without changing AgentRunner. */
export class BrowserDomPage implements PagePort {
  private sequence = 0;
  private nextRef = 1;
  private readonly knownRefs = new WeakMap<Element, number>();
  private observedRefs = new Map<number, HTMLElement>();
  private observedAdapters = new Map<number, ComponentAdapter>();
  private readonly registry: ComponentAdapterRegistry;

  constructor(private readonly root: HTMLElement, adapters: readonly ComponentAdapter[] = []) {
    this.registry = new ComponentAdapterRegistry(adapters);
  }

  async observe(): Promise<PageSnapshot> {
    this.observedRefs = new Map();
    this.observedAdapters = new Map();
    const elements: PageElement[] = [];
    const selectors = ['button', 'input', 'textarea', 'select', 'a[href]', '[role="button"]', '[role="textbox"]', '[contenteditable="true"]', ...this.registry.selectors()];
    const nodes = this.root.querySelectorAll<HTMLElement>(selectors.join(','));
    for (const el of nodes) {
      if (!isVisible(el) || el.closest('[aria-hidden="true"], [inert]')) continue;
      const adapter = this.registry.resolve(el);
      const semantics = adapter?.observe(el);
      const role = semantics?.role ?? roleOf(el);
      if (!role || elements.length >= 100) continue;
      let ref = this.knownRefs.get(el);
      if (!ref) { ref = this.nextRef++; this.knownRefs.set(el, ref); }
      this.observedRefs.set(ref, el);
      if (adapter) this.observedAdapters.set(ref, adapter);
      const node: PageElement = {
        ref, role, name: semantics?.name ?? nameOf(el),
        disabled: semantics?.disabled ?? (('disabled' in el && el.disabled === true) || el.getAttribute('aria-disabled') === 'true')
      };
      if (semantics?.value !== undefined) node.value = semantics.value;
      else if ('value' in el && typeof el.value === 'string') node.value = el.value;
      elements.push(node);
    }
    const text = (this.root.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1400);
    const scrollTop = this.root.scrollTop;
    const clientHeight = this.root.clientHeight;
    const scrollHeight = this.root.scrollHeight;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 3;
    return { id: ++this.sequence, url: location.href, title: document.title, elements, text, viewport: { scrollTop, clientHeight, scrollHeight, atBottom } };
  }

  async execute(action: PageAction, observed: PageSnapshot): Promise<void> {
    if (observed.id !== this.sequence) throw new Error('stale_snapshot');
    if (action.kind === 'scroll') {
      const target = action.ref === undefined ? this.root : this.observedRefs.get(action.ref);
      if (!target || !target.isConnected) throw new Error('stale_ref');
      target.scrollBy({ top: (action.direction === 'down' ? 1 : -1) * 380, behavior: 'instant' });
      return;
    }
    const element = this.observedRefs.get(action.ref);
    if (!element || !element.isConnected || !isVisible(element)) throw new Error('stale_ref');
    const expected = observed.elements.find((node) => node.ref === action.ref);
    const adapter = this.observedAdapters.get(action.ref);
    const currentSemantics = adapter?.observe(element);
    if (!expected || expected.role !== (currentSemantics?.role ?? roleOf(element)) || expected.name !== (currentSemantics?.name ?? nameOf(element))) throw new Error('stale_ref');
    if (('disabled' in element && element.disabled === true) || element.getAttribute('aria-disabled') === 'true') throw new Error('target_disabled');
    element.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    if (adapter?.execute && await adapter.execute(element, action)) return;
    if (action.kind === 'click') { element.click(); return; }
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) throw new Error('not_an_editable_input');
    // Native setter triggers React-style controlled input observation more reliably than direct assignment.
    const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(element, action.value);
    else element.value = action.value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async settle(): Promise<void> {
    // v0 uses a short pause only for the controlled demo. Real runtime should await route/DOM/network conditions.
    await new Promise((resolve) => setTimeout(resolve, 160));
  }
}
