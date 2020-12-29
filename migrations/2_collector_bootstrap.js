const addresses = require('./addresses');
const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");
const FeeCollector = artifacts.require("FeeCollector");

module.exports = function (deployer, network) {
  _addresses = addresses[network];

  deployer.deploy(FeeCollector, 
    _addresses.uniswapRouterAddress,
    _addresses.weth,
    _addresses.feeTreasuryAddress).then(function() {
      deployer.deploy(SmartTreasuryBootstrap,
        _addresses.balancerCoreFactory,
        _addresses.balancerCRPFactory,
        _addresses.uniswapFactory,
        _addresses.uniswapRouterAddress,
        _addresses.idle,
        _addresses.weth,
        _addresses.governanceAddress,
        FeeCollector.address
      )
    })
}
