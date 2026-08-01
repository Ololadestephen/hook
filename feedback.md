# iExec Nox Builder Feedback

## What worked well

- The encrypted Solidity types and `Nox` SDK feel close to normal Solidity. `add`, `gt`, `select`, `sub`, ACL grants, and public decryption were enough to build a meaningful private batch auction without inventing a custom cryptography layer.
- Input proofs bind a handle to the caller and application contract. This made the trust boundary much easier to reason about.
- `Nox.publicDecrypt(handle, proof)` is especially valuable: HookFlow can verify the executor's disclosed residual on-chain instead of trusting a keeper-supplied number.
- The local Hardhat plugin plus Docker services enabled a genuine end-to-end test, including two wallets, encrypted input, off-chain resolution, private decryption, and public decryption proofs.
- The Handle SDK's built-in Ethereum Sepolia configuration makes browser integration concise.

## Friction encountered

### Hardhat plugin 0.2.0 Docker PATH regression

With `@iexec-nox/nox-hardhat-plugin@0.2.0`, the local stack failed with `spawn docker ENOENT` even though Docker was installed and available in the parent shell. The plugin's spawned environment did not preserve a usable `PATH`. Pinning the official starter version `0.1.0-beta.2` restored local testing.

Suggested improvement: inherit the parent process environment when starting Docker Compose and add a preflight error that reports the resolved Docker binary and PATH.

### Node version failure mode

Hardhat reporting crashed under newer local Node versions around `styleText('grey', ...)`. Node.js 22 worked reliably and matches the Nox requirements, but the resulting error did not immediately explain the version mismatch.

Suggested improvement: fail fast with an explicit Node 22 version check before starting the local services.

### Interrupted test cleanup

Interrupting a run can leave the Nox Docker stack and volumes alive. A later run may then point the ingestor at stale local-chain state, causing derived handles to remain unresolved even when the contract logic is correct.

Suggested improvement: use a unique Compose project name per test run or perform a stale-stack cleanup before creating the Hardhat RPC server. A documented `nox clean` command would also help.

In our Node test-runner setup, all test cases finished successfully but the Hardhat process remained alive after the report, so teardown did not run until the process was interrupted. Closing the explicitly created Hardhat connection was not sufficient. A force-exit option or open-handle diagnostic in the plugin would make this much easier to trace.

### Browser bundling

Importing `createViemHandleClient` from the package root caused Next.js to resolve the Ethers factory too. Because `ethers` is an optional peer, the production build failed until Ethers was installed even though the app only uses Viem.

Suggested improvement: publish tree-shakeable subpath exports such as `@iexec-nox/handle/viem` and `@iexec-nox/handle/ethers`.

## Documentation requests

- Add an end-to-end example with two distinct wallet owners. A JSON-RPC wallet client that exposes many accounts may cause the SDK to sign with its first account, even when a contract write uses another account.
- Document the polling semantics for newly derived handles and the expected status transitions.
- Add a production-pattern example that verifies multiple public decryption proofs in a settlement function.
- Put the exact supported chain IDs and NoxCompute addresses in one prominent network reference.

## Overall

Nox made the difficult part of Phantom Batch—encrypted aggregation with selective disclosure—surprisingly compact. The protocol primitives are strong. Most lost time came from local orchestration and package ergonomics rather than confidential-compute design.
