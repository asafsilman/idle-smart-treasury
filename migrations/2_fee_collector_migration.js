const addresses = require('./addresses');
const FeeCollector = artifacts.require("FeeCollector");

module.exports = function (deployer, network) {
  if (network == "live") {
    
  }
  else if (network == "development") {
    _addresses = addresses.development;
    deployer.deploy(FeeCollector, 
      _addresses.uniswapRouterAddress,
      _addresses.weth,
      _addresses.feeTreasuryAddress,
      _addresses.smartTreasuryAddress);
  }
};