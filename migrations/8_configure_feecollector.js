const {BN} = require('@openzeppelin/test-helpers')

const FeeCollector = artifacts.require("FeeCollector");
const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");

const addresses = require('./addresses');


const BNify = n => new BN(String(n))

const ratio_one_pecrent = BNify('1000')

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

  let allocation = [
    ratio_one_pecrent.mul(BNify('80')),
    ratio_one_pecrent.mul(BNify('15')), // fee treasury
    ratio_one_pecrent.mul(BNify('5'))   // rebalalncer
  ]

  await feeCollectorInstance.addBeneficiaryAddress(_addresses.idleRebalancer, allocation, {from: _addresses.multisig})

  await feeCollectorInstance.replaceAdmin(_addresses.timelock, {from: _addresses.multisig})
}
