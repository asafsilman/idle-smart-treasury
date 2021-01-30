const {BN} = require('@openzeppelin/test-helpers')

const addresses = require('./addresses')

const FeeCollector = artifacts.require("FeeCollector");

const IGovernorAlpha = artifacts.require("IGovernorAlpha")

const BNify = n => new BN(String(n))

const proposeProposal = async (gov, from, {targets, values, signatures, calldatas, description}) => {
  await gov.propose(targets, values, signatures, calldatas, description,
    {from}
  );
};

module.exports = async function (_deployer, network) {
  if (network === 'test' || network === 'development' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]

  let feeCollectorInstance = await FeeCollector.deployed()

  let proposal = {
    targets: [],
    values: [],
    signatures: [],
    calldatas: [],
    description: '#IIP 2 - Add a Smart Treasury (2/2) \n Set fee address for idle tokens to FeeCollector contract. Full details https://gov.idle.finance/t/iip-2-add-a-smart-treasury-to-idle/211',
  }

  for (let i = 0; i < _addresses.idleTokens.length; i++) {
    let token = _addresses.idleTokens[i]

    proposal.targets.push(token)
    proposal.values.push(BNify("0"))
    proposal.signatures.push("setFeeAddress(address)")
    proposal.calldatas.push(web3.eth.abi.encodeParameters(['address'], [feeCollectorInstance.address]))
  }

  var founder;
  if (network !== 'mainnet') {
    founder = _addresses._founder
  } else {
    founder = '0x143daa7080f05557C510Be288D6491BC1bAc9958'
  }

  console.log(`Transaction Sender: ${founder}`)
  const govInstance = await IGovernorAlpha.at(_addresses.governor)

  // assume already delegated to `founder` address
  // propose
  await proposeProposal(govInstance, founder, proposal)
}
