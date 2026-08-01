// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {HookFlowLiquidityRouter} from "../src/HookFlowLiquidityRouter.sol";
import {IERC20Minimal} from "v4-core/src/interfaces/external/IERC20Minimal.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";

contract AddHookFlowSelfServeLiquidity is Script {
    using PoolIdLibrary for PoolKey;

    address internal constant SEPOLIA_USDC = 0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238;
    address internal constant SEPOLIA_WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    function run() external returns (PoolId poolId) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address token0 = vm.envOr("TOKEN0", SEPOLIA_USDC);
        address token1 = vm.envOr("TOKEN1", SEPOLIA_WETH);
        address hook = vm.envAddress("PUBLIC_HOOK");
        address payable router = payable(vm.envAddress("LIQUIDITY_ROUTER"));
        int24 tickLower = int24(vm.envOr("LP_TICK_LOWER", int256(193_800)));
        int24 tickUpper = int24(vm.envOr("LP_TICK_UPPER", int256(198_660)));
        int256 liquidityDelta = int256(vm.envOr("LP_LIQUIDITY_DELTA", uint256(1_400_000_000_000)));
        uint256 token0Allowance = vm.envOr("LP_TOKEN0_ALLOWANCE", uint256(10_000_000));
        uint256 token1Allowance = vm.envOr("LP_TOKEN1_ALLOWANCE", uint256(0.003 ether));

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hook)
        });
        poolId = key.toId();

        vm.startBroadcast(deployerKey);

        IERC20Minimal(token0).approve(router, token0Allowance);
        IERC20Minimal(token1).approve(router, token1Allowance);
        HookFlowLiquidityRouter(router).modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: tickLower,
                tickUpper: tickUpper,
                liquidityDelta: liquidityDelta,
                salt: bytes32(0)
            }),
            token0Allowance,
            token1Allowance,
            block.timestamp + 20 minutes,
            ""
        );

        vm.stopBroadcast();
    }
}
