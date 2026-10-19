# Multi-sponsor crowdfunding for `escrow`: contribution model, refund, and `extend_deadline`

Focused analysis for [#57](https://github.com/MergeFi/contracts/issues/57).
Before this change, `escrow::fund` accepted exactly one `sponsor: Address`
and rejected a second call against the same `issue_id` outright
(`AlreadyFunded`), so there was no on-chain way for more than one sponsor
to co-fund the same issue. This documents the design chosen to close that
gap, and why the alternatives considered were rejected.

## Contribution model: `fund` creates, `contribute` appends

Two shapes were considered for letting more than one sponsor put money
into the same `issue_id`:

- **Overload `fund` to silently branch on whether the escrow already
  exists** (create it on the first call, top it up on subsequent calls).
  Rejected: it would either have to drop the existing `AlreadyFunded`
  guard entirely (a behavior change for every existing single-sponsor
  integration that relies on a second `fund` call being rejected), or
  keep some other implicit signal to distinguish "first funder" from
  "additional funder" inside one function — more surface area for a
  caller to get wrong (e.g. accidentally omitting `deadline` on a
  top-up call and having it silently ignored) for no real benefit over
  just having two functions.
- **Two functions: `fund` (create) and `contribute` (append) —
  implemented here.** `fund` keeps its exact existing behavior and
  error semantics, including `AlreadyFunded` on a second call for the
  same `issue_id`. `contribute(env, issue_id, sponsor, amount)` is the
  new entrypoint every sponsor after the first uses; it takes no
  `token`/`deadline` params at all — it reuses whatever's already
  recorded on the escrow, so there's no possibility of a top-up
  silently using a different token or deadline than the original
  funder intended, and no new `TokenMismatch`-style error needed the
  way `maintenance-pool::deposit` requires for its own multi-sponsor
  case.

No separate "target/goal amount" field was introduced. `escrow.amount` is
simply the running sum of every accepted contribution (starting with the
`fund` call, i.e. the original sponsor is contribution index `0`); there's
no on-chain concept of "fully funded" versus "partially funded" — `release`
pays out whatever has accumulated, same as today. This mirrors the fact
that the pre-existing single-sponsor design never had an upper amount cap
either.

## Refund: exact reimbursement, not proportional splitting

Each contribution is stored as its own `Contribution { sponsor, amount, timestamp }`
record (`DataKey::Contribution(issue_id, index)`), a separate persistent
entry per contributor — the same shape `maintenance-pool::Deposit` already
uses, rather than one `Vec<(Address, i128)>` field inline on `Escrow`.
Two reasons:

1. **Bounded storage entries.** A single growing `Vec` on `Escrow` means
   every read/write of the escrow record has to load and re-serialize the
   entire contribution history, even for operations (like `release`) that
   don't need it at all. Per-index entries keep `Escrow` itself small and
   let `refund`/`extend_deadline` read only what they need.
2. **No unbounded growth.** `max_sponsors` (an optional `initialize`
   parameter, defaulting to the `MAX_SPONSORS` constant, 20, when omitted)
   caps `contributor_count`, so `refund`'s and `extend_deadline`'s
   per-contributor loops are bounded by a small, per-deployment-tunable
   constant regardless of how popular a bounty gets — directly addressing
   the same resource concern #8/#9 raise for `recipients`/`allocations`
   elsewhere in this codebase. Twenty is generous enough for any realistic
   crowdfunding scenario for a single GitHub issue while keeping the
   worst-case loop (and its Stellar resource cost) small and predictable;
   a deployment expecting unusually high participation can raise the cap
   at `initialize` time instead of needing a contract redeploy (#96).

Because each contribution is recorded as an *exact* amount rather than a
percentage, `refund` needs no proportional-split math at all: it iterates
`0..contributor_count`, and pays each `Contribution.amount` back to that
same `Contribution.sponsor`, verbatim. There's no rounding/dust question
the way `compute_split`'s basis-point payouts have — the sum of what goes
back out is definitionally exactly the sum of what came in, split exactly
along the lines it arrived in.

## `extend_deadline`: original sponsor only, capped at 365 days

Before crowdfunding, `extend_deadline` was gated by
`escrow.sponsor.require_auth()` — trivial with exactly one possible
sponsor. With potentially many contributors, four shapes were considered:

- **Any current contributor may extend.** Previously implemented, now
  rejected: it is a griefing vector. Extending looks harmless because it
  never redirects funds, but it postpones the permissionless `refund`
  window — every other sponsor's only admin-independent exit. An attacker
  could contribute 1 stroop and call
  `extend_deadline(issue_id, attacker, u64::MAX - GRACE_PERIOD)`, leaving
  a 10,000 USDC sponsor dependent on the admin's early refund forever.
- **Unanimous consent** (every contributor must co-sign). Rejected: adds
  real coordination cost (gathering N on-chain signatures in one
  transaction, or a multi-step approval flow that doesn't exist yet).
- **Contribution-weighted consent** (e.g. majority-by-amount). Rejected
  for now: meaningfully more state and logic (vote tallying, a threshold
  to pick and justify). It could be revisited if co-sponsors need a say.
- **Original sponsor only — implemented here.** `caller` must equal
  `Contribution(issue_id, 0).sponsor`, the address that called `fund`.
  Contributions are append-only and never reordered, so index 0 is stable
  for the escrow's lifetime. This matches the single-sponsor rule from
  before crowdfunding: later contributors join on the original sponsor's
  terms, and they cannot change those terms.

`new_deadline` is also capped at `now + MAX_DEADLINE_EXTENSION` (365
days). Even the original sponsor cannot push the permissionless window
arbitrarily far out in one call. It can be extended again later, still
only up to 365 days ahead of that later call. The admin's independent
early-refund path (`refund` before `deadline + GRACE_PERIOD`, admin-only)
remains available as an escape hatch.

