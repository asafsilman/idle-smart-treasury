const Migrations = artifacts.require("Migrations");

module.exports = function (deployer, network) {
  if (network === 'test' || network == 'coverage') {
    return;
  }

  deployer.deploy(Migrations);
};
