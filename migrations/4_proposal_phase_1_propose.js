const {BN} = require('@openzeppelin/test-helpers')

const addresses = require('./addresses')
const ERC20abi = require("../abi/erc20")

const IIdle = artifacts.require("IIdle")
const IGovernorAlpha = artifacts.require("IGovernorAlpha")
const IVesterFactory = artifacts.require("IVesterFactory")
const IVester = artifacts.require("IVester");

const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap")

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

  var founder;
  if (network !== 'mainnet') {
    founder = _addresses._founder

    // Delegate
    const idleInstance = await IIdle.at(_addresses.idle)
    const vesterFactory = await IVesterFactory.at(_addresses._vesterFactory)

    const founderVesting = await vesterFactory.vestingContracts.call(founder);
    const vesterFounder = await IVester.at(founderVesting);
    
    await idleInstance.delegate(founder, {from: founder});

    await vesterFounder.setDelegate(founder, {from: founder});
  } else {
    founder = '0x143daa7080f05557C510Be288D6491BC1bAc9958'
  }
  // propose
  const govInstance = await IGovernorAlpha.at(_addresses.governor)
  await proposeProposal(govInstance, founder, proposal)
}
