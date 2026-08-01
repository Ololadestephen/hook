// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BalanceDelta, BalanceDeltaLibrary} from "v4-core/src/types/BalanceDelta.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {IERC20Minimal} from "v4-core/src/interfaces/external/IERC20Minimal.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";

/// @title HookFlowSwapRouter
/// @notice Minimal exact-input router used by traders and the Phantom executor
///         to send authenticated aggregate flow through a HookFlow pool.
contract HookFlowSwapRouter is IUnlockCallback {
    using BalanceDeltaLibrary for BalanceDelta;
    using PoolIdLibrary for PoolKey;

    IPoolManager public immutable poolManager;

    struct CallbackData {
        address payer;
        address recipient;
        PoolKey key;
        SwapParams params;
        uint256 amountInMaximum;
        uint256 amountOutMinimum;
        bytes hookData;
    }

    event ExactInputSwap(
        address indexed payer,
        address indexed recipient,
        bytes32 indexed poolId,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOut
    );

    error NotPoolManager();
    error DeadlineExpired();
    error InvalidAmount();
    error InvalidSwapDelta();
    error AmountInExceeded(uint256 maximum, uint256 actual);
    error AmountOutTooLow(uint256 minimum, uint256 actual);
    error NativeCurrencyUnsupported();
    error ERC20TransferFailed();

    constructor(IPoolManager initialPoolManager) {
        poolManager = initialPoolManager;
    }

    function swapExactInput(
        PoolKey calldata key,
        bool zeroForOne,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 sqrtPriceLimitX96,
        uint256 deadline,
        bytes calldata hookData
    ) external returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert DeadlineExpired();
        if (amountIn == 0 || amountIn > uint256(type(int256).max)) revert InvalidAmount();

        uint160 priceLimit = sqrtPriceLimitX96;
        if (priceLimit == 0) {
            priceLimit = zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1;
        }

        SwapParams memory params = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(amountIn),
            sqrtPriceLimitX96: priceLimit
        });

        (uint256 amountInConsumed, uint256 received) = abi.decode(
            poolManager.unlock(
                abi.encode(
                    CallbackData({
                        payer: msg.sender,
                        recipient: msg.sender,
                        key: key,
                        params: params,
                        amountInMaximum: amountIn,
                        amountOutMinimum: amountOutMinimum,
                        hookData: hookData
                    })
                )
            ),
            (uint256, uint256)
        );

        emit ExactInputSwap(
            msg.sender,
            msg.sender,
            PoolId.unwrap(key.toId()),
            zeroForOne,
            amountInConsumed,
            received
        );
        return received;
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(poolManager)) revert NotPoolManager();

        CallbackData memory data = abi.decode(rawData, (CallbackData));
        BalanceDelta delta = poolManager.swap(data.key, data.params, data.hookData);
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();

        int128 inputDelta = data.params.zeroForOne ? delta0 : delta1;
        int128 outputDelta = data.params.zeroForOne ? delta1 : delta0;
        if (inputDelta >= 0 || outputDelta <= 0) revert InvalidSwapDelta();

        uint256 amountInConsumed = uint256(uint128(-inputDelta));
        uint256 amountOut = uint256(uint128(outputDelta));
        if (amountInConsumed > data.amountInMaximum) {
            revert AmountInExceeded(data.amountInMaximum, amountInConsumed);
        }
        if (amountOut < data.amountOutMinimum) {
            revert AmountOutTooLow(data.amountOutMinimum, amountOut);
        }

        Currency inputCurrency = data.params.zeroForOne ? data.key.currency0 : data.key.currency1;
        Currency outputCurrency = data.params.zeroForOne ? data.key.currency1 : data.key.currency0;
        _settle(inputCurrency, data.payer, amountInConsumed);
        poolManager.take(outputCurrency, data.recipient, amountOut);

        return abi.encode(amountInConsumed, amountOut);
    }

    function _settle(Currency currency, address payer, uint256 amount) private {
        address token = Currency.unwrap(currency);
        if (token == address(0)) revert NativeCurrencyUnsupported();

        poolManager.sync(currency);
        bool success = IERC20Minimal(token).transferFrom(payer, address(poolManager), amount);
        if (!success) revert ERC20TransferFailed();
        poolManager.settle();
    }
}
