// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {HookFlowHook} from "../src/HookFlowHook.sol";
import {HookFlowLiquidityRouter} from "../src/HookFlowLiquidityRouter.sol";
import {HookFlowSwapRouter} from "../src/HookFlowSwapRouter.sol";
import {HookFlowTypes} from "../src/types/HookFlowTypes.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {TestERC20} from "v4-core/src/test/TestERC20.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {TickMath} from "v4-core/src/libraries/TickMath.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";

contract SwapRouterTestFactory {
    function deploy(bytes32 salt, address owner, address poolManager) external returns (HookFlowHook) {
        return new HookFlowHook{salt: salt}(owner, poolManager);
    }
}

contract HookFlowSwapRouterTest {
    using PoolIdLibrary for PoolKey;

    uint160 private constant SQRT_PRICE_1_1 = 79_228_162_514_264_337_593_543_950_336;
    uint160 private constant HOOK_FLAGS = Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG;

    PoolManager private manager;
    HookFlowHook private hook;
    HookFlowLiquidityRouter private liquidityRouter;
    HookFlowSwapRouter private swapRouter;
    TestERC20 private token0;
    TestERC20 private token1;
    PoolKey private key;

    function setUp() public {
        manager = new PoolManager(address(this));
        TestERC20 first = new TestERC20(1_000_000 ether);
        TestERC20 second = new TestERC20(1_000_000 ether);
        (token0, token1) = address(first) < address(second) ? (first, second) : (second, first);

        SwapRouterTestFactory factory = new SwapRouterTestFactory();
        bytes32 salt = _mineSalt(address(factory), address(this), address(manager));
        hook = factory.deploy(salt, address(this), address(manager));
        liquidityRouter = new HookFlowLiquidityRouter(IPoolManager(address(manager)));
        swapRouter = new HookFlowSwapRouter(IPoolManager(address(manager)));
        hook.setPresetOperator(address(liquidityRouter));

        key = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });

        token0.approve(address(liquidityRouter), type(uint256).max);
        token1.approve(address(liquidityRouter), type(uint256).max);
        token0.approve(address(swapRouter), type(uint256).max);
        token1.approve(address(swapRouter), type(uint256).max);

        liquidityRouter.createPoolAndAddLiquidity(
            key,
            SQRT_PRICE_1_1,
            HookFlowTypes.Preset.StablePair,
            ModifyLiquidityParams({tickLower: -600, tickUpper: 600, liquidityDelta: 10_000 ether, salt: bytes32(0)}),
            100_000 ether,
            100_000 ether,
            block.timestamp + 1 hours,
            ""
        );
    }

    function testExactInputSwapRoutesThroughHookAndPaysOutput() public {
        uint256 token0Before = token0.balanceOf(address(this));
        uint256 token1Before = token1.balanceOf(address(this));

        uint256 amountOut = swapRouter.swapExactInput(
            key,
            true,
            1 ether,
            0,
            TickMath.MIN_SQRT_PRICE + 1,
            block.timestamp + 1 hours,
            ""
        );

        require(amountOut > 0, "no swap output");
        require(token0.balanceOf(address(this)) == token0Before - 1 ether, "wrong input spent");
        require(token1.balanceOf(address(this)) == token1Before + amountOut, "wrong output received");

        PoolId poolId = key.toId();
        (, , , uint128 sellVolume, , , ) = hook.poolFlowStates(poolId);
        require(sellVolume == 1 ether, "hook did not record routed flow");
    }

    function testMinimumOutputRevertsAtomically() public {
        uint256 token0Before = token0.balanceOf(address(this));
        uint256 token1Before = token1.balanceOf(address(this));

        try swapRouter.swapExactInput(
            key,
            true,
            1 ether,
            type(uint128).max,
            TickMath.MIN_SQRT_PRICE + 1,
            block.timestamp + 1 hours,
            ""
        ) {
            revert("expected slippage revert");
        } catch {}

        require(token0.balanceOf(address(this)) == token0Before, "input leaked on revert");
        require(token1.balanceOf(address(this)) == token1Before, "output leaked on revert");
    }

    function _mineSalt(address factory, address owner, address poolManager) private pure returns (bytes32 salt) {
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(HookFlowHook).creationCode, abi.encode(owner, poolManager)));

        for (uint256 i; i < type(uint256).max; ++i) {
            salt = bytes32(i);
            address predicted = address(
                uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), factory, salt, initCodeHash))))
            );
            if (uint160(predicted) & Hooks.ALL_HOOK_MASK == HOOK_FLAGS) return salt;
        }
        revert("salt not found");
    }
}
