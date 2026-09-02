# One Modal, Stacked Sheets

> Replaces per-sheet `<Modal>` presentation with a single host that renders sheets as layers, and
> hoists `TransactionEditorProvider` out of the sheets that currently nest it.

Fixes: reimbursing a transaction opened from inside another sheet closes the sheets and, in some
arrangements, leaves the app unable to receive touches until it is force-quit.

## Context

`BottomSheet` renders its own `<Modal>`. On iOS that is a UIKit view-controller presentation, and
two arrangements of it are both broken — each one is now documented by a failure:

| Arrangement | Failure | Evidence |
| --- | --- | --- |
| **Nested** — a sheet's Modal inside another sheet's Modal (today) | Presenting over, then dismissing into, a live presentation leaves the touch layer in a state React cannot see or repair. Taps stop being delivered; only relaunching recovers. | Every failing repro logged two presented Modals. The JS thread stayed alive (a 2s heartbeat kept printing), no sheet was stranded offscreen (`y=0 backdrop=1.00`), and no render loop or slow derivation was involved (feed derivations 21–34ms; section rebuilds 0–1ms at 696 rows). |
| **Sibling** — the edit host's Modal beside the outer sheet's | "Presenting it as a sibling would fight this Modal for the screen" | `components/visualizations/CategoryDetailSheet.tsx`, which is why the provider was put inside the sheet in the first place. Re-confirmed on RN 0.86, so the comment is current and not a stale workaround. |

Nesting is structural, not incidental: `TransactionEditorProvider` is mounted **inside**
`AccountDetailSheet` and `CategoryDetailSheet`, and it renders `TransactionEditSheets`, whose
`BottomSheet` therefore lands in the subtree of the sheet that opened it.

With both arrangements ruled out, only one remains: **at most one Modal presented at any time**, with
sheets stacked as layers inside it.

### What was already tried and is not the fix

Six changes to `BottomSheet` preceded this design. Three fixed real defects and are keepers; none
fixed this bug, and one regressed it:

- **Unmount gated on `withTiming`'s `finished`** — an interrupted close left the Modal mounted
  forever. Replaced by an `isClosing` shared value. Real defect, unproven against any symptom.
- **A stale scroll offset across the JS/UI thread boundary** — the offset was written on the JS
  thread and read on the UI thread, so under load a stale `0` read as "at top" and dismissed sheets
  mid-scroll. Real defect.
- **`manualActivation` never resolving a touch** — three separate paths (ineligible downward drags,
  sub-threshold movement, taps) left a touch held, freezing the whole app. Fixed by deleting the
  content gesture entirely; **this is the confirmed fix for the scroll freeze.**
- **Rendering a nested sheet as a plain overlay instead of a Modal** — regressed the flow further
  (the sheet now closed and froze on "Mark as Reimbursement"). Reverted.

## Architecture

**A single Modal host at the tabs level, sheets registered as ordered layers.**

```
(tabs)/_layout.tsx
  TransactionFeedProvider
    TransactionEditorProvider        ← hoisted here, one instance
      SheetHostProvider              ← owns the one <Modal>
        Tabs
```

Three parts:

1. **`SheetHostProvider`** owns the single `<Modal transparent>` and the `GestureHandlerRootView`
   inside it. It presents when the layer count goes 0→1 and dismisses when it returns to 0 — so a
   presentation cycle happens only at the boundaries, never between sheets.
2. **`BottomSheet` keeps its exact public API** (`visible`, `onClose`, `children`, `topOffset`). It
   stops rendering a Modal and instead registers its rendered tree with the host. Every one of the
   11 call sites is untouched.
3. **`TransactionEditorProvider` moves** from inside `AccountDetailSheet` and `CategoryDetailSheet`
   (and from `transactions.tsx`) to the tabs layout, so the edit host and the sheets that open it sit
   at the same tree depth.

### Why the hoist is a prerequisite, not an alternative

Rendering a layer in the host means it renders at the host's position in the tree, and React resolves
context by tree position. Today the edit host is inside `TransactionEditorProvider`, which is inside
`AccountDetailSheet` — hoisting a layer out of there would change which contexts its subtree sees.
Once the provider itself lives above the host, that hazard is gone: every layer resolves the same
contexts it does now.

This is also why the host lives at the tabs level rather than the app root — `TransactionFeedProvider`
is mounted there, and sheet content consumes it.

### Layer model

