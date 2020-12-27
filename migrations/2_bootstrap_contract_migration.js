const addresses = require('./addresses');
const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");

module.exports = function (deployer, network) {
  _addresses = addresses[network];

  deployer.deploy(SmartTreasuryBootstrap,
    _addresses.balancerCoreFactory,
    _addresses.balancerCRPFactory,
    _addresses.uniswapFactory,
    _addresses.uniswapRouterAddress,
    _addresses.idle,
    _addresses.weth
  )
}
