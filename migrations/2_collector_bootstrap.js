const addresses = require('./addresses');
const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");
const FeeCollector = artifacts.require("FeeCollector");

const {BN} = require('@openzeppelin/test-helpers');
const BNify = n => new BN(String(n));

module.exports = function (deployer, network) {
  if (network === 'test' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network];

  deployer.deploy(FeeCollector, 
    _addresses.uniswapRouterAddress,
    _addresses.weth,
    _addresses.feeTreasuryAddress,
    BNify('80000') // 80% to smart treasury
    ).then(function() {
      deployer.deploy(SmartTreasuryBootstrap,
        _addresses.balancerCoreFactory,
        _addresses.balancerCRPFactory,
        _addresses.uniswapRouterAddress,
        _addresses.idle,
        _addresses.weth,
        _addresses.timelock,
        FeeCollector.address
      )
    })
}
