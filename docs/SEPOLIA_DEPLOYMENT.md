# Ethereum Sepolia deployment

HookFlow's active application network is Ethereum Sepolia, chain ID `11155111`.

## Live deployment

Deployed from `0x8ac03Ec9430914B02df234c486eAFC79b072DAFa` on 2026-07-31.

| HookFlow component | Address |
| --- | --- |
| Public CREATE2 factory | [`0xFffd73b95b0A72381ea60Fe6560Ce9d991eCA5af`](https://sepolia.etherscan.io/address/0xFffd73b95b0A72381ea60Fe6560Ce9d991eCA5af) |
| HookFlow hook | [`0x1652dd23c6253d855648F81A737fEf811Ab480c0`](https://sepolia.etherscan.io/address/0x1652dd23c6253d855648F81A737fEf811Ab480c0) |
| Atomic liquidity router | [`0x0c57E18D8eE175087EFc31c3E5855724d9ECa463`](https://sepolia.etherscan.io/address/0x0c57E18D8eE175087EFc31c3E5855724d9ECa463) |
| Exact-input swap router | [`0x7Ce373A874c5FF56959859d525315d263C1e33ac`](https://sepolia.etherscan.io/address/0x7Ce373A874c5FF56959859d525315d263C1e33ac) |
| Phantom Batch | [`0x6746265fD2B884096c6936ab27f07922f81f2596`](https://sepolia.etherscan.io/address/0x6746265fD2B884096c6936ab27f07922f81f2596) |

Deployment transactions:

- [Factory deployment](https://sepolia.etherscan.io/tx/0x40e5f69ce8ce2410b5f6dd04b4f129c2767541838653532db2814d9fcc67d56b)
- [Flagged hook deployment](https://sepolia.etherscan.io/tx/0xfb433fe9abaa75fb631744892d22df1fa60b83879d1be49fddca75eb50a223ab)
- [Liquidity router deployment](https://sepolia.etherscan.io/tx/0x4a5d59203735cf061f9552f68523cefb9332e10e2a932e91c2a6635303230ed8)
- [Router authorization](https://sepolia.etherscan.io/tx/0xbb8688ea1c66a84210c8cc7ae474b56ba5a68adf5db1fd023f1db587b9677496)
- [Phantom Batch deployment](https://sepolia.etherscan.io/tx/0x8f2a703a0b445457eec7fbc38a1865a9f8ca3e234e7933be57f34bba3012eb00)
- [Swap router deployment](https://sepolia.etherscan.io/tx/0xb87b6d5e8a47eb2b337ce2a42ec85d533b323151d2a4319542a7f0773d99402a)
- [Expired empty batch cancellation](https://sepolia.etherscan.io/tx/0xd80052e4a701faa49ff5608b9aa0888d01e52bdac2845aba78b2d768807a36a9)
- [One-hour batch 2 opening](https://sepolia.etherscan.io/tx/0x9bd262265ef61274fc114dc2377d56bd024f27258a19dacb7c6f63faac0ef398)

Read-only smoke checks confirmed that the hook has the required `beforeSwap | afterSwap` address flags (`0xc0`), the canonical PoolManager, and the deployed liquidity router as `presetOperator`. Phantom Batch initialized with the deployer as owner and executor; batch `2` was opened after the initial empty deployment batch expired.

The Phantom page detects expired collection windows and exposes owner-only seal, cancel, and next-batch actions. Operators can also refresh an expired empty batch with `npm --prefix nox run refresh:sepolia` after exporting the Sepolia and Phantom deployment variables.

The deployment targets Uniswap's canonical v4 contracts:

| Contract | Address |
| --- | --- |
| PoolManager | `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` |
| PositionManager | `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4` |
| StateView | `0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c` |
| Permit2 | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| NoxCompute | `0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf` |

## 1. Configure the deployer

```sh
cp .env.example .env
```

Set `SEPOLIA_RPC_URL`, a funded `PRIVATE_KEY`, and optionally `HOOK_OWNER`. Do not commit `.env`.

## 2. Deploy HookFlow

```sh
set -a
source .env
set +a

forge script script/DeployHookFlowPublicSelfServe.s.sol:DeployHookFlowPublicSelfServe \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --broadcast \
  -vvvv
```

The script deploys:

1. `HookFlowPublicFactory`;
2. a CREATE2-mined `HookFlowHook` whose address has the required v4 hook flags;
3. `HookFlowLiquidityRouter` against the canonical PoolManager;
4. the router authorization through `hook.setPresetOperator(router)`.

It does not initialize a default pool unless `INITIALIZE_DEFAULT_POOL=true`. The app is intended to perform the first real launch atomically.

## 3. Configure the frontend

Create `frontend/.env.local`:

```sh
NEXT_PUBLIC_HOOKFLOW_HOOK_ADDRESS=0x...
NEXT_PUBLIC_HOOKFLOW_FACTORY_ADDRESS=0x...
NEXT_PUBLIC_HOOKFLOW_LIQUIDITY_ROUTER_ADDRESS=0x...
NEXT_PUBLIC_PHANTOM_BATCH_ADDRESS=0x...
```

The create action stays disabled when the hook or router address is absent. This prevents accidental transactions to placeholder addresses.

## 4. Launch a pool

From `/create`:

1. connect an Ethereum Sepolia wallet;
2. choose a valid ERC-20 pair and deposit maxima;
3. provide the token1-per-token0 opening price;
4. choose aligned ticks and a protection preset;
5. approve both tokens;
6. call `Create pool + liquidity`.

The router performs preset registration, `PoolManager.initialize`, and `PoolManager.modifyLiquidity` within one transaction. Reversion rolls back all three steps.

## 5. Verify

```sh
forge verify-contract <HOOK_ADDRESS> src/HookFlowHook.sol:HookFlowHook \
  --chain sepolia \
  --etherscan-api-key "$ETHERSCAN_API_KEY"
```

Use the corresponding constructor arguments for the hook owner and canonical PoolManager. Verify the router with the PoolManager constructor argument.
