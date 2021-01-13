const FeeCollector = artifacts.require("FeeCollector");
const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");
const addresses = require('./addresses');

module.exports = async function (deployer, network) {
  if (network === 'test' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]

  let feeCollectorInstance = await FeeCollector.deployed()

  await deployer.deploy(SmartTreasuryBootstrap,
    _addresses.balancerCoreFactory,
    _addresses.balancerCRPFactory,
    // _addresses.uniswapRouterAddress,
    _addresses.idle,
    _addresses.weth,
    _addresses.timelock,
    feeCollectorInstance.address,
    _addresses.multisig,
    _addresses.feeTokens
  )
}

