// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {HookFlowFeeLogic} from "./libraries/HookFlowFeeLogic.sol";
import {HookFlowPresetLib} from "./libraries/HookFlowPresetLib.sol";
import {HookFlowTypes} from "./types/HookFlowTypes.sol";
import {BalanceDelta, toBalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/src/types/BeforeSwapDelta.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams, SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";

contract HookFlowHook is IHooks {
    using HookFlowFeeLogic for HookFlowTypes.PoolConfig;
    using PoolIdLibrary for PoolKey;

    uint24 public constant MAX_CONFIGURED_FEE_PIPS = 100_000;
    uint24 public constant MAX_SIZE_PREMIUM_PIPS = 50_000;
    uint24 public constant MAX_TOXIC_PREMIUM_PIPS = 75_000;
    uint32 public constant MIN_WINDOW_SECONDS = 60;
    uint32 public constant MAX_WINDOW_SECONDS = 1 days;
    uint32 public constant MAX_COOLDOWN_SECONDS = 1 hours;

    address public immutable owner;
    address public immutable poolManager;
    address public presetOperator;

    mapping(PoolId poolId => HookFlowTypes.PoolConfig) public poolConfigs;
    mapping(PoolId poolId => HookFlowTypes.PoolFlowState) public poolFlowStates;

    event PoolConfigured(PoolId indexed poolId, HookFlowTypes.PoolConfig config);
    event PoolPresetApplied(PoolId indexed poolId, HookFlowTypes.Preset preset, HookFlowTypes.PoolConfig config);
    event PresetOperatorUpdated(address indexed previousOperator, address indexed newOperator);
    event FlowAssessed(
        PoolId indexed poolId, uint24 appliedFeePips, uint8 sizeBucket, uint32 toxicScore, bool defensiveMode
    );

    error NotOwner();
    error NotPresetOperator();
    error NotPoolManager();
    error PoolDisabled(PoolId poolId);
    error PoolAlreadyConfigured(PoolId poolId);
    error InvalidConfig();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyPoolManager() {
        if (msg.sender != poolManager) revert NotPoolManager();
        _;
    }

    modifier onlyPresetOperator() {
        if (msg.sender != owner && msg.sender != presetOperator) revert NotPresetOperator();
        _;
    }

    constructor(address initialOwner, address initialPoolManager) {
        if (initialOwner == address(0) || initialPoolManager == address(0)) revert InvalidConfig();
        owner = initialOwner;
        poolManager = initialPoolManager;
    }

    /// @notice Authorizes the atomic pool launcher without making pool
    ///         configuration generally permissionless or front-runnable.
    function setPresetOperator(address newOperator) external onlyOwner {
        address previousOperator = presetOperator;
        presetOperator = newOperator;
        emit PresetOperatorUpdated(previousOperator, newOperator);
    }

    function setPoolConfig(PoolId poolId, HookFlowTypes.PoolConfig calldata config) external onlyOwner {
        _validateConfig(config);
        poolConfigs[poolId] = config;
        emit PoolConfigured(poolId, config);
    }

    function applyPreset(PoolId poolId, HookFlowTypes.Preset preset) external onlyOwner {
        HookFlowTypes.PoolConfig memory config = _presetConfig(preset);
        _validateConfig(config);
        poolConfigs[poolId] = config;
        emit PoolPresetApplied(poolId, preset, config);
        emit PoolConfigured(poolId, config);
    }

    function applySafePreset(PoolId poolId, HookFlowTypes.Preset preset) external onlyPresetOperator {
        if (poolConfigs[poolId].enabled) revert PoolAlreadyConfigured(poolId);

        HookFlowTypes.PoolConfig memory config = _presetConfig(preset);
        _validateConfig(config);
        poolConfigs[poolId] = config;
        emit PoolPresetApplied(poolId, preset, config);
        emit PoolConfigured(poolId, config);
    }

    function hookFlags() public pure returns (uint160) {
        return Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG;
    }

    function beforeInitialize(address, PoolKey calldata, uint160) external view onlyPoolManager returns (bytes4) {
        return IHooks.beforeInitialize.selector;
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external view onlyPoolManager returns (bytes4) {
        return IHooks.afterInitialize.selector;
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        return IHooks.beforeAddLiquidity.selector;
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external view onlyPoolManager returns (bytes4, BalanceDelta) {
        return (IHooks.afterAddLiquidity.selector, BalanceDelta.wrap(0));
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        return IHooks.beforeRemoveLiquidity.selector;
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external view onlyPoolManager returns (bytes4, BalanceDelta) {
        return (IHooks.afterRemoveLiquidity.selector, BalanceDelta.wrap(0));
    }

    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = getPoolId(key);
        HookFlowTypes.FeeQuote memory quote = quoteSwap(poolId, params, uint64(block.timestamp));

        emit FlowAssessed(poolId, quote.feePips, uint8(quote.sizeBucket), quote.toxicScore, quote.defensiveMode);

        return (
            IHooks.beforeSwap.selector,
            BeforeSwapDeltaLibrary.ZERO_DELTA,
            HookFlowFeeLogic.withOverrideFlag(quote.feePips)
        );
    }

    function afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        external
        onlyPoolManager
        returns (bytes4, int128)
    {
        PoolId poolId = getPoolId(key);
        _recordSwap(poolId, params, delta, uint64(block.timestamp));
        return (IHooks.afterSwap.selector, 0);
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        return IHooks.beforeDonate.selector;
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        view
        onlyPoolManager
        returns (bytes4)
    {
        return IHooks.afterDonate.selector;
    }

    function quoteSwap(PoolId poolId, SwapParams memory params, uint64 timestamp)
        public
        view
        returns (HookFlowTypes.FeeQuote memory)
    {
        HookFlowTypes.PoolConfig memory config = poolConfigs[poolId];
        if (!config.enabled) revert PoolDisabled(poolId);

        return HookFlowFeeLogic.quoteFee(
            config,
            poolFlowStates[poolId],
            params.zeroForOne,
            HookFlowFeeLogic.absoluteSpecifiedAmount(params.amountSpecified),
            timestamp
        );
    }

    function recordSwap(PoolId poolId, SwapParams memory params, uint64 timestamp) external onlyPoolManager {
        _recordSwap(poolId, params, _syntheticDeltaFromSpecified(params), timestamp);
    }

    function _recordSwap(PoolId poolId, SwapParams memory params, BalanceDelta delta, uint64 timestamp) private {
        HookFlowTypes.PoolConfig memory config = poolConfigs[poolId];
        if (!config.enabled) revert PoolDisabled(poolId);

        uint256 absoluteAmount = HookFlowFeeLogic.executedAbsoluteAmount(params.zeroForOne, delta);
        poolFlowStates[poolId] =
            HookFlowFeeLogic.nextState(config, poolFlowStates[poolId], params.zeroForOne, absoluteAmount, timestamp);
    }

    function getPoolId(PoolKey memory key) public pure returns (PoolId) {
        return key.toId();
    }

    function _presetConfig(HookFlowTypes.Preset preset) private pure returns (HookFlowTypes.PoolConfig memory) {
        if (preset == HookFlowTypes.Preset.StablePair) return HookFlowPresetLib.stablePair();
        if (preset == HookFlowTypes.Preset.VolatilePair) return HookFlowPresetLib.volatilePair();
        if (preset == HookFlowTypes.Preset.LaunchPool) return HookFlowPresetLib.launchPool();
        return HookFlowPresetLib.longTailPool();
    }

    function _validateConfig(HookFlowTypes.PoolConfig memory config) private pure {
        if (
            config.baseFeePips > config.maxFeePips || config.maxFeePips > HookFlowFeeLogic.MAX_LP_FEE_PIPS
                || config.maxFeePips > MAX_CONFIGURED_FEE_PIPS || config.mediumSizePremiumPips > MAX_SIZE_PREMIUM_PIPS
                || config.largeSizePremiumPips > MAX_SIZE_PREMIUM_PIPS
                || config.elevatedToxicPremiumPips > MAX_TOXIC_PREMIUM_PIPS
                || config.defensiveToxicPremiumPips > MAX_TOXIC_PREMIUM_PIPS
                || config.mediumSizePremiumPips > config.largeSizePremiumPips
                || config.elevatedToxicPremiumPips > config.defensiveToxicPremiumPips || config.mediumTradeSize == 0
                || config.largeTradeSize <= config.mediumTradeSize || config.toxicScoreElevated == 0
                || config.toxicScoreElevated >= config.toxicScoreDefensive || config.toxicScoreDefensive > 100
                || config.cooldownSeconds == 0 || config.cooldownSeconds > MAX_COOLDOWN_SECONDS
                || config.windowSeconds < MIN_WINDOW_SECONDS || config.windowSeconds > MAX_WINDOW_SECONDS
        ) {
            revert InvalidConfig();
        }
    }

    function _syntheticDeltaFromSpecified(SwapParams memory params) private pure returns (BalanceDelta) {
        int128 amount = int128(int256(HookFlowFeeLogic.absoluteSpecifiedAmount(params.amountSpecified)));
        return params.zeroForOne ? toBalanceDelta(amount, 0) : toBalanceDelta(0, amount);
    }
}
