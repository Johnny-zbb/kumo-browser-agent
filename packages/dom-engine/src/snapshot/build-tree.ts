import type { PageElement, SemanticTreeNode } from '../../../agent-core/src/types.js';

const MAX_TREE_NODES = 240;
const MAX_DEPTH = 32;
const CONTAINERS: Record<string, string> = {
  MAIN: 'main', NAV: 'navigation', ASIDE: 'complementary', FORM: 'form',
  TABLE: 'table', THEAD: 'rowgroup', TBODY: 'rowgroup', TFOOT: 'rowgroup',
  TR: 'row', TD: 'cell', TH: 'columnheader', UL: 'list', OL: 'list',
  LI: 'listitem', FIELDSET: 'group', ARTICLE: 'article', DIALOG: 'dialog'
};

function clean(value: string | null | undefined, max = 90): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function readableName(element: HTMLElement, role: string, root: HTMLElement): string | undefined {
  // Avoid copying the entire descendants' text into container labels.
  const aria = clean(element.getAttribute('aria-label'));
  if (aria) return aria;
  const ids = element.getAttribute('aria-labelledby')?.trim().split(/\s+/).filter(Boolean) ?? [];
  const labels = ids.map(id => element.ownerDocument.getElementById(id))
    .filter((node): node is HTMLElement => node instanceof HTMLElement && root.contains(node));
  if (labels.length) return clean(labels.map(label => label.textContent).join(' '));
  if (role === 'heading' || role === 'listitem' || role === 'row' || role === 'columnheader' || role === 'cell') {
    return clean(element.innerText);
  }
  return undefined;
}

function structuralRole(element: HTMLElement): string | undefined {
  const explicit = element.getAttribute('role');
  if (explicit && explicit !== 'presentation' && explicit !== 'none') return explicit;
  if (/^H[1-6]$/.test(element.tagName)) return 'heading';
  if (element.tagName === 'SECTION' && (element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby'))) return 'region';
  return CONTAINERS[element.tagName];
}

/**
 * A projection of the *authorized* page into a semantic tree. Uninteresting layout
 * divs flatten away; headings, regions, lists and tables retain context. Targets
 * are atomic and owned by the engine callback, which also owns ref allocation.
 */
export function buildSemanticTree(root: HTMLElement, getTarget: (element: HTMLElement) => PageElement | null, shouldSkip: (element: HTMLElement) => boolean = () => false): SemanticTreeNode[] {
  let emitted = 0;
  const visit = (element: HTMLElement, depth: number): SemanticTreeNode[] => {
    if (shouldSkip(element) || depth > MAX_DEPTH || emitted >= MAX_TREE_NODES || element.hidden || element.inert || element.getAttribute('aria-hidden') === 'true') return [];
    const style = getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return [];

    // Elements inside an atomic custom widget are intentionally not visited.
    const target = element.getClientRects().length ? getTarget(element) : null;
    if (target) {
      emitted++;
      return [{ role: target.role, name: target.name, ref: target.ref,
        ...(target.value === undefined ? {} : { value: target.value }),
        ...(target.disabled ? { disabled: true } : {}),
        ...(target.actions ? { actions: target.actions } : {}) }];
    }
    const children: SemanticTreeNode[] = [];
    for (const child of element.children) {
      if (child instanceof HTMLElement) children.push(...visit(child, depth + 1));
      if (emitted >= MAX_TREE_NODES) break;
    }
    const role = structuralRole(element);
    if (!role) return children;
    // A structural node only earns its token cost if it has context or descendants.
    const name = readableName(element, role, root);
    if (!children.length && !name) return [];
    emitted++;
    return [{ role, ...(name ? { name } : {}), ...(children.length ? { children } : {}) }];
  };
  const tree: SemanticTreeNode[] = [];
  for (const child of root.children) {
    if (child instanceof HTMLElement) tree.push(...visit(child, 1));
    if (emitted >= MAX_TREE_NODES) break;
  }
  return tree;
}

export function serializeSemanticTree(tree: readonly SemanticTreeNode[]): string {
  const lines: string[] = [];
  const walk = (nodes: readonly SemanticTreeNode[], depth: number): void => {
    for (const node of nodes) {
      const label = node.name ? ` ${JSON.stringify(node.name)}` : '';
      const ref = node.ref !== undefined ? ` [ref=e${node.ref}]` : '';
      const value = node.value !== undefined ? ` value=${JSON.stringify(node.value)}` : '';
      const disabled = node.disabled ? ' [disabled]' : '';
      const actions = node.actions?.length ? ` [actions=${node.actions.join(',')}]` : '';
      lines.push(`${'  '.repeat(depth)}- ${node.role}${label}${ref}${value}${disabled}${actions}`);
      if (node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return lines.join('\n');
}
