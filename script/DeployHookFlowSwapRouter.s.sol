// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {HookFlowSwapRouter} from "../src/HookFlowSwapRouter.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";

contract DeployHookFlowSwapRouter is Script {
    address internal constant SEPOLIA_POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;

    function run() external returns (HookFlowSwapRouter router) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address poolManager = vm.envOr("POOL_MANAGER", SEPOLIA_POOL_MANAGER);

        vm.startBroadcast(deployerKey);
        router = new HookFlowSwapRouter(IPoolManager(poolManager));
        vm.stopBroadcast();

        console2.log("HookFlow swap router", address(router));
        console2.log("Canonical Sepolia PoolManager", poolManager);
    }
}
