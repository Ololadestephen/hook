// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Nox, euint16, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

/// @title PhantomBatch
/// @notice Confidentially aggregates two-sided stable-pair swap intents and
///         selects a no-swap, direct HookFlow, or clipped HookFlow route.
/// @dev Amounts and route caps stay encrypted while collecting. Sealing reveals
///      only matched volume, route code, and the public execution slice. The MVP
///      assumes equal-decimal, 1:1 assets; production settlement should normalize
///      both sides with a bounded oracle.
contract PhantomBatch is Ownable {
    enum Phase {
        Collecting,
        Sealed,
        Executed,
        Cancelled
    }

    enum Route {
        NoPublicSwap,
        HookFlowDirect,
        HookFlowClip
    }

    struct Batch {
        uint64 openedAt;
        uint64 closesAt;
        uint32 intentCount;
        Phase phase;
        euint256 totalSell0;
        euint256 totalSell1;
        euint256 matchedVolume;
        euint256 residual0;
        euint256 residual1;
        bytes32 hookFlowExecutionRef;
        euint256 routeCap;
        euint256 publicRoute0;
        euint256 publicRoute1;
        euint256 deferred0;
        euint256 deferred1;
        euint16 routeCode;
        Route executedRoute;
        uint256 disclosedRoute0;
        uint256 disclosedRoute1;
        bool hasCarriedFlow;
    }

    struct IntentReceipt {
        euint256 sell0;
        euint256 sell1;
        bool submitted;
        euint256 maxPublicClip;
    }

    uint64 public constant MIN_BATCH_DURATION = 30 seconds;
    uint64 public constant MAX_BATCH_DURATION = 1 hours;

    address public executor;
    uint256 public currentBatchId;
    mapping(uint256 batchId => Batch batch) public batches;
    mapping(uint256 batchId => mapping(address trader => IntentReceipt receipt)) public receipts;

    event ExecutorUpdated(address indexed previousExecutor, address indexed newExecutor);
    event BatchOpened(uint256 indexed batchId, uint64 openedAt, uint64 closesAt);
    event IntentSubmitted(uint256 indexed batchId, address indexed trader, uint32 intentCount);
    event BatchSealed(
        uint256 indexed batchId,
        uint32 intentCount,
        euint256 matchedVolume,
        euint16 routeCode,
        euint256 publicRoute0,
        euint256 publicRoute1
    );
    event BatchExecuted(
        uint256 indexed batchId,
        Route route,
        uint256 disclosedRoute0,
        uint256 disclosedRoute1,
        bytes32 indexed hookFlowExecutionRef
    );
    event DeferredFlowCarried(uint256 indexed fromBatchId, uint256 indexed toBatchId);
    event BatchCancelled(uint256 indexed batchId);

    error BatchNotCollecting();
    error BatchNotSealed();
    error BatchNotTerminal();
    error BatchStillOpen();
    error DuplicateIntent();
    error InvalidBatchDuration();
    error InvalidExecutor();
    error InvalidExecutionReference();
    error InvalidRoute();
    error NotExecutor();

    modifier onlyExecutor() {
        if (msg.sender != executor) revert NotExecutor();
        _;
    }

    constructor(address initialExecutor, uint64 initialDuration) Ownable(msg.sender) {
        if (initialExecutor == address(0)) revert InvalidExecutor();
        executor = initialExecutor;
        _openBatch(initialDuration);
    }

    /// @notice Submit an encrypted two-sided intent. Encode the inactive side as
    ///         encrypted zero so calldata shape does not reveal trade direction.
    function submitIntent(
        externalEuint256 encryptedSell0,
        bytes calldata sell0Proof,
        externalEuint256 encryptedSell1,
        bytes calldata sell1Proof,
        externalEuint256 encryptedMaxPublicClip,
        bytes calldata maxPublicClipProof
    ) external {
        Batch storage batch = batches[currentBatchId];
        if (batch.phase != Phase.Collecting) revert BatchNotCollecting();
        if (block.timestamp >= batch.closesAt) revert BatchStillOpen();

        IntentReceipt storage receipt = receipts[currentBatchId][msg.sender];
        if (receipt.submitted) revert DuplicateIntent();

        euint256 sell0 = Nox.fromExternal(encryptedSell0, sell0Proof);
        euint256 sell1 = Nox.fromExternal(encryptedSell1, sell1Proof);
        euint256 submittedClip = Nox.fromExternal(encryptedMaxPublicClip, maxPublicClipProof);
        euint256 encryptedZero = Nox.toEuint256(0);
        euint256 maxPublicClip = Nox.select(
            Nox.eq(submittedClip, encryptedZero), Nox.toEuint256(1), submittedClip
        );

        receipt.sell0 = sell0;
        receipt.sell1 = sell1;
        receipt.submitted = true;
        receipt.maxPublicClip = maxPublicClip;

        Nox.allowThis(receipt.sell0);
        Nox.allowThis(receipt.sell1);
        Nox.allow(receipt.sell0, msg.sender);
        Nox.allow(receipt.sell1, msg.sender);
        Nox.allowThis(receipt.maxPublicClip);
        Nox.allow(receipt.maxPublicClip, msg.sender);

        batch.totalSell0 = Nox.add(batch.totalSell0, sell0);
        batch.totalSell1 = Nox.add(batch.totalSell1, sell1);
        Nox.allowThis(batch.totalSell0);
        Nox.allowThis(batch.totalSell1);

        if (batch.intentCount == 0 && !batch.hasCarriedFlow) {
            batch.routeCap = maxPublicClip;
        } else {
            batch.routeCap = Nox.select(
                Nox.gt(batch.routeCap, maxPublicClip), maxPublicClip, batch.routeCap
            );
        }
        Nox.allowThis(batch.routeCap);

        unchecked {
            batch.intentCount += 1;
        }
        emit IntentSubmitted(currentBatchId, msg.sender, batch.intentCount);
    }

    /// @notice Privately crosses opposing stable-pair volume and reveals only the
    ///         batch aggregates required for public HookFlow execution.
    function sealBatch() external {
        Batch storage batch = batches[currentBatchId];
        if (batch.phase != Phase.Collecting) revert BatchNotCollecting();
        if (block.timestamp < batch.closesAt && msg.sender != owner()) revert BatchStillOpen();

        batch.matchedVolume = Nox.select(
            Nox.gt(batch.totalSell0, batch.totalSell1), batch.totalSell1, batch.totalSell0
        );
        batch.residual0 = Nox.sub(batch.totalSell0, batch.matchedVolume);
        batch.residual1 = Nox.sub(batch.totalSell1, batch.matchedVolume);
        euint256 encryptedZero = Nox.toEuint256(0);
        euint256 totalResidual = Nox.add(batch.residual0, batch.residual1);
        euint256 publicAmount = Nox.select(
            Nox.gt(totalResidual, batch.routeCap), batch.routeCap, totalResidual
        );
        batch.publicRoute0 = Nox.select(
            Nox.gt(batch.residual0, encryptedZero), publicAmount, encryptedZero
        );
        batch.publicRoute1 = Nox.select(
            Nox.gt(batch.residual1, encryptedZero), publicAmount, encryptedZero
        );
        batch.deferred0 = Nox.sub(batch.residual0, batch.publicRoute0);
        batch.deferred1 = Nox.sub(batch.residual1, batch.publicRoute1);

        euint16 noPublicSwap = Nox.toEuint16(uint16(Route.NoPublicSwap));
        euint16 hookFlowDirect = Nox.toEuint16(uint16(Route.HookFlowDirect));
        euint16 hookFlowClip = Nox.toEuint16(uint16(Route.HookFlowClip));
        batch.routeCode = Nox.select(
            Nox.eq(totalResidual, encryptedZero),
            noPublicSwap,
            Nox.select(Nox.gt(totalResidual, batch.routeCap), hookFlowClip, hookFlowDirect)
        );
        batch.phase = Phase.Sealed;

        Nox.allowThis(batch.matchedVolume);
        Nox.allowThis(batch.residual0);
        Nox.allowThis(batch.residual1);
        Nox.allowThis(batch.publicRoute0);
        Nox.allowThis(batch.publicRoute1);
        Nox.allowThis(batch.deferred0);
        Nox.allowThis(batch.deferred1);
        Nox.allowThis(batch.routeCode);
        Nox.allowPublicDecryption(batch.matchedVolume);
        Nox.allowPublicDecryption(batch.publicRoute0);
        Nox.allowPublicDecryption(batch.publicRoute1);
        Nox.allowPublicDecryption(batch.routeCode);

        emit BatchSealed(
            currentBatchId,
            batch.intentCount,
            batch.matchedVolume,
            batch.routeCode,
            batch.publicRoute0,
            batch.publicRoute1
        );
    }

    /// @notice Record the real HookFlow/Uniswap transaction after the public
    ///         aggregate handles have been decrypted and executed by the keeper.
    function markExecuted(
        bytes calldata routeCodeDecryptionProof,
        bytes calldata route0DecryptionProof,
        bytes calldata route1DecryptionProof,
        bytes32 hookFlowExecutionRef
    ) external onlyExecutor {
        Batch storage batch = batches[currentBatchId];
        if (batch.phase != Phase.Sealed) revert BatchNotSealed();

        // The executor cannot invent the route or amount. NoxCompute validates
        // every proof against the encrypted decision produced while sealing.
        uint16 disclosedRoute = Nox.publicDecrypt(batch.routeCode, routeCodeDecryptionProof);
        uint256 disclosedRoute0 = Nox.publicDecrypt(batch.publicRoute0, route0DecryptionProof);
        uint256 disclosedRoute1 = Nox.publicDecrypt(batch.publicRoute1, route1DecryptionProof);
        if (disclosedRoute > uint16(Route.HookFlowClip)) revert InvalidRoute();

        Route route = Route(disclosedRoute);
        if (route == Route.NoPublicSwap) {
            if (disclosedRoute0 != 0 || disclosedRoute1 != 0) revert InvalidRoute();
            if (hookFlowExecutionRef != bytes32(0)) revert InvalidExecutionReference();
        } else {
            if (hookFlowExecutionRef == bytes32(0)) revert InvalidExecutionReference();
            if ((disclosedRoute0 == 0) == (disclosedRoute1 == 0)) revert InvalidRoute();
        }

        batch.phase = Phase.Executed;
        batch.executedRoute = route;
        batch.disclosedRoute0 = disclosedRoute0;
        batch.disclosedRoute1 = disclosedRoute1;
        batch.hookFlowExecutionRef = hookFlowExecutionRef;
        emit BatchExecuted(
            currentBatchId, route, disclosedRoute0, disclosedRoute1, hookFlowExecutionRef
        );
    }

    function cancelBatch() external onlyOwner {
        Batch storage batch = batches[currentBatchId];
        if (batch.phase != Phase.Collecting && batch.phase != Phase.Sealed) revert BatchNotTerminal();
        batch.phase = Phase.Cancelled;
        emit BatchCancelled(currentBatchId);
    }

    function openNextBatch(uint64 duration) external onlyOwner returns (uint256 batchId) {
        uint256 previousBatchId = currentBatchId;
        Batch storage previous = batches[previousBatchId];
        Phase phase = previous.phase;
        if (phase != Phase.Executed && phase != Phase.Cancelled) revert BatchNotTerminal();
        batchId = _openBatch(duration);

        if (phase == Phase.Executed && previous.executedRoute == Route.HookFlowClip) {
            Batch storage next = batches[batchId];
            next.totalSell0 = previous.deferred0;
            next.totalSell1 = previous.deferred1;
            next.routeCap = previous.routeCap;
            next.hasCarriedFlow = true;
            Nox.allowThis(next.totalSell0);
            Nox.allowThis(next.totalSell1);
            Nox.allowThis(next.routeCap);
            emit DeferredFlowCarried(previousBatchId, batchId);
        }
    }

    function setExecutor(address newExecutor) external onlyOwner {
        if (newExecutor == address(0)) revert InvalidExecutor();
        address previousExecutor = executor;
        executor = newExecutor;
        emit ExecutorUpdated(previousExecutor, newExecutor);
    }

    function _openBatch(uint64 duration) private returns (uint256 batchId) {
        if (duration < MIN_BATCH_DURATION || duration > MAX_BATCH_DURATION) {
            revert InvalidBatchDuration();
        }

        batchId = ++currentBatchId;
        Batch storage batch = batches[batchId];
        batch.openedAt = uint64(block.timestamp);
        batch.closesAt = uint64(block.timestamp) + duration;
        batch.phase = Phase.Collecting;
        batch.totalSell0 = Nox.toEuint256(0);
        batch.totalSell1 = Nox.toEuint256(0);
        batch.routeCap = Nox.toEuint256(0);
        Nox.allowThis(batch.totalSell0);
        Nox.allowThis(batch.totalSell1);
        Nox.allowThis(batch.routeCap);

        emit BatchOpened(batchId, batch.openedAt, batch.closesAt);
    }
}
