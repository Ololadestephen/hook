// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {HookFlowLiquidityRouter} from "../src/HookFlowLiquidityRouter.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";

contract DeployHookFlowLiquidityRouter is Script {
    address internal constant SEPOLIA_POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;

    function run() external returns (HookFlowLiquidityRouter liquidityRouter) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address poolManager = vm.envOr("POOL_MANAGER", SEPOLIA_POOL_MANAGER);

        vm.startBroadcast(deployerKey);
        liquidityRouter = new HookFlowLiquidityRouter(IPoolManager(poolManager));
        vm.stopBroadcast();
    }
}
