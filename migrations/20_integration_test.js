const FeeCollector = artifacts.require("FeeCollector");
const IGovernorAlpha = artifacts.require("IGovernorAlpha");
const SmartTreasuryBootstrap = artifacts.require("SmartTreasuryBootstrap");
const ConfigurableRightsPool = artifacts.require("ConfigurableRightsPool");
const BPool = artifacts.require("BPool");
const IIdle = artifacts.require("IIdle");
const IERC20 = artifacts.require("IERC20");
const addresses = require('./addresses');
const {BN, time} = require('@openzeppelin/test-helpers');

const TOKENS_HOLDER = "0xfbb1b73c4f0bda4f67dca266ce6ef42f520fbb98";

const toBN = (v) => new BN(v.toString());
const timelockDelay = 172800

const check = (a, b, message) => {
  let [icon, symbol] = a === b ? ["✔️", "==="] : ["🚨🚨🚨", "!=="];
  console.log(`${icon}  `, a, symbol, b, message ? message : "");
}

const checkGreater = (a, b, message) => {
  let [icon, symbol] = b.gt(a) ? ["✔️", ">"] : ["🚨🚨🚨", "<="];
  console.log(`${icon}  `, a.toString(), symbol, b.toString(), message ? message : "");
}

const advanceBlocks = async n => {
  for (var i = 0; i < n; i++) {
    if (i === 0 || i % 100 === 0) {
      process.stdout.clearLine();  // clear current text
      process.stdout.cursorTo(0);
      process.stdout.write(`waiting for ${n - i} blocks`);
    }

    await time.advanceBlock();
  }
};


