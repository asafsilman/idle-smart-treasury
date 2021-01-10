const addresses = require('./addresses');
const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");

module.exports = async function (deployer, network) {
  if (network === 'test' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]

  deployer.then(function() {
    return SmartTreasuryBootstrap.deployed()
  }).then(function (instance) {
    _addresses.feeTokens.forEach(element => {
      instance._registerTokenToDepositList(element)
    });
    return instance
  }).then(function (instance) {
    instance.transferOwnership(_addresses.multisig)
  })
}
