const addresses = require('./addresses');
const FeeCollector = artifacts.require("FeeCollector");

module.exports = function (deployer, network) {
  _addresses = addresses[network];
  
  deployer.deploy(FeeCollector, 
    _addresses.uniswapRouterAddress,
    _addresses.weth,
    _addresses.feeTreasuryAddress,
    _addresses.feeTreasuryAddress); // TODO: CHANGE THIS !!!!!!
};
