const FeeCollector = artifacts.require("FeeCollector");
const addresses = require('./addresses');

module.exports = async function (deployer, network) {
  if (network === 'test' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]

  let feeCollectorInstance = await FeeCollector.deployed()

  feeCollectorInstance.replaceAdmin(_addresses.multisig)
}
