const {BN, time} = require('@openzeppelin/test-helpers')

const addresses = require('./addresses')
const ERC20abi = require("../abi/erc20")

const IIdle = artifacts.require("IIdle")
const IGovernorAlpha = artifacts.require("IGovernorAlpha")
const IVesterFactory = artifacts.require("IVesterFactory")
const IVester = artifacts.require("IVester");

const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap")

const BNify = n => new BN(String(n))
const timelockDelay = 172800

const advanceBlocks = async n => {
  for (var i = 0; i < n; i++) {
    await time.advanceBlock()
  }
};

const getLatestPropsal = async (gov) => {
  return gov.proposalCount.call()
}

const executeProposal = async (gov, proposalId) => {
  await time.increase(timelockDelay+100)
  await advanceBlocks(1)

  await gov.execute(proposalId);
  console.log('executed');
  await advanceBlocks(2);
};

module.exports = async function (_deployer, network) {
  if (network !== 'local') {
    return;
  }

  _addresses = addresses[network]

  const govInstance = await IGovernorAlpha.at(_addresses.governor)

  const proposalId = await getLatestPropsal(govInstance)
  await executeProposal(govInstance, proposalId)
}
