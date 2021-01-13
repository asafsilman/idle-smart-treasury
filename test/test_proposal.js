const {BN, constants, expectRevert, time} = require('@openzeppelin/test-helpers')

const { expect } = require('chai');

const FeeCollector = artifacts.require('FeeCollector')
const IIdle = artifacts.require("IIdle");
const IGovernorAlpha = artifacts.require("IGovernorAlpha");
const IVesterFactory = artifacts.require("IVesterFactory");
const IVester = artifacts.require("IVester");

const addresses = require("../migrations/addresses").development

const BNify = n => new BN(String(n))
const ONE = BNify('1000000000000000000') // 18 decimals
const timelockDelay = 172800

const advanceBlocks = async n => {
  for (var i = 0; i < n; i++) {
    await time.advanceBlock()
  }
};

const bigLog = (txt, val) => {
  console.log(txt, BNify(val).div(ONE).toString());
};

const bigLog2 = (txt, val) => {
  console.log(txt, BNify(val).toString());
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

  const currTime2 = BNify((await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp)
  bigLog2("The current block timestamp", currTime2)
  // await advanceTime(BNify(timelockDelay)).add(BNify('100'))
  await time.increase(timelockDelay+100)
  await advanceBlocks(1)

  const currTime3 = BNify((await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp)
  bigLog2("The current block timestamp", currTime3)


  await gov.execute(proposalId);
  console.log('executed');
  await advanceBlocks(2);
};

// describe("Test Proposal", async function() {
//   it("Creates and executes proposal", async function() {
//     const founder = addresses._founder
//     const idleInstance = await IIdle.at(addresses.idle)
//     const govInstance = await IGovernorAlpha.at(addresses.governor)
//     const vesterFactory = await IVesterFactory.at(addresses._vesterFactory)

//     const founderVesting = await vesterFactory.vestingContracts.call(founder);
//     console.log(founderVesting)
//     const vesterFounder = await IVester.at(founderVesting);

//     bigLog('bal of vesting contract', await idleInstance.balanceOf(vesterFounder.address));
//     await idleInstance.delegate(founder, {from: founder});
//     console.log('delegates founder to founder');
//     await vesterFounder.setDelegate(founder, {from: founder});
//     console.log('delegates vesterFounder to founder');

//     const feeCollectorInstance = await FeeCollector.new(
//       addresses.uniswapRouterAddress,
//       addresses.weth,
//       addresses.feeTreasuryAddress,
//       BNify('0'),
//       []
//     )

//     await executeProposal(govInstance, founder, {
//       targets: ["0x3fe7940616e5bc47b0775a0dccf6237893353bb4"], // targets //Idle Dai  v4
//       values: [BNify('0')], // values
//       signatures: ["setFeeAddress(address)"], // signatures
//       calldatas: [web3.eth.abi.encodeParameters(['address'], [feeCollectorInstance.address])], // calldatas
//       description: 'Test',
//       from: founder
//     });
//   })
// })
