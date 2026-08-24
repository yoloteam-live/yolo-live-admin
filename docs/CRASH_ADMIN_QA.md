# Crash admin acceptance checklist

## Access and safety

- A staff account without `game_control:view` cannot open or see Crash Operations.
- A viewer or manager with view-only access can inspect all returned operational evidence but cannot invoke controls.
- Pause, resume, and refund buttons are enabled only for a super admin with `game_control:manage`.
- Every control requires a reason of at least 10 characters and the exact typed confirmation.
- The server rejects direct RPC calls from unauthorized roles even if the UI is bypassed.
- No field, RPC, or page can force, replace, edit, or recalculate a committed crash point.

## Settings

- The `crash` row appears in Game Control from the authoritative `crash_game_configs` read path.
- Crash exposes active state, min/max bet, daily loss cap, betting/result windows, growth, house edge, maximum multiplier, max players, auto-cashout bounds, round liability, and funded house profile.
- Bot enabled state, count, bet, cashout, and activity ranges are configurable and visibly identified as simulated activity.
- Saving Crash calls only `admin_update_crash_config(p_patch)`; direct `game_settings` writes are not the engine configuration source.
- House edge and maximum multiplier changes apply only to future commitments.
- Crash displays commit/reveal language and never renders win-probability, target-payout, forced-result, or multiplier-table controls.
- Invalid basis-point settings are rejected before save and again by the backend.

## Operations snapshot

- `admin_get_crash_operations()` populates the exact current round, phase, state version, server time, and phase timestamps.
- Pre-round commitment is visible before betting; the server seed is absent until the round is revealable.
- A settled round shows the revealed seed, algorithm version, and matching crash multiplier.
- Human players, bets, stake, exposure, payout, wins, and losses exclude simulations.
- Simulated activity is visibly separate and always reports zero wallet exposure.
- Engine lease, outbox, database, and RPC health accurately change among healthy, degraded, and unavailable states; socket health is explicitly labeled as external metrics rather than guessed.
- Previous rounds and audit rows use stable IDs and remain readable after refresh.
- Missing RPC deployment produces an explicit unavailable message rather than invented zero-health data.

## Emergency controls and audit

- Pause blocks new rounds/bets according to backend policy without editing the active commitment.
- Resume works only from a paused engine and creates a distinct audit record.
- Refund targets the displayed current round, deterministically voids it, and refunds every real bet exactly once.
- Retrying the same refund cannot credit a wallet twice.
- Successful actions return and display an audit ID; actor, action, round, reason, outcome, and timestamp appear in recent audit.
- Failed actions remain visibly failed and never show a success audit ID.

## Refresh, layout, and regression

- Relevant Crash database changes update a row-secured, data-free revision signal; the dashboard subscribes only to that signal and triggers a debounced snapshot refresh.
- Manual refresh and returning the browser tab to the foreground recover missed or disconnected Realtime events.
- Manual refresh cannot create overlapping financial commands.
- Tables remain horizontally usable at mobile widths; destructive confirmation remains keyboard accessible.
- Existing Game Control entries retain their prior values and controls.
- `npm run lint`, `npx tsc --noEmit`, and `npm run build` pass before release.
