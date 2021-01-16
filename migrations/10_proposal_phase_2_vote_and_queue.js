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

const voteAndQueueProposal = async (gov, founder, proposalId) => {    
  await gov.castVote(proposalId, true, {from: founder});
  console.log('voted');

  // Need to advance 3d in blocs + 1
  await advanceBlocks(17281);

  await gov.queue(proposalId);
  console.log('queued');
};

module.exports = async function (_deployer, network) {
  if (network === 'test' || network === 'development' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]
  const founder = _addresses._founder

  const govInstance = await IGovernorAlpha.at(_addresses.governor)

  const proposalId = await getLatestPropsal(govInstance)
  await voteAndQueueProposal(govInstance, founder, proposalId)
}
