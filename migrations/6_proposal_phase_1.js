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

  let bootstrapInstance = await SmartTreasuryBootstrap.deployed()

  let proposal = {
    targets: [_addresses.ecosystemFund],
    values: [BNify("0")],
    signatures: ["transfer(address,address,uint256)"],
    calldatas: [web3.eth.abi.encodeParameters(
      ['address', 'address', 'uint256'],
      [_addresses.idle, bootstrapInstance.address, web3.utils.toWei(BNify("130000"))]
    )],
    description: 'Test',
    from: _addresses._founder
  }

  // await _addresses.feeTokens.map((el) => {
  for (let i = 0; i < _addresses.feeTokens.length; i++) {
    let el = _addresses.feeTokens[i]
    var contract = new web3.eth.Contract(ERC20abi, el)

    await contract.methods.balanceOf(_addresses.feeTreasuryAddress).call().then((bal) => {
      proposal.targets.push(_addresses.feeTreasuryAddress)
      proposal.values.push(BNify("0"))
      proposal.signatures.push("transfer(address,address,uint256)")
      proposal.calldatas.push(web3.eth.abi.encodeParameters(['address', 'address', 'uint256'], [el, bootstrapInstance.address, bal]))
    })
  }


  const idleInstance = await IIdle.at(_addresses.idle)
  const govInstance = await IGovernorAlpha.at(_addresses.governor)
  const vesterFactory = await IVesterFactory.at(_addresses._vesterFactory)
  // console.log(proposal)

  const founder = _addresses._founder
  console.log(founder)

  const founderVesting = await vesterFactory.vestingContracts.call(founder);
  const vesterFounder = await IVester.at(founderVesting);
  
  await idleInstance.delegate(founder, {from: founder});

  await vesterFounder.setDelegate(founder, {from: founder});

  await executeProposal(govInstance, founder, proposal)
}
