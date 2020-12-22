const addresses = require('./addresses');
const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");


module.exports = function(deployer, network, accounts) {
  if (network == "live") {}

  else if (network == "development") {
    _addresses = addresses.development;

    deployer.deploy(SmartTreasuryBootstrap,
      _addresses.balancerCoreFactory,
      _addresses.balancerCRPFactory,
      _addresses.idle,
      _addresses.weth
    )
  }
}
