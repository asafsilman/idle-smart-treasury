const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");
const addresses = require('./addresses');

module.exports = async function (deployer, network, accounts) {
  if (network === 'test' || network === 'development' || network == 'soliditycoverage' || network === 'mainnet') {
    return;
  }

  _addresses = addresses[network]

  let smartTreasuryBootstrapInstance = await SmartTreasuryBootstrap.deployed()

  if (network === 'local') {
    await web3.eth.sendTransaction({to: _addresses.multisig, from: accounts[0], value: web3.utils.toWei("0.5", "ether")})
  }

  await smartTreasuryBootstrapInstance.setIDLEPrice(web3.utils.toWei("370"), {from: _addresses.multisig}) // # 370 IDLE / WETH

  await smartTreasuryBootstrapInstance.swap([1,1,1,1,1,1,1], {from: _addresses.multisig})
  await smartTreasuryBootstrapInstance.initialise({from: _addresses.multisig})
  await smartTreasuryBootstrapInstance.bootstrap({from: _addresses.multisig})
  await smartTreasuryBootstrapInstance.renounce({from: _addresses.multisig})
}
