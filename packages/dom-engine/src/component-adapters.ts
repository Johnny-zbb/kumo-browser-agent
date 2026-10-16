import type { PageAction } from '../../agent-core/src/types.js';

export interface ComponentSemantics {
  role: string;
  name: string;
  value?: string;
  disabled?: boolean;
}

/**
 * One component family owns its detection and implementation details.
 * The engine — not an adapter — allocates and validates element refs.
 */
export interface ComponentAdapter {
  readonly id: string;
  readonly selector: string;
  readonly priority?: number;
  matches(element: HTMLElement): boolean;
  observe(element: HTMLElement): ComponentSemantics;
  /** Return true only if the action was handled. */
  execute?(element: HTMLElement, action: PageAction): boolean | Promise<boolean>;
}

export class ComponentAdapterRegistry {
  private readonly adapters: readonly ComponentAdapter[];

  constructor(adapters: readonly ComponentAdapter[] = []) {
    const ids = new Set<string>();
    for (const adapter of adapters) {
      if (!adapter.id.trim() || !adapter.selector.trim() || ids.has(adapter.id)) {
        throw new Error(`invalid_component_adapter_${adapter.id}`);
      }
      ids.add(adapter.id);
    }
    this.adapters = [...adapters].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }

  selectors(): string[] {
    return this.adapters.map(adapter => adapter.selector);
  }

  resolve(element: HTMLElement): ComponentAdapter | undefined {
    return this.adapters.find(adapter => adapter.matches(element));
  }
}
