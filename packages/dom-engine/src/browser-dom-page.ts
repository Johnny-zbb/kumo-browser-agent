import type { PageAction, PageElement, PagePort, PageSnapshot } from '../../agent-core/src/types.js';
import { ComponentAdapterRegistry, type ComponentAdapter } from './component-adapters.js';
import { buildSemanticTree } from './snapshot/build-tree.js';

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

function nameOf(el: HTMLElement, root: HTMLElement): string {
  const labelId = el.getAttribute('aria-labelledby');
  const labelled = labelId?.split(/\s+/).map((id) => (root.contains(el.ownerDocument.getElementById(id)) ? el.ownerDocument.getElementById(id)?.textContent?.trim() : '') ?? '').filter(Boolean).join(' ');
  const htmlLabel = 'labels' in el && el.labels instanceof NodeList ? Array.from(el.labels).filter(label => root.contains(label)).map(label => label.textContent?.trim()).join(' ') : '';
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
    const ownedSubtrees = new Set<Element>();
    // Custom components may render popup controls beside the trigger. They still
    // belong to the same semantic target and must not receive independent refs.
    for (const candidate of this.root.querySelectorAll<HTMLElement>(this.registry.selectors().join(',') || ':not(*)')) {
      const adapter = this.registry.resolve(candidate);
      for (const owned of adapter?.ownedSubtrees?.(candidate, { root: this.root }) ?? []) {
        if (owned !== candidate && this.root.contains(owned)) ownedSubtrees.add(owned);
      }
    }
    const tree = buildSemanticTree(this.root, (el) => {
      const adapter = this.registry.resolve(el);
      const semantics = adapter?.observe(el);
      const actionable = Boolean(adapter) || el.matches('button, input:not([type="hidden"]), textarea, select, a[href], [role="button"], [role="textbox"], [role="combobox"], [role="checkbox"], [role="switch"], [contenteditable="true"]');
      if (!actionable || elements.length >= 100) return null;
      const role = semantics?.role ?? roleOf(el);
      if (!role) return null;
      let ref = this.knownRefs.get(el);
      if (!ref) { ref = this.nextRef++; this.knownRefs.set(el, ref); }
      this.observedRefs.set(ref, el);
      if (adapter) this.observedAdapters.set(ref, adapter);
      const node: PageElement = {
        ref, role, name: semantics?.name ?? nameOf(el, this.root),
        disabled: semantics?.disabled ?? (('disabled' in el && el.disabled === true) || el.getAttribute('aria-disabled') === 'true')
      };
      node.actions = semantics?.actions ?? (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? ['input', 'click'] : el.isContentEditable ? ['input', 'click'] : ['click']);
      if (semantics?.value !== undefined) node.value = semantics.value;
      else if ('value' in el && typeof el.value === 'string') node.value = el.value;
      elements.push(node);
      return node;
    }, el => ownedSubtrees.has(el));
    const text = (this.root.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 1400);
    const scrollTop = this.root.scrollTop;
    const clientHeight = this.root.clientHeight;
    const scrollHeight = this.root.scrollHeight;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 3;
    return { id: ++this.sequence, url: location.href, title: document.title, tree, elements, text, viewport: { scrollTop, clientHeight, scrollHeight, atBottom } };
  }

  /** Resolve refs against the current authorized root and the exact observed semantics. */
  private freshTarget(ref: number, observed: PageSnapshot): { element: HTMLElement; adapter?: ComponentAdapter } {
    const element = this.observedRefs.get(ref);
    // A target moved out of the authorized root is no longer actionable,
    // even if it stays connected to the document during a human approval wait.
    if (!element || !element.isConnected || !this.root.contains(element) || !isVisible(element)) throw new Error('stale_ref');
    const expected = observed.elements.find((node) => node.ref === ref);
    const adapter = this.observedAdapters.get(ref);
    const semantics = adapter?.observe(element);
    const currentRole = semantics?.role ?? roleOf(element);
    const currentName = semantics?.name ?? nameOf(element, this.root);
    const currentValue = semantics?.value ?? ('value' in element && typeof element.value === 'string' ? element.value : undefined);
    if (!expected || expected.role !== currentRole || expected.name !== currentName || expected.value !== currentValue) throw new Error('stale_ref');
    if (semantics?.disabled || ('disabled' in element && element.disabled === true) || element.getAttribute('aria-disabled') === 'true') throw new Error('target_disabled');
    return { element, ...(adapter ? { adapter } : {}) };
  }

  async execute(action: PageAction, observed: PageSnapshot): Promise<void> {
    if (observed.id !== this.sequence) throw new Error('stale_snapshot');
    if (action.kind === 'scroll') {
      const target = action.ref === undefined ? this.root : this.freshTarget(action.ref, observed).element;
      if (!target.isConnected || !this.root.contains(target)) throw new Error('stale_ref');
      target.scrollBy({ top: (action.direction === 'down' ? 1 : -1) * 380, behavior: 'instant' });
      return;
    }
    const { element, adapter } = this.freshTarget(action.ref, observed);
    const expected = observed.elements.find((node) => node.ref === action.ref);
    if (!expected?.actions?.includes(action.kind)) throw new Error('unsupported_action');
    element.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    // Scrolling can fire application handlers that re-render or move the target.
    // Re-check immediately before dispatching the approved action.
    this.freshTarget(action.ref, observed);
    if (adapter?.execute && await adapter.execute(element, action, { root: this.root })) return;
    if (action.kind === 'selectOption') throw new Error('unsupported_action');
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