- The registry is a module-level store (`Map<id, { order, node }>`) with `subscribe` / `getSnapshot`,
  read by the host through `useSyncExternalStore` — the same pattern `financeKitDriver` uses.
  Registering must not re-render the host's ancestors, or a sheet re-render would re-render the app.
- `getSnapshot` returns a cached array, recomputed only on mutation. A fresh array per call makes
  `useSyncExternalStore` loop.
- `order` is an incrementing counter assigned at first registration, so layers stack in open order.
- Layers render in order inside the Modal; the last is on top.
- The grabber, the backdrop, and the close animation belong to **each layer**, unchanged — a layer is
  the same animated view `BottomSheet` renders today, just parented elsewhere.
- Dismissal is unchanged: a layer's `onClose` is its own. The host has no opinion about which layer
  is closing.

### Sheets outside the tabs tree

`PlaidCredentialsForm` is rendered from `app/onboarding/plaid-setup.tsx`, outside the tabs. So
`BottomSheet` falls back to rendering its own `<Modal>` when no host is present. That path is
single-Modal by construction (onboarding stacks nothing), so it keeps working untouched.

## No behaviour change to transfer candidates

An earlier draft of this spec claimed the hoist would widen transfer-candidate scope, on the reading
that each call site passes its own sliced feed. That is wrong. `AccountDetailSheet` and
`CategoryDetailSheet` each take two props — `items`, the displayed slice, and `feed`, the whole feed —
and pass the latter to the provider precisely because "reimbursement candidates can sit on any
account". `transactions.tsx` passes `useTransactionFeed().feed`. Cross-account candidates already
work, and this change must preserve that rather than claim credit for it.

The consequence for sequencing: the hoist has no standalone user-visible benefit. Its only value is
as a prerequisite for the host, plus answering open question 1 below.

## Testing

The failure is native touch delivery, which no unit test in this repo can reach. What is testable:

- **The registry** — ordering, snapshot identity stability across reads, add/remove, and that a
  removed layer leaves the rest in order. Pure, and the snapshot-identity test is the one that
  prevents a `useSyncExternalStore` loop.
- **Existing suites** must stay green: 626 tests, `tsc --noEmit` clean.

On-device verification, in order:

1. `OVERLAPPING MODALS` never prints. That probe is the regression signal for this whole design.
2. Reimburse from the Transactions tab — the path that works today must keep working.
3. Reimburse from the Apple Card sheet — `editor confirmTransfer kind=reimbursement transferItem=<id>`
   must appear with a non-null item. It never has.
4. Sheet-on-sheet visuals: opening a transaction from an account sheet should look as it does now.
5. Onboarding's Plaid form still opens (the fallback path).

## Cleanup carried by this change

- **`useSheetScroll` is deleted**, along with `contentScroll` and the `SheetScroll` type, across 13
  call sites. It is already vestigial — it returns `{ scrollProps: {} }` — and left in place it is an
  API that looks meaningful and is not.
- **The diagnostic probes go**: `lib/observability/devProbe.ts` and call sites in
  `TransactionFeedProvider`, `BottomSheet`, `AccountDetailSheet`, `TransactionEditSheets`, and
  `useTransactionEditor`. `grep -rn devProbe` finds them. Keep them until step 3 above passes.

## Open questions

1. ~~Does the "siblings fight for the screen" claim still hold on RN 0.86?~~ **Answered: yes,
   confirmed on the current version.** Both Modal arrangements are therefore ruled out by test, not
   by reasoning, and the single host is required rather than preferred.
2. **Does any sheet's subtree read context provided by the screen that renders it**, rather than by
   the tabs layout? The hoist removes the known case; a sweep of the 11 sheets should confirm there
   is no second one.
3. **Keyboard behaviour with stacked layers.** Each layer has its own `KeyboardAvoidingView`; only the
   top layer has focus, so the lower one should be inert, but this is unverified.

## Out of scope

- **Drag-to-dismiss from a sheet's content.** Removed earlier because arbitrating content touches
  required `manualActivation`, and three separate paths through it froze the app. The grabber and the
  backdrop remain. Restoring it means RNGH gesture composition (`blocksExternalGesture` against the
  scrollable's ref), which is its own piece of work.
- **The `JWT issued at future` 500s** seen during device testing — device clock ahead of the dev
  machine, unrelated.
- **VirtualizedList blanking on fast scroll** through a 696-row list. Measured as ordinary
  virtualization lag with no `getItemLayout`, not data churn.
