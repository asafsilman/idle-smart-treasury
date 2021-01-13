const addresses = require('./addresses');
const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");

module.exports = async function (deployer, network) {
  if (network === 'test' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]

  let smartTreasuryBootstrapInstance = await SmartTreasuryBootstrap.deployed()
  smartTreasuryBootstrapInstance.transferOwnership(_addresses.multisig)

}
