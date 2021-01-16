const FeeCollector = artifacts.require("FeeCollector");
const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");

const addresses = require('./addresses');

module.exports = async function (deployer, network) {
  if (network === 'test' || network === 'development' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]

  let smartTreasuryBootstrapInstance = await SmartTreasuryBootstrap.deployed()
  let feeCollectorInstance = await FeeCollector.deployed()
  

  let crpAddress = await smartTreasuryBootstrapInstance._getCRPAddress.call()
  await feeCollectorInstance.setSmartTreasuryAddress(crpAddress, {from: _addresses.multisig})
  await feeCollectorInstance.addAddressToWhiteList(_addresses.idleRebalancer, {from: _addresses.multisig})

  await feeCollectorInstance.replaceAdmin(_addresses.timelock, {from: _addresses.multisig})
}
