const FeeCollector = artifacts.require("FeeCollector");
const addresses = require('./addresses');

module.exports = async function (deployer, network) {
  if (network === 'test' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]

  deployer.then(function() {
    return FeeCollector.deployed()
  }).then(function (instance) {
    _addresses.feeTokens.forEach(element => {
      instance.registerTokenToDepositList(element)
    });
    return instance
  }).then(function (instance) {
    instance.replaceAdmin(_addresses.timelock)
  })
}
