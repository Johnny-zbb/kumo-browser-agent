# Semantic Snapshot v0.3

The snapshot now exposes two views over the same authorized page root:

- `tree`: nested landmarks, headings, labeled regions, lists, rows, cells, and actionable leaf refs. It retains context needed to distinguish repeated controls such as a “Details” button in each table row.
- `elements`: a flat, backward-compatible index of actionable refs for the deterministic demo planner. Existing refs, action checks, and the `ComponentAdapter` interface are unchanged.

## Example

```text
- region "云服务器"
  - list "实例"
    - listitem "demo-prod"
      - button "详情" [ref=e3] [actions=click]
    - listitem "staging"
      - button "详情" [ref=e4] [actions=click]
```

Popup subtrees registered through `ComponentAdapter.ownedSubtrees` are suppressed in the tree even when rendered as siblings of the trigger. They are not separately actionable.

The DOM Engine owns refs. The tree builder accepts a target-discovery callback, so a recognized custom component appears as one atomic node, not as an implementation button plus a second independent option target. A fresh observation still invalidates earlier snapshot IDs; refs remain stable for surviving elements.

## Limits and future work

- Only in-root DOM is traversed. Hidden or inert subtrees are excluded.
- Layout-only elements flatten away. Container labels only use author-provided semantics or bounded contextual text.
- The maximum is currently 240 tree nodes and 100 actionable refs; deep trees have a recursion-depth limit.
- This is **not** a complete WAI-ARIA accessible-name implementation, composed Shadow DOM traversal, virtualized-list recovery, or cross-origin iframe support.
- For real websites, tree context quality depends on HTML and ARIA semantics. Component-specific adapters and fixture-backed tests remain necessary.
- A future LLM planner should consume `tree` while a verifier independently checks completion; the demo planner intentionally still uses the flat `elements` index.
