const {BN} = require('@openzeppelin/test-helpers')

const addresses = require('./addresses')

const FeeCollector = artifacts.require("FeeCollector");

const IGovernorAlpha = artifacts.require("IGovernorAlpha")

const BNify = n => new BN(String(n))

const proposeProposal = async (gov, founder, {targets, values, signatures, calldatas, description, from}) => {
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

  const founder = _addresses._founder

  const govInstance = await IGovernorAlpha.at(_addresses.governor)

  // assume already delegated to `founder` address
  // propose
  await proposeProposal(govInstance, founder, proposal)
}
