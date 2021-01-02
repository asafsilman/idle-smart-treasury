const Migrations = artifacts.require("Migrations");

module.exports = function (deployer, network) {
  if (network === 'test' || network == 'soliditycoverage') {
    return;
  }

  deployer.deploy(Migrations);
};
