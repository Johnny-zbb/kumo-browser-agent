import type { PageAction } from '../../../agent-core/src/types.js';
import type { ComponentAdapter, ComponentSemantics, AdapterActionContext } from '../component-adapters.js';

/**
 * An ARIA-compliant custom select adapter.
 * This is NOT an Ant Design / Tiny-specific driver. Those libraries require
 * their own validated adapters and browser fixtures.
 */
export const ariaSelectAdapter: ComponentAdapter = {
  id: 'aria-select',
  selector: '[role="combobox"][aria-controls]',
  priority: 20,
  matches(element) {
    return element.getAttribute('role') === 'combobox' && Boolean(element.getAttribute('aria-controls'));
  },
  observe(element): ComponentSemantics {
    const labelledBy = element.getAttribute('aria-labelledby');
    const labelled = labelledBy?.split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim() ?? '')
      .filter(Boolean).join(' ');
    const name = (element.getAttribute('aria-label') || labelled || element.getAttribute('title') || '选择框').trim();
    const value = (element.getAttribute('aria-valuetext') || element.getAttribute('data-agent-value') || element.textContent || '').trim();
    const disabled = element.getAttribute('aria-disabled') === 'true' || element.hasAttribute('disabled');
    return { role: 'combobox', name, value, disabled, actions: ['click', 'selectOption'] };
  },
  async execute(element, action: PageAction, context: AdapterActionContext): Promise<boolean> {
    if (action.kind !== 'selectOption') return false;
    const controlsId = element.getAttribute('aria-controls');
    if (!controlsId) throw new Error('select_missing_controls');
    const listbox = element.ownerDocument.getElementById(controlsId);
    // An adapter cannot reach outside the authorized page root.
    if (!listbox || !context.root.contains(listbox) || listbox.getAttribute('role') !== 'listbox') {
      throw new Error('select_listbox_unavailable');
    }
    if (element.getAttribute('aria-expanded') !== 'true') element.click();
    // Async-rendered menus require a library-specific adapter.
    await Promise.resolve();
    if (listbox.hasAttribute('hidden') || listbox.getAttribute('aria-hidden') === 'true') {
      throw new Error('select_listbox_not_open');
    }
    const choices = Array.from(listbox.querySelectorAll<HTMLElement>('[role="option"]'));
    const target = choices.find((option) =>
      (option.getAttribute('data-value') || option.getAttribute('aria-label') || option.textContent || '').trim() === action.value
    );
    if (!target) throw new Error('select_option_not_found');
    if (target.hasAttribute('disabled') || target.getAttribute('aria-disabled') === 'true') {
      throw new Error('select_option_disabled');
    }
    target.click();
    // Never report success solely because a click was dispatched.
    if (this.observe(element).value !== action.value) throw new Error('select_value_not_updated');
    return true;
  }
};
