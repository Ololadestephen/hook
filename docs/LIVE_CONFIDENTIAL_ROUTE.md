# Live confidential route proof

HookFlow completed an end-to-end iExec Nox route on Ethereum Sepolia on 2026-07-31:

```text
encrypted intent: 125 hfUSD-A
private maximum public clip: 20 hfUSD-A
                         │
                         ▼
              Nox encrypted compute
                         │
        route = HookFlowClip; public amount = 20
                         │
                         ▼
            real Uniswap v4 HookFlow swap
                         │
       swap hash authenticated by Nox proofs
                         │
                         ▼
       encrypted remainder carried into batch 3
```

## Deployment

- HookFlow pool ID: `0x219b1c64d5aafc7d0df414afeaeea244e21316af61475db81731669bcde286fe`
- hfUSD-A: [`0x8602CdE617Aa06596b27A64a670aA94135c1Cf25`](https://sepolia.etherscan.io/address/0x8602CdE617Aa06596b27A64a670aA94135c1Cf25)
- hfUSD-B: [`0xB0eAF5C5cBA516B6d7d7282d35C9C00eB90895c6`](https://sepolia.etherscan.io/address/0xB0eAF5C5cBA516B6d7d7282d35C9C00eB90895c6)
- Exact-input swap router: [`0x7Ce373A874c5FF56959859d525315d263C1e33ac`](https://sepolia.etherscan.io/address/0x7Ce373A874c5FF56959859d525315d263C1e33ac)
- [Pool creation and first liquidity](https://sepolia.etherscan.io/tx/0xc1dc681f56cbf395c8d9f7fe1ad328fdd896009ecb5a4f743b7ed48976e084ef)

The pool opened at 1:1 with stable-pair protection and approximately 29,553 units of each six-decimal demo token in active liquidity.

## Confidential execution evidence

- [Encrypted 125-unit intent](https://sepolia.etherscan.io/tx/0x4903c5e46186fc3c9447c295f2d7dcae4b6621531a283d773dc9bffd2e200ef4)
- [Nox batch seal](https://sepolia.etherscan.io/tx/0x4404128a24248d89534f59f4ce185e752f281e392b5ef5ec7aceb5c233284940)
- [Real 20-unit HookFlow swap](https://sepolia.etherscan.io/tx/0xb8b2a5580a1ea936d1b5527feb7fff24abe5d02f150651cfe1a04461c8b7ec99)
- [Proof-verified execution record](https://sepolia.etherscan.io/tx/0x029a83e557de930a3fc5655c30e42d7ff022834a7fc037db274ff6d3bb472966)
- [Encrypted carryover into batch 3](https://sepolia.etherscan.io/tx/0xb8b3e384bc025000ae24330f39b7c54d2bf9ea90f7c1ba419ede8feeff6e02e3)

Read-only verification after execution showed:

- batch 2 phase: `Executed`;
- selected route: `HookFlowClip`;
- disclosed token0 route: `20,000,000` base units;
- stored execution reference exactly equals the real swap transaction hash;
- batch 3 `hasCarriedFlow`: `true`;
- HookFlow recorded `20,000,000` sell-volume units and toxicity score `54`.

## Security boundary

The current keeper spends its own approved demo inventory to execute the aggregate route. Phantom Batch validates the Nox public-decryption proofs before accepting the execution record. User token escrow, matched-order settlement, pro-rata claims, and cryptographic inspection of the external swap receipt remain outside this hackathon MVP and must be added before production use.
