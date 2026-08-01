// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {HookFlowHook} from "../src/HookFlowHook.sol";
import {HookFlowFeeLogic} from "../src/libraries/HookFlowFeeLogic.sol";
import {HookFlowTypes} from "../src/types/HookFlowTypes.sol";
import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {LPFeeLibrary} from "v4-core/src/libraries/LPFeeLibrary.sol";
import {BalanceDelta, toBalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {SwapParams} from "v4-core/src/types/PoolOperation.sol";

contract PresetAttacker {
    function tryApplySafePreset(HookFlowHook hook, PoolId poolId, HookFlowTypes.Preset preset) external {
        hook.applySafePreset(poolId, preset);
    }

    function trySetPresetOperator(HookFlowHook hook, address operator) external {
        hook.setPresetOperator(operator);
    }
}

contract HookFlowHookTest {
    HookFlowHook internal hook;
    HookFlowHook internal protectedHook;
    PoolKey internal key;
    PoolKey internal protectedKey;
    PoolId internal poolId;
    PoolId internal protectedPoolId;

    function setUp() public {
        hook = new HookFlowHook(address(this), address(this));
        protectedHook = new HookFlowHook(address(this), address(0xCAFE));

        key = PoolKey({
            currency0: Currency.wrap(address(0xA0)),
            currency1: Currency.wrap(address(0xB0)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(hook))
        });
        poolId = hook.getPoolId(key);

        protectedKey = PoolKey({
            currency0: Currency.wrap(address(0xA0)),
            currency1: Currency.wrap(address(0xB0)),
            fee: LPFeeLibrary.DYNAMIC_FEE_FLAG,
            tickSpacing: 60,
            hooks: IHooks(address(protectedHook))
        });
        protectedPoolId = protectedHook.getPoolId(protectedKey);

        hook.setPoolConfig(
            poolId,
            HookFlowTypes.PoolConfig({
                enabled: true,
                baseFeePips: 3_000,
                maxFeePips: 15_000,
                mediumSizePremiumPips: 1_000,
                largeSizePremiumPips: 5_000,
                elevatedToxicPremiumPips: 2_000,
                defensiveToxicPremiumPips: 8_000,
                mediumTradeSize: 100 ether,
                largeTradeSize: 500 ether,
                toxicScoreElevated: 55,
                toxicScoreDefensive: 80,
                cooldownSeconds: 300,
                windowSeconds: 900
            })
        );
        protectedHook.applyPreset(protectedPoolId, HookFlowTypes.Preset.VolatilePair);
    }

    function testBeforeSwapReturnsFixedBaseFeeOverrideForSmallBenignTrade() public {
        SwapParams memory params = _params(false, 1 ether);

        (bytes4 selector,, uint24 feeWithFlag) = hook.beforeSwap(address(this), key, params, "");

        _assertEq(selector, IHooks.beforeSwap.selector, "selector");
        _assertEq(feeWithFlag, LPFeeLibrary.OVERRIDE_FEE_FLAG | 3_000, "fee override");
    }

    function testSizePremiumIncreasesMediumAndLargeTrades() public view {
        HookFlowTypes.FeeQuote memory medium = hook.quoteSwap(poolId, _params(false, 100 ether), 1);
        HookFlowTypes.FeeQuote memory large = hook.quoteSwap(poolId, _params(false, 500 ether), 1);

        _assertEq(medium.feePips, 4_000, "medium fee");
        _assertEq(uint256(medium.sizeBucket), uint256(HookFlowTypes.SizeBucket.Medium), "medium bucket");
        _assertEq(large.feePips, 8_000, "large fee");
        _assertEq(uint256(large.sizeBucket), uint256(HookFlowTypes.SizeBucket.Large), "large bucket");
    }

    function testToxicityPremiumAppliesAfterRepeatedSameDirectionFlow() public {
        hook.recordSwap(poolId, _params(false, 10 ether), 1);
        hook.recordSwap(poolId, _params(false, 10 ether), 2);
        hook.recordSwap(poolId, _params(false, 10 ether), 3);

        HookFlowTypes.FeeQuote memory quote = hook.quoteSwap(poolId, _params(false, 10 ether), 4);

        _assertEq(quote.toxicScore >= 55, true, "toxic score elevated");
        _assertEq(quote.defensiveMode, false, "not defensive yet");
        _assertEq(quote.feePips, 5_000, "elevated fee");
    }

    function testDefensiveCooldownKeepsPremiumAfterTriggeringTrade() public {
        hook.recordSwap(poolId, _params(false, 10 ether), 1);
        hook.recordSwap(poolId, _params(false, 10 ether), 2);
        hook.recordSwap(poolId, _params(false, 10 ether), 3);
        hook.recordSwap(poolId, _params(false, 10 ether), 4);
        hook.recordSwap(poolId, _params(false, 10 ether), 5);

        HookFlowTypes.FeeQuote memory duringCooldown = hook.quoteSwap(poolId, _params(true, 1 ether), 100);
        HookFlowTypes.FeeQuote memory afterCooldown = hook.quoteSwap(poolId, _params(true, 1 ether), 400);

        _assertEq(duringCooldown.defensiveMode, true, "defensive mode");
        _assertEq(duringCooldown.feePips, 11_000, "defensive fee");
        _assertEq(afterCooldown.defensiveMode, false, "cooldown expired");
    }

    function testAfterSwapUpdatesFlowStateThroughRealHookPath() public {
        SwapParams memory params = _params(false, 10 ether);

        (bytes4 selector,) = hook.afterSwap(address(this), key, params, toBalanceDelta(0, 10 ether), "");
        (,, uint128 buyVolume,,,,) = hook.poolFlowStates(poolId);

        _assertEq(selector, IHooks.afterSwap.selector, "selector");
        _assertEq(buyVolume, 10 ether, "buy volume");
    }

    function testApplyPresetConfiguresLaunchPool() public {
        hook.applyPreset(poolId, HookFlowTypes.Preset.LaunchPool);

        HookFlowTypes.FeeQuote memory quote = hook.quoteSwap(poolId, _params(false, 25 ether), 1);

        _assertEq(quote.feePips, 7_500, "launch medium fee");
        _assertEq(uint256(quote.sizeBucket), uint256(HookFlowTypes.SizeBucket.Medium), "launch bucket");
    }

    function testApplySafePresetLetsAuthorizedOperatorConfigureNewPoolOnce() public {
        PoolId newPoolId = PoolId.wrap(bytes32(uint256(42)));
        PresetAttacker operator = new PresetAttacker();
        hook.setPresetOperator(address(operator));

        operator.tryApplySafePreset(hook, newPoolId, HookFlowTypes.Preset.StablePair);
        HookFlowTypes.FeeQuote memory quote = hook.quoteSwap(newPoolId, _params(false, 1 ether), 1);

        _assertEq(quote.feePips, 500, "stable base fee");
    }

    function testApplySafePresetCannotOverwriteConfiguredPool() public {
        (bool success,) =
            address(hook).call(abi.encodeCall(HookFlowHook.applySafePreset, (poolId, HookFlowTypes.Preset.StablePair)));

        _assertEq(success, false, "safe preset overwrote config");
    }

    function testApplySafePresetRejectsUnauthorizedCaller() public {
        PresetAttacker attacker = new PresetAttacker();
        PoolId newPoolId = PoolId.wrap(bytes32(uint256(99)));

        (bool success,) = address(attacker).call(
            abi.encodeCall(PresetAttacker.tryApplySafePreset, (hook, newPoolId, HookFlowTypes.Preset.StablePair))
        );

        _assertEq(success, false, "unauthorized preset caller");
    }

    function testOnlyOwnerCanSetPresetOperator() public {
        PresetAttacker attacker = new PresetAttacker();

        (bool success,) = address(attacker).call(
            abi.encodeCall(PresetAttacker.trySetPresetOperator, (hook, address(attacker)))
        );

        _assertEq(success, false, "unauthorized operator setter");
    }

    function testAfterSwapUsesExecutedDeltaInsteadOfRequestedSize() public {
        SwapParams memory params = _params(false, 500 ether);

        hook.afterSwap(address(this), key, params, toBalanceDelta(0, 10 ether), "");
        (,, uint128 buyVolume,,,,) = hook.poolFlowStates(poolId);

        _assertEq(buyVolume, 10 ether, "requested amount used instead of executed delta");
    }

    function testInvalidConfigReverts() public {
        HookFlowTypes.PoolConfig memory invalidConfig = _defaultConfig();
        invalidConfig.maxFeePips = hook.MAX_CONFIGURED_FEE_PIPS() + 1;

        (bool success,) = address(hook).call(abi.encodeCall(HookFlowHook.setPoolConfig, (poolId, invalidConfig)));

        _assertEq(success, false, "invalid config accepted");
    }

    function testFeeIsClampedToMaxFee() public {
        HookFlowTypes.PoolConfig memory config = _defaultConfig();
        config.maxFeePips = 6_000;
        hook.setPoolConfig(poolId, config);
        hook.recordSwap(poolId, _params(false, 10 ether), 1);
        hook.recordSwap(poolId, _params(false, 10 ether), 2);
        hook.recordSwap(poolId, _params(false, 10 ether), 3);

        HookFlowTypes.FeeQuote memory quote = hook.quoteSwap(poolId, _params(false, 500 ether), 4);

        _assertEq(quote.feePips, 6_000, "clamped fee");
    }

    function testOnlyPoolManagerCanCallSwapHooks() public {
        (bool beforeSuccess,) = address(protectedHook)
            .call(abi.encodeCall(IHooks.beforeSwap, (address(this), protectedKey, _params(false, 1 ether), "")));
        (bool afterSuccess,) = address(protectedHook)
            .call(
                abi.encodeCall(
                    IHooks.afterSwap, (address(this), protectedKey, _params(false, 1 ether), BalanceDelta.wrap(0), "")
                )
            );
        (bool recordSuccess,) = address(protectedHook)
            .call(abi.encodeCall(HookFlowHook.recordSwap, (protectedPoolId, _params(false, 1 ether), 1)));

        _assertEq(beforeSuccess, false, "beforeSwap access");
        _assertEq(afterSuccess, false, "afterSwap access");
        _assertEq(recordSuccess, false, "recordSwap access");
    }

    function testCooldownExpiryFallsBackToCurrentToxicity() public {
        hook.recordSwap(poolId, _params(false, 10 ether), 1);
        hook.recordSwap(poolId, _params(false, 10 ether), 2);
        hook.recordSwap(poolId, _params(false, 10 ether), 3);
        hook.recordSwap(poolId, _params(false, 10 ether), 4);
        hook.recordSwap(poolId, _params(false, 10 ether), 5);

        HookFlowTypes.FeeQuote memory afterCooldown = hook.quoteSwap(poolId, _params(true, 1 ether), 400);

        _assertEq(afterCooldown.defensiveMode, false, "cooldown expired");
        _assertEq(afterCooldown.feePips, 3_000, "normal fee after reversal");
    }

    function _params(bool zeroForOne, uint256 amount) private pure returns (SwapParams memory) {
        return SwapParams({zeroForOne: zeroForOne, amountSpecified: -int256(amount), sqrtPriceLimitX96: 0});
    }

    function _defaultConfig() private pure returns (HookFlowTypes.PoolConfig memory) {
        return HookFlowTypes.PoolConfig({
            enabled: true,
            baseFeePips: 3_000,
            maxFeePips: 15_000,
            mediumSizePremiumPips: 1_000,
            largeSizePremiumPips: 5_000,
            elevatedToxicPremiumPips: 2_000,
            defensiveToxicPremiumPips: 8_000,
            mediumTradeSize: 100 ether,
            largeTradeSize: 500 ether,
            toxicScoreElevated: 55,
            toxicScoreDefensive: 80,
            cooldownSeconds: 300,
            windowSeconds: 900
        });
    }

    function _assertEq(uint256 actual, uint256 expected, string memory label) private pure {
        require(actual == expected, label);
    }

    function _assertEq(bool actual, bool expected, string memory label) private pure {
        require(actual == expected, label);
    }

    function _assertEq(bytes4 actual, bytes4 expected, string memory label) private pure {
        require(actual == expected, label);
    }
}
