const {BN, time} = require('@openzeppelin/test-helpers')

const addresses = require('./addresses')

const IIdle = artifacts.require("IIdle")
const IGovernorAlpha = artifacts.require("IGovernorAlpha")
const IVesterFactory = artifacts.require("IVesterFactory")
const IVester = artifacts.require("IVester");

const FeeCollector = artifacts.require("FeeCollector");

const BNify = n => new BN(String(n))
const timelockDelay = 172800

const advanceBlocks = async n => {
  for (var i = 0; i < n; i++) {
    await time.advanceBlock()
  }
};

const executeProposal = async (gov, founder, {targets, values, signatures, calldatas, description, from}) => {
  await gov.propose(targets, values, signatures, calldatas, description,
    {from}
  );
    
  // need 1 block to pass before being able to vote but less than 10
  await advanceBlocks(2);
  let proposalId = await gov.proposalCount.call()
  console.log(`proposed ${proposalId.toString()}`)

  await gov.castVote(proposalId, true, {from: founder});
  console.log('voted');

  // Need to advance 3d in blocs + 1
  await advanceBlocks(17281);

  await gov.queue(proposalId);
  console.log('queued');

  await time.increase(timelockDelay+100)
  await advanceBlocks(1)

  await gov.execute(proposalId);
  console.log('executed');
  await advanceBlocks(2);
};

module.exports = async function (_deployer, network) {
  if (network === 'test' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]

  let feeCollectorInstance = await FeeCollector.deployed()

  let proposal = {
    targets: [_addresses.ecosystemFund],
    values: [BNify("0")],
    signatures: ["transfer(address,address,uint256)"],
    calldatas: [web3.eth.abi.encodeParameters(
      ['address', 'address', 'uint256'],
      [_addresses.idle, "0x1929A0454cDD4d925E8Fc9b6c366ECD7844866F2", web3.utils.toWei(BNify("1000"))] // transfer 1000 idle to 8bitporkchop as payment
    )],
    description: 'Test',
    from: _addresses._founder
  }

  for (let i = 0; i < _addresses.idleTokens.length; i++) {
    let token = _addresses.idleTokens[i]

    proposal.targets.push(token)
    proposal.values.push(BNify("0"))
    proposal.signatures.push("setFeeAddress(address)")
    proposal.calldatas.push(web3.eth.abi.encodeParameters(['address'], [feeCollectorInstance.address]))
  }

  const idleInstance = await IIdle.at(_addresses.idle)
  const govInstance = await IGovernorAlpha.at(_addresses.governor)
  const vesterFactory = await IVesterFactory.at(_addresses._vesterFactory)

  const founder = _addresses._founder

  const founderVesting = await vesterFactory.vestingContracts.call(founder);
  const vesterFounder = await IVester.at(founderVesting);
  
  await idleInstance.delegate(founder, {from: founder});

  await vesterFounder.setDelegate(founder, {from: founder});

  await executeProposal(govInstance, founder, proposal)
}
