# Nox Hello World — Sepolia completion evidence

Completed on 2026-07-31 by following the official [Nox Hello World](https://docs.noxprotocol.io/getting-started/hello-world) journey.

## Result

- Status: completed
- Network: Ethereum Sepolia (`11155111`)
- Journey wallet: [`0x8ac03Ec9430914B02df234c486eAFC79b072DAFa`](https://sepolia.etherscan.io/address/0x8ac03Ec9430914B02df234c486eAFC79b072DAFa)
- NoxCompute: [`0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf`](https://sepolia.etherscan.io/address/0x24ef36ec5b626d7dcd09a98f3083c2758f0f77bf)
- ConfidentialPiggyBank: [`0x1CeBA50d653D016D355719a4F58a4BfaC2E0ac62`](https://sepolia.etherscan.io/address/0x1CeBA50d653D016D355719a4F58a4BfaC2E0ac62)
- Deployment: [`0x08d9ed002e6c051b6499f8fa28b1a7699a43cb83853ffd5f946874ef5aa07df9`](https://sepolia.etherscan.io/tx/0x08d9ed002e6c051b6499f8fa28b1a7699a43cb83853ffd5f946874ef5aa07df9) — success
- Encrypted deposit: [`0xe37d126d5d4cb3658091622b1d4558d72c6a6b5d926a01e43cda6fbe966b66ae`](https://sepolia.etherscan.io/tx/0xe37d126d5d4cb3658091622b1d4558d72c6a6b5d926a01e43cda6fbe966b66ae) — success
- Encrypted balance handle: `0x0000aa36a72301b721203fe9e501d3fba7a79a72adcd5802891e427a4a6fd2e8`
- Owner-authorized decrypted balance: `42`

Both receipts succeeded, the deployed address contains 1,126 bytes of runtime code, and the Nox JS SDK decrypted the resulting balance handle to the deposited value.

Use the journey wallet above in the hackathon verification form.

## Reproduction

The tutorial contract is in `nox/contracts/ConfidentialPiggyBank.sol`. The complete deploy, encrypt, deposit, and decrypt flow is in `nox/scripts/hello-world.ts`; `nox/scripts/verify-hello-world.ts` rechecks an existing deployment after gateway synchronization.
