const addresses = require('./addresses');
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
    )
}
