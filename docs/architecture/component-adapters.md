# Component Adapters (v0.2)

## Why an adapter?

A generic DOM agent sees `button`, `textbox` and other HTML/ARIA roles. A composite widget (e.g. custom select, rich editor, virtualized table) may instead require a **single semantic operation** that cannot reliably be accomplished by clicking arbitrary inner nodes. The adapter provides that operation without leaking library-specific details into `AgentRunner`.

## Contract

1. **Identify** a widget via a safe CSS selector (`selector`) and a precise runtime predicate (`matches`).
2. **Observe** its semantic role, accessible name, current value, disabled state, and advertised action kinds.
3. **Execute** only supported action kinds, inside an authorized root, and check a postcondition before reporting success.
4. **Keep refs in the engine.** Adapters never invent or allocate `ref`s. `PageSnapshot.id` prevents execution against a superseded observation.
5. **Hide implementation children.** When an adapter claims an element, interactive descendants aren't separately exposed as Agent targets by the engine.

The `ComponentAdapterRegistry` picks the highest-priority matching adapter. Duplicate IDs and malformed CSS selectors are rejected. A `selectOption` action on an ordinary HTML button is **not** silently treated as click.

```ts
const page = new BrowserDomPage(sandbox, [ariaSelectAdapter]);
const before = await page.observe();
const region = before.elements.find(e => e.role === 'combobox' && e.name === '区域');
if (region?.actions?.includes('selectOption')) {
  await page.execute({ kind: 'selectOption', ref: region.ref, value: '华东-上海一' }, before);
  await page.settle();
  const after = await page.observe();
  console.log(after.elements.find(e => e.ref === region.ref)?.value);
}
```

## Example widget: ARIA combobox

The demo provides a self-contained, accessible combobox with `role="combobox"`, `aria-controls` linked to a `role="listbox"`, and `role="option"` children. `ariaSelectAdapter`:

- Extracts the field name and selected value;
- Advertises `click` and `selectOption` capabilities;
- Expands the combobox (if needed), finds an exact option, and clicks it;
- Verifies the selected value changed;
- Refuses disabled options and options outside the authorized root.

**Not a library-specific guarantee.** Real Ant Design, Tiny, select2, portals, animated popup menus and async virtualized options can have different event or rendering semantics. Test those exact versions in browser fixtures before shipping their adapters; do not add `class` guesses to the general walker. Popovers rendered *outside* the authorized root are intentionally rejected in this example.

## Current limitations

- Only a controlled, in-page DOM is supported; not arbitrary third-party tabs, closed Shadow DOM or inaccessible cross-origin frames.
- The current `settle()` uses a fixed demo delay, not browser-verified stability or network-idle semantics.
- No visual observation, LLM, independent task verifier or user-authorization policy yet.
- Local tests cover contracts and failure handling; CI still needs browser E2E on a running server.

## Testing

- `npm run typecheck` and `npm test`: types, existing Agent Loop tests, registry behavior and adapter success/error cases.
- Local Chromium smoke test (manually run): launch the Playground, choose **切换区域**, confirm completion in 2 turns and `当前区域：华东-上海一`, and confirm the new Snapshot exposes `selectOption`.
