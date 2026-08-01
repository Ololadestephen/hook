// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {HookFlowHook} from "../src/HookFlowHook.sol";
import {HookFlowTypes} from "../src/types/HookFlowTypes.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolManager} from "v4-core/src/PoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";

contract HookFlowFactory {
    error HookAddressMismatch(address hook, uint160 expectedFlags);

    event HookDeployed(address indexed hook, address indexed owner, address indexed poolManager, bytes32 salt);

    function deploy(bytes32 salt, address owner, address poolManager) external returns (HookFlowHook hook) {
        hook = new HookFlowHook{salt: salt}(owner, poolManager);
        uint160 expectedFlags = Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG;

        if (uint160(address(hook)) & Hooks.ALL_HOOK_MASK != expectedFlags) {
            revert HookAddressMismatch(address(hook), expectedFlags);
        }

        emit HookDeployed(address(hook), owner, poolManager, salt);
    }

    function computeAddress(bytes32 salt, address owner, address poolManager) external view returns (address) {
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(HookFlowHook).creationCode, abi.encode(owner, poolManager)));
        return address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), address(this), salt, initCodeHash)))));
    }
}

contract DeployHookFlow is Script {
    using PoolIdLibrary for PoolKey;

    address internal constant SEPOLIA_POOL_MANAGER = 0xE03A1074c86CFeDd5C142C4F04F1a1536e203543;
    uint160 internal constant HOOK_FLAGS = Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG;

    error TokensOutOfOrder(address token0, address token1);

    function run() external returns (HookFlowFactory factory, HookFlowHook hook, PoolId poolId) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address poolManager = vm.envOr("POOL_MANAGER", SEPOLIA_POOL_MANAGER);
        address owner = vm.envOr("HOOK_OWNER", vm.addr(deployerKey));
        address token0 = vm.envAddress("TOKEN0");
        address token1 = vm.envAddress("TOKEN1");
        bool deployPoolManager = vm.envOr("DEPLOY_POOL_MANAGER", false);
        int24 tickSpacing = int24(vm.envOr("TICK_SPACING", int256(60)));
        uint160 sqrtPriceX96 = uint160(vm.envOr("SQRT_PRICE_X96", uint256(79_228_162_514_264_337_593_543_950_336)));
        bool initializePool = vm.envOr("INITIALIZE_POOL", true);
        uint256 saltStart = vm.envOr("SALT_START", uint256(0));

        if (token0 >= token1) revert TokensOutOfOrder(token0, token1);

        vm.startBroadcast(deployerKey);

        if (deployPoolManager) {
            poolManager = address(new PoolManager(owner));
        }

        factory = new HookFlowFactory();
        bytes32 salt = mineSalt(address(factory), owner, poolManager, saltStart);
        hook = factory.deploy(salt, owner, poolManager);

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: tickSpacing,
            hooks: IHooks(address(hook))
        });
        poolId = key.toId();

        hook.setPoolConfig(poolId, demoConfig());
        if (initializePool) IPoolManager(poolManager).initialize(key, sqrtPriceX96);

        vm.stopBroadcast();
    }

    function mineSalt(address factory, address owner, address poolManager, uint256 saltStart)
        public
        pure
        returns (bytes32 salt)
    {
        bytes32 initCodeHash =
            keccak256(abi.encodePacked(type(HookFlowHook).creationCode, abi.encode(owner, poolManager)));

        for (uint256 i = saltStart; i < type(uint256).max; i++) {
            salt = bytes32(i);
            address predicted =
                address(uint160(uint256(keccak256(abi.encodePacked(bytes1(0xff), factory, salt, initCodeHash)))));

            if (uint160(predicted) & Hooks.ALL_HOOK_MASK == HOOK_FLAGS) return salt;
        }

        revert("salt not found");
    }

    function demoConfig() public pure returns (HookFlowTypes.PoolConfig memory) {
        return HookFlowTypes.PoolConfig({
            enabled: true,
            baseFeePips: 3_000,
            maxFeePips: 15_000,
            mediumSizePremiumPips: 1_000,
            largeSizePremiumPips: 5_000,
            elevatedToxicPremiumPips: 2_000,
            defensiveToxicPremiumPips: 8_000,
            mediumTradeSize: 0.011 ether,
            largeTradeSize: 0.012 ether,
            toxicScoreElevated: 55,
            toxicScoreDefensive: 80,
            cooldownSeconds: 300,
            windowSeconds: 900
        });
    }
}
