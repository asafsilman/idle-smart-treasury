const FeeCollector = artifacts.require("FeeCollector");
const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");

const addresses = require('./addresses');

module.exports = async function (deployer, network) {
  if (network === 'test' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]

  let smartTreasuryBootstrapInstance = await SmartTreasuryBootstrap.deployed()
  let feeCollectorInstance = await FeeCollector.deployed()
  

  let crpAddress = await smartTreasuryBootstrapInstance._getCRPAddress.call()
  console.log(crpAddress)
  await feeCollectorInstance.setSmartTreasuryAddress(crpAddress, {from: _addresses.multisig})

  await feeCollectorInstance.replaceAdmin(_addresses.timelock, {from: _addresses.multisig})
}
