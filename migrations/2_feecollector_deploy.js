const addresses = require('./addresses');
const FeeCollector = artifacts.require("FeeCollector");

const {BN} = require('@openzeppelin/test-helpers');
const BNify = n => new BN(String(n));

module.exports = function (deployer, network) {
  if (network === 'test' || network === 'development' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network];

  deployer.deploy(FeeCollector, 
    _addresses.weth,
    _addresses.feeTreasuryAddress,
    _addresses.idleRebalancer,
    _addresses.multisig,
    _addresses.feeTokens
    )
}
