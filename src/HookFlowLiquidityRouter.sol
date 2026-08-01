// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {HookFlowTypes} from "./types/HookFlowTypes.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {IERC20Minimal} from "v4-core/src/interfaces/external/IERC20Minimal.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";

interface IHookFlowPresetOperator {
    function applySafePreset(PoolId poolId, HookFlowTypes.Preset preset) external;
}

contract HookFlowLiquidityRouter is IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;
    using CurrencyLibrary for Currency;
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;

    event LiquidityModified(
        address indexed lp,
        bytes32 indexed poolId,
        int24 tickLower,
        int24 tickUpper,
        int256 liquidityDelta,
        bytes32 salt
    );
    event PoolLaunched(
        address indexed creator,
        bytes32 indexed poolId,
        address indexed hook,
        HookFlowTypes.Preset preset,
        uint160 sqrtPriceX96
    );

    error NotPoolManager();
    error DeadlineExpired();
    error Amount0Exceeded(uint256 maxAmount0, uint256 actualAmount0);
    error Amount1Exceeded(uint256 maxAmount1, uint256 actualAmount1);
    error ERC20TransferFailed();
    error InvalidHook();
    error InsufficientNativeValue(uint256 supplied, uint256 required);

    struct CallbackData {
        address payer;
        PoolKey key;
        ModifyLiquidityParams params;
        uint256 amount0Max;
        uint256 amount1Max;
        uint256 nativeValue;
        bytes hookData;
    }

    constructor(IPoolManager initialPoolManager) {
        poolManager = initialPoolManager;
    }

    function modifyLiquidity(
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        uint256 amount0Max,
        uint256 amount1Max,
        uint256 deadline,
        bytes calldata hookData
    )
        external
        payable
        returns (BalanceDelta delta)
    {
        if (block.timestamp > deadline) revert DeadlineExpired();

        delta = _modifyLiquidity(msg.sender, key, params, amount0Max, amount1Max, msg.value, hookData);
    }

    /// @notice Atomically registers a protected pool, initializes its price,
    ///         and supplies the creator's first liquidity position.
    /// @dev The HookFlow hook must authorize this router as its presetOperator.
    ///      Any failure reverts preset registration and pool initialization.
    function createPoolAndAddLiquidity(
        PoolKey calldata key,
        uint160 sqrtPriceX96,
        HookFlowTypes.Preset preset,
        ModifyLiquidityParams calldata params,
        uint256 amount0Max,
        uint256 amount1Max,
        uint256 deadline,
        bytes calldata hookData
    ) external payable returns (BalanceDelta delta) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        address hook = address(key.hooks);
        if (hook == address(0)) revert InvalidHook();

        PoolId poolId = key.toId();
        IHookFlowPresetOperator(hook).applySafePreset(poolId, preset);
        poolManager.initialize(key, sqrtPriceX96);
        delta = _modifyLiquidity(msg.sender, key, params, amount0Max, amount1Max, msg.value, hookData);

        emit PoolLaunched(msg.sender, PoolId.unwrap(poolId), hook, preset, sqrtPriceX96);
    }

    function _modifyLiquidity(
        address payer,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        uint256 amount0Max,
        uint256 amount1Max,
        uint256 nativeValue,
        bytes calldata hookData
    ) private returns (BalanceDelta delta) {

        uint256 balanceBeforeCall = address(this).balance - nativeValue;

        ModifyLiquidityParams memory safeParams = ModifyLiquidityParams({
            tickLower: params.tickLower,
            tickUpper: params.tickUpper,
            liquidityDelta: params.liquidityDelta,
            salt: _saltFor(payer)
        });

        delta = abi.decode(
            poolManager.unlock(
                abi.encode(
                    CallbackData({
                        payer: payer,
                        key: key,
                        params: safeParams,
                        amount0Max: amount0Max,
                        amount1Max: amount1Max,
                        nativeValue: nativeValue,
                        hookData: hookData
                    })
                )
            ),
            (BalanceDelta)
        );

        uint256 refundableNative = address(this).balance - balanceBeforeCall;
        if (refundableNative > 0) CurrencyLibrary.ADDRESS_ZERO.transfer(payer, refundableNative);

        emit LiquidityModified(
            payer,
            keccak256(abi.encode(key)),
            safeParams.tickLower,
            safeParams.tickUpper,
            safeParams.liquidityDelta,
            safeParams.salt
        );
    }

    function positionSalt(address lp) external pure returns (bytes32) {
        return _saltFor(lp);
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        CallbackData memory data = abi.decode(rawData, (CallbackData));
        (BalanceDelta delta,) = poolManager.modifyLiquidity(data.key, data.params, data.hookData);

        int128 amount0 = delta.amount0();
        int128 amount1 = delta.amount1();

        uint256 amount0Owed = amount0 < 0 ? uint256(uint128(-amount0)) : 0;
        uint256 amount1Owed = amount1 < 0 ? uint256(uint128(-amount1)) : 0;

        if (amount0Owed > data.amount0Max) revert Amount0Exceeded(data.amount0Max, amount0Owed);
        if (amount1Owed > data.amount1Max) revert Amount1Exceeded(data.amount1Max, amount1Owed);

        if (amount0 < 0) _settle(data.key.currency0, data.payer, uint128(-amount0), data.nativeValue);
        if (amount1 < 0) _settle(data.key.currency1, data.payer, uint128(-amount1), data.nativeValue);
        if (amount0 > 0) poolManager.take(data.key.currency0, data.payer, uint128(amount0));
        if (amount1 > 0) poolManager.take(data.key.currency1, data.payer, uint128(amount1));

        return abi.encode(delta);
    }

    function _settle(Currency currency, address payer, uint256 amount, uint256 nativeValue) private {
        if (currency.isAddressZero()) {
            if (amount > nativeValue) revert InsufficientNativeValue(nativeValue, amount);
            poolManager.settle{value: amount}();
            return;
        }

        poolManager.sync(currency);
        bool success = IERC20Minimal(Currency.unwrap(currency)).transferFrom(payer, address(poolManager), amount);
        if (!success) revert ERC20TransferFailed();
        poolManager.settle();
    }

    function _saltFor(address lp) private pure returns (bytes32) {
        return keccak256(abi.encodePacked(lp));
    }

    receive() external payable {}
}
