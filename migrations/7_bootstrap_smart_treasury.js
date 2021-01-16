const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");
const addresses = require('./addresses');

module.exports = async function (deployer, network, accounts) {
  if (network === 'test' || network === 'development' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]

  let smartTreasuryBootstrapInstance = await SmartTreasuryBootstrap.deployed()

  if (network == 'local') {
    web3.eth.sendTransaction({to: _addresses.multisig, from: accounts[0], value: web3.utils.toWei("0.5", "ether")})
  }

  await smartTreasuryBootstrapInstance._setIDLEPrice(web3.utils.toWei("370"), {from: _addresses.multisig}) // # 370 IDLE / WETH

  await smartTreasuryBootstrapInstance.swap({from: _addresses.multisig})
  await smartTreasuryBootstrapInstance.initialise({from: _addresses.multisig})
  await smartTreasuryBootstrapInstance.bootstrap({from: _addresses.multisig})
  await smartTreasuryBootstrapInstance.renounce({from: _addresses.multisig})
}
