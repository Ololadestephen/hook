# Phantom Smart Router

Phantom Smart Router is HookFlow's confidential intent-compression and routing layer. It uses iExec Nox to aggregate two-sided stable-pair flow without publishing each trader's amount, direction, or maximum public clip. It crosses opposing volume and selects the public execution route in encrypted form.

## Why it matters

Public swaps reveal the exact order before execution. That information creates a clean target for frontrunning, sandwiching, and copy trading. HookFlow already protects LPs after flow reaches a Uniswap v4 pool; Phantom Batch shrinks and obscures that flow before it reaches the hook.

For example, suppose encrypted users submit 125 units of token 0 and 70 units of token 1:

```text
encrypted total 0 = 125 ─┐
                          ├─ Nox min/select/sub ─> matched 70
encrypted total 1 =  70 ─┘                     └> residual token 0 = 55

encrypted route cap:       20 token 0
public HookFlow execution: 20 token 0
encrypted carryover:       35 token 0
individual intents disclosed: none
```

Nox chooses one of three routes:

1. `NoPublicSwap`: opposing flow fully crosses, so nothing reaches the AMM.
2. `HookFlowDirect`: the net residual fits the private clip cap and is routed once.
3. `HookFlowClip`: only the cap-sized slice is routed and the encrypted remainder is carried into the next batch.

## Privacy boundary

During collection, the chain sees a submitting wallet and three opaque Nox handles with proofs. Both trade directions use the same calldata shape; the inactive side is encrypted zero. The third handle contains the trader's maximum public clip. The Nox gateway receives plaintext for encryption over TLS, consistent with the protocol's current trusted-execution model.

After sealing, only the matched aggregate, route code, and the two route amounts are public-decryptable. Full residuals, deferred amounts, and per-user clip limits remain encrypted. A trader's original handles remain ACL-protected and decryptable by that trader and the application contract.

Phantom Batch does not hide wallet addresses, transaction timing, gas usage, or network metadata. Those limitations should be stated clearly in demos and judging material.

## Contract lifecycle

1. The owner opens a 30–3,600 second round.
2. Each wallet calls `submitIntent` once with encrypted sell-0, sell-1, and maximum-public-clip handles and their input proofs.
3. Nox validates that the proofs belong to the caller and are bound to the Phantom Batch contract.
4. The contract adds both values into encrypted totals, computes the batch's strictest private clip, and grants the trader viewer access to their receipt.
5. The owner can seal early; anyone can seal after the deadline.
6. Nox computes matched volume, residuals, route code, public route amounts, and deferred flow using encrypted arithmetic and branching.
7. Only the matched amount, selected route, and public execution slice become public-decryptable.
8. The executor routes the disclosed slice through HookFlow and calls `markExecuted` with the route proofs and transaction hash.
9. `Nox.publicDecrypt` verifies those proofs on-chain. The executor cannot substitute a different route or amount.
10. If Nox selected `HookFlowClip`, `openNextBatch` carries the still-encrypted remainder and route cap into the next round.

## Current MVP assumptions

- The pair has equal decimal precision and a 1:1 crossing price, such as normalized stable assets.
- `PhantomBatch` computes and authenticates intents but does not custody tokens or settle matched balances.
- The executor routes the disclosed slice and records its HookFlow transaction reference. The MVP authenticates the route but does not cryptographically inspect the separate swap transaction.
- A malicious participant can submit a very small encrypted clip and slow a shared batch; production needs admission controls, bonds, or a bounded routing policy.
- Production settlement needs token escrow or permit-based pull payments, withdrawal/refund paths, pro-rata claims, oracle-bounded normalization, keeper incentives, and timeout recovery.

These boundaries keep the hackathon implementation auditable while demonstrating the hard part: privacy-preserving aggregation, encrypted branching/arithmetic, per-user ACLs, aggregate disclosure, and proof-verified execution.

## Local verification

Use Node.js 22 and a running Docker daemon:

```sh
npm --prefix nox install
npm run nox:build
npm run nox:test
```

The suite proves:

- two differently owned encrypted intents cross to the correct matched and selected-route values;
- each trader can decrypt their own receipt;
- a wallet cannot submit twice in one round;
- route selection switches correctly between no-swap, direct, and clipped execution;
- execution records a HookFlow reference only after Nox proofs authenticate the route and public slice;
- a clipped batch carries its encrypted remainder into the following round.

## Ethereum Sepolia deployment

The deployed Phantom Batch is `0x6746265fD2B884096c6936ab27f07922f81f2596`. The first complete private-intent-to-real-swap proof is recorded in [LIVE_CONFIDENTIAL_ROUTE.md](LIVE_CONFIDENTIAL_ROUTE.md).

```sh
cd nox
SEPOLIA_RPC_URL=https://... \
SEPOLIA_PRIVATE_KEY=0x... \
PHANTOM_EXECUTOR=0x... \
npm run deploy:sepolia
```

`PHANTOM_EXECUTOR` is optional and defaults to the deployer. `PHANTOM_BATCH_DURATION` defaults to 300 seconds. Put the deployed address in `frontend/.env.local`:

```sh
NEXT_PUBLIC_PHANTOM_BATCH_ADDRESS=0x...
```

The frontend uses the Handle SDK's Ethereum Sepolia Nox configuration and prompts connected users to switch to chain `11155111`.
