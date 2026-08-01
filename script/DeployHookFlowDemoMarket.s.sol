// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {HookFlowDemoToken} from "../src/HookFlowDemoToken.sol";
import {HookFlowLiquidityRouter} from "../src/HookFlowLiquidityRouter.sol";
import {HookFlowTypes} from "../src/types/HookFlowTypes.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";

contract DeployHookFlowDemoMarket is Script {
    using PoolIdLibrary for PoolKey;

    address internal constant LIVE_HOOK = 0x1652dd23c6253d855648F81A737fEf811Ab480c0;
    address internal constant LIVE_LIQUIDITY_ROUTER = 0x0c57E18D8eE175087EFc31c3E5855724d9ECa463;
    address internal constant LIVE_SWAP_ROUTER = 0x7Ce373A874c5FF56959859d525315d263C1e33ac;
    uint160 internal constant SQRT_PRICE_1_1 = 79_228_162_514_264_337_593_543_950_336;
    uint256 internal constant TOKEN_SUPPLY = 1_000_000 * 1e6;
    uint256 internal constant AMOUNT_MAX = 100_000 * 1e6;
    int256 internal constant INITIAL_LIQUIDITY = 1_000_000_000_000;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address hookAddress = vm.envOr("HOOK_ADDRESS", LIVE_HOOK);
        address liquidityRouterAddress = vm.envOr("LIQUIDITY_ROUTER", LIVE_LIQUIDITY_ROUTER);
        address swapRouterAddress = vm.envOr("SWAP_ROUTER", LIVE_SWAP_ROUTER);

        vm.startBroadcast(deployerKey);

        HookFlowDemoToken first = new HookFlowDemoToken("HookFlow USD Alpha", "hfUSD-A", TOKEN_SUPPLY);
        HookFlowDemoToken second = new HookFlowDemoToken("HookFlow USD Beta", "hfUSD-B", TOKEN_SUPPLY);
        (HookFlowDemoToken token0, HookFlowDemoToken token1) =
            address(first) < address(second) ? (first, second) : (second, first);

        token0.approve(liquidityRouterAddress, AMOUNT_MAX);
        token1.approve(liquidityRouterAddress, AMOUNT_MAX);
        token0.approve(swapRouterAddress, type(uint256).max);
        token1.approve(swapRouterAddress, type(uint256).max);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(token0)),
            currency1: Currency.wrap(address(token1)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(hookAddress)
        });

        HookFlowLiquidityRouter(payable(liquidityRouterAddress)).createPoolAndAddLiquidity(
            key,
            SQRT_PRICE_1_1,
            HookFlowTypes.Preset.StablePair,
            ModifyLiquidityParams({
                tickLower: -600,
                tickUpper: 600,
                liquidityDelta: INITIAL_LIQUIDITY,
                salt: bytes32(0)
            }),
            AMOUNT_MAX,
            AMOUNT_MAX,
            block.timestamp + 1 hours,
            ""
        );

        vm.stopBroadcast();

        console2.log("Demo token0", address(token0));
        console2.log("Demo token1", address(token1));
        console2.logBytes32(PoolId.unwrap(key.toId()));
        console2.log("HookFlow hook", hookAddress);
        console2.log("Liquidity router", liquidityRouterAddress);
        console2.log("Swap router", swapRouterAddress);
    }
}