module.exports = async function (deployer, network) {
  if (network === 'test' || network === 'development' || network == 'soliditycoverage') {
    return;
  }

  _addresses = addresses[network]

  const accounts = await web3.eth.getAccounts();
  await web3.eth.sendTransaction({ from: TOKENS_HOLDER, to: _addresses.timelock, value: "10000000000000000000" });
  await web3.eth.sendTransaction({ from: TOKENS_HOLDER, to: _addresses.multisig, value: "10000000000000000000" });
  await web3.eth.sendTransaction({ from: TOKENS_HOLDER, to: _addresses.ecosystemFund, value: "10000000000000000000" });
  await web3.eth.sendTransaction({ from: TOKENS_HOLDER, to: _addresses._founder, value: "10000000000000000000" });

  // // tests (SB = SmartTreasuryBootstrap, ST = Smart treasury, FC = FeeCollector)

  // governance or multisig can withdraw funds from FC
  // governance can set ST params as ST controller
  // gov or multisig can withdrawUnderlying from FC
  // gov or multisig can replaceAdmin in FC
  // multisig can whitelist
  // whitelist can call deposit in FC ?

  const getLatestPropsal = async (gov) => {
    return gov.proposalCount.call()
  }

  const createProposal = async (gov, founder, {targets, values, signatures, calldatas, description, from}, log) => {
    console.log(`Proposing: ${log}`);
    await gov.propose(targets, values, signatures, calldatas, description,
      {from}
    );
    // need 1 block to pass before being able to vote but less than 10
    await advanceBlocks(2);
    const proposalId = await getLatestPropsal(gov);
    await gov.castVote(proposalId, true, {from: founder});
    console.log('voted');

    // Need to advance 3d in blocs + 1
    await advanceBlocks(17281);

    await gov.queue(proposalId);
    console.log('queued');

    await time.increase(timelockDelay+100)
    console.log("time increased")
    await advanceBlocks(1)
    console.log("advanced 1")

    await gov.execute(proposalId);
    console.log('executed');
    await advanceBlocks(2);
  };

  let smartTreasuryBootstrapInstance = await SmartTreasuryBootstrap.deployed()
  let feeCollectorInstance = await FeeCollector.deployed()
  const govInstance = await IGovernorAlpha.at(_addresses.governor)
  let crpAddress = await smartTreasuryBootstrapInstance.getCRPAddress.call()
  console.log("*************************** crpAddress", crpAddress)
  const smartTreasuryInstance = await ConfigurableRightsPool.at(crpAddress);
  const bPoolAddress = await smartTreasuryInstance.bPool();
  const bPoolInstance = await BPool.at(bPoolAddress);

  let founder = _addresses._founder;

  // tests (SB = SmartTreasuryBootstrap, ST = Smart treasury, FC = FeeCollector)

  //////////////////////////////////////////////////////////
  // governance or multisig can withdraw funds from SB
  let propName = 'governance or multisig can withdraw funds from SB';
  let proposal = {
    targets: [smartTreasuryBootstrapInstance.address],
    values: [toBN("0")],
    signatures: ["withdraw(address,address,uint256)"],
    calldatas: [web3.eth.abi.encodeParameters(
      ['address', 'address', 'uint256'],
      [_addresses.dai, _addresses._founder, toBN("1")]
    )],
    description: propName,
    from: founder
  }

  // send DAI from TOKENS_HOLDER to smartTreasuryBootstrapInstance
  let DAI = await IERC20.at(_addresses.dai);
  let balanceBeforeTx = await DAI.balanceOf(smartTreasuryBootstrapInstance.address);
  await DAI.transfer(smartTreasuryBootstrapInstance.address, 2, { from: TOKENS_HOLDER });
  let balanceAfterTx = await DAI.balanceOf(smartTreasuryBootstrapInstance.address);
  check(toBN(balanceAfterTx).toString(), toBN(balanceBeforeTx).add(toBN("2")).toString(), "move 2 DAI to smartTreasuryBootstrapInstance");

  await createProposal(govInstance, founder, proposal, propName);
  let balanceAfterWithdraw1 = await DAI.balanceOf(smartTreasuryBootstrapInstance.address);
  check(toBN(balanceAfterWithdraw1).toString(), toBN(balanceAfterTx).sub(toBN("1")).toString(), "timelock withdraws 1 DAI from smartTreasuryBootstrapInstance");

  await smartTreasuryBootstrapInstance.withdraw(DAI.address, _addresses.timelock, "1", { from: _addresses.multisig });
  let balanceAfterWithdraw2 = await DAI.balanceOf(smartTreasuryBootstrapInstance.address);
  check(toBN(balanceAfterWithdraw2).toString(), toBN(balanceAfterTx).sub(toBN("2")).toString(), "multisig withdraws 1 DAI from smartTreasuryBootstrapInstance");

  //////////////////////////////////////////////////////////
  // governance or multisig can withdraw funds from FC
  propName = 'governance or multisig can withdraw funds from FC';
  proposal = {
    targets: [feeCollectorInstance.address],
    values: [toBN("0")],
    signatures: ["withdraw(address,address,uint256)"],
    calldatas: [web3.eth.abi.encodeParameters(
      ['address', 'address', 'uint256'],
      [_addresses.dai, _addresses._founder, toBN("1")]
    )],
    description: propName,
    from: founder
  }

  // send DAI from TOKENS_HOLDER to feeCollectorInstance
  DAI = await IERC20.at(_addresses.dai);
  balanceBeforeTx = await DAI.balanceOf(feeCollectorInstance.address);
  await DAI.transfer(feeCollectorInstance.address, 2, { from: TOKENS_HOLDER });
  balanceAfterTx = await DAI.balanceOf(feeCollectorInstance.address);
  check(toBN(balanceAfterTx).toString(), toBN(balanceBeforeTx).add(toBN("2")).toString(), "move 2 DAI to feeCollectorInstance");

  await createProposal(govInstance, founder, proposal, propName);
  balanceAfterWithdraw1 = await DAI.balanceOf(feeCollectorInstance.address);
  check(toBN(balanceAfterWithdraw1).toString(), toBN(balanceAfterTx).sub(toBN("1")).toString(), "timelock withdraws 1 DAI from feeCollectorInstance");

  //////////////////////////////////////////////////////////
  // gov or multisig can replaceAdmin in FC
  await feeCollectorInstance.replaceAdmin(_addresses.multisig, { from: _addresses.timelock });
  await feeCollectorInstance.replaceAdmin(_addresses.ecosystemFund, { from: _addresses.multisig });
  await feeCollectorInstance.replaceAdmin(_addresses.multisig, { from: _addresses.ecosystemFund });


  //////////////////////////////////////////////////////////
  // multisig can whitelist
  console.log("multisig can whitelist");
  await feeCollectorInstance.addAddressToWhiteList(_addresses.ecosystemFund, { from: _addresses.multisig });
  await feeCollectorInstance.removeAddressFromWhiteList(_addresses.ecosystemFund, { from: _addresses.multisig });

  // back to timelock as admin
  await feeCollectorInstance.replaceAdmin(_addresses.timelock, { from: _addresses.multisig });

  //////////////////////////////////////////////////////////
  // governance can set ST params as ST controller

  propName = 'governance can set ST params as ST controller';
  proposal = {
    targets: [smartTreasuryInstance.address],
    values: [toBN("0")],
    signatures: ["whitelistLiquidityProvider(address)"],
    calldatas: [web3.eth.abi.encodeParameters(
      ['address'],
      [_addresses.timelock]
    )],
    description: propName,
    from: founder
  }

  await createProposal(govInstance, founder, proposal, propName);


  //////////////////////////////////////////////////////////
  // governance can set swap fee in bPool as controller

  propName = 'governance can set swap fee';
  proposal = {
    targets: [crpAddress],
    values: [toBN("0")],
    signatures: ["setSwapFee(uint256)"],
    calldatas: [web3.eth.abi.encodeParameters(
      ["uint256"],
      [toBN("1000000000000")]
    )],
    description: propName,
    from: founder
  }

  await createProposal(govInstance, founder, proposal, propName);

  //////////////////////////////////////////////////////////
  // deposit
  const ONE18 = toBN("1000000000000000000");
  const ONE6 = toBN("1000000");
  const USDC = await IERC20.at("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
  const WETH = await IERC20.at(_addresses.weth);
  const IDLE = await IERC20.at(_addresses.idle);

  await DAI.transfer(FeeCollector.address, toBN("100").mul(ONE18), { from: TOKENS_HOLDER });
  await USDC.transfer(FeeCollector.address, toBN("100").mul(ONE6), { from: TOKENS_HOLDER });

  const feeCollectorDAIBalanceBefore = await DAI.balanceOf(FeeCollector.address);
  const feeCollectorUSDCBalanceBefore = await USDC.balanceOf(FeeCollector.address);
  const poolWETHBalanceBefore = await WETH.balanceOf(bPoolAddress);
  const poolIDLEBalanceBefore = await IDLE.balanceOf(bPoolAddress);

  console.log(feeCollectorDAIBalanceBefore.toString())
  console.log(feeCollectorUSDCBalanceBefore.toString())
  console.log(poolWETHBalanceBefore.toString())
  console.log(poolIDLEBalanceBefore.toString())
  console.log("-----")

  await feeCollectorInstance.deposit(
    [false, false, false, true, false, true, false],
    [0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0],
    { from: _addresses.multisig }
  );

  const feeCollectorDAIBalanceAfter = await DAI.balanceOf(FeeCollector.address);
  const feeCollectorUSDCBalanceAfter = await USDC.balanceOf(FeeCollector.address);
  const poolWETHBalanceAfter = await WETH.balanceOf(bPoolAddress);
  const poolIDLEBalanceAfter = await IDLE.balanceOf(bPoolAddress);

  console.log(feeCollectorDAIBalanceAfter.toString())
  console.log(feeCollectorUSDCBalanceAfter.toString())
  console.log(poolWETHBalanceAfter.toString())
  console.log(poolIDLEBalanceAfter.toString())
  console.log("-----")

  check(feeCollectorDAIBalanceAfter.toString(), "0");
  check(feeCollectorUSDCBalanceAfter.toString(), "0");

  checkGreater(poolWETHBalanceBefore, poolWETHBalanceAfter, "poll WETH balance should increase");
}
