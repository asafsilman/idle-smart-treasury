const {BN, constants, expectRevert} = require('@openzeppelin/test-helpers');

const { expect } = require('chai');

const SmartTreasuryBootstrap = artifacts.require('SmartTreasuryBootstrap')
const FeeCollector = artifacts.require('FeeCollector')
const IUniswapV2Router02 = artifacts.require('IUniswapV2Router02')
const mockIDLE = artifacts.require('IDLEMock')
const mockWETH = artifacts.require('WETHMock')
const mockDAI = artifacts.require('DAIMock')
const mockUSDC = artifacts.require('USDCMock')

const BPool = artifacts.require('BPool')

const CRP = artifacts.require('ConfigurableRightsPool')

const addresses = require("../migrations/addresses").development;

const BNify = n => new BN(String(n));

contract('SmartTreasuryBootstrap', async accounts => {
  beforeEach(async function() {
    this.zeroAddress = "0x0000000000000000000000000000000000000000";

    this.mockWETH = await mockWETH.new();
    this.mockDAI  = await mockDAI.new(); // 600 dai == 1 WETH
    this.mockUSDC  = await mockUSDC.new(); // 600 usdc == 1 WETH
    this.mockIDLE = await mockIDLE.new(); // 135 idle == 1 WETH == ~ $4.45

    // get uniswap pool
    await this.mockWETH.approve(addresses.uniswapRouterAddress, constants.MAX_UINT256)
    await this.mockDAI.approve(addresses.uniswapRouterAddress, constants.MAX_UINT256)
    await this.mockUSDC.approve(addresses.uniswapRouterAddress, constants.MAX_UINT256)

    this.uniswapRouterInstance = await IUniswapV2Router02.at(addresses.uniswapRouterAddress);

    // initialise the mockWETH/mockDAI uniswap pool
    await this.uniswapRouterInstance.addLiquidity(
      this.mockWETH.address, this.mockDAI.address,
      web3.utils.toWei("500"), web3.utils.toWei("300000"), // 300,000 DAI deposit into pool
      0, 0,
      accounts[0],
      BNify(web3.eth.getBlockNumber())
    )

    // initialise the mockWETH/mockUSDC uniswap pool
    await this.uniswapRouterInstance.addLiquidity(
      this.mockWETH.address, this.mockUSDC.address,
      web3.utils.toWei("500"), BNify("300000").mul(BNify('1000000')), // 300,000 USDC deposit into pool
      0, 0,
      accounts[0],
      BNify(web3.eth.getBlockNumber())
    )

    this.feeCollectorInstance = await FeeCollector.new(
      this.mockWETH.address,
      addresses.feeTreasuryAddress,
      addresses.idleRebalancer,
      accounts[0],
      []
    )

    this.smartTreasuryBootstrapInstance = await SmartTreasuryBootstrap.new(
      addresses.balancerCoreFactory,
      addresses.balancerCRPFactory,
      this.mockIDLE.address,
      this.mockWETH.address,
      addresses.timelock,
      this.feeCollectorInstance.address, // set the feecollector address
      accounts[0],
      [this.mockDAI.address, this.mockUSDC.address]
    )

    // initialise bootstrap contract with 40000 USDC and DAI
    await this.mockDAI.transfer(this.smartTreasuryBootstrapInstance.address, web3.utils.toWei("20000"));
    await this.mockUSDC.transfer(this.smartTreasuryBootstrapInstance.address, BNify("20000").mul(BNify('1000000')));

    // initialise bootstrap contract with 130,000 IDLE
    await this.mockIDLE.transfer(this.smartTreasuryBootstrapInstance.address, web3.utils.toWei("130000"));
  })

  it('Should swap all tokens in bootstrap', async function() {
    await this.smartTreasuryBootstrapInstance.swap([1, 1]);

    daiBalance = await this.mockDAI.balanceOf.call(this.smartTreasuryBootstrapInstance.address);
    usdcBalance = await this.mockUSDC.balanceOf.call(this.smartTreasuryBootstrapInstance.address);
    wethBalance = await this.mockWETH.balanceOf.call(this.smartTreasuryBootstrapInstance.address);

    expect(daiBalance).to.be.bignumber.equal(BNify('0'))
    expect(usdcBalance).to.be.bignumber.equal(BNify('0'))
    expect(wethBalance).to.be.bignumber.that.is.greaterThan(BNify('0'))
  })

  it('Should bootstrap', async function() {
    await this.smartTreasuryBootstrapInstance.swap([1, 1]); // swap all deposit tokens to WETH

    await this.smartTreasuryBootstrapInstance.setIDLEPrice(web3.utils.toWei('135')); // Set price, this is used for setting initial weights
    await this.smartTreasuryBootstrapInstance.initialise();
    await this.smartTreasuryBootstrapInstance.bootstrap();

    let crpAddress = await this.smartTreasuryBootstrapInstance.getCRPAddress.call();
    let bPool = await this.smartTreasuryBootstrapInstance.getCRPBPoolAddress.call();
    
    expect(crpAddress).to.not.equal(this.zeroAddress);
    expect(bPool).to.not.equal(this.zeroAddress);
  })

  it('Should renounce ownership to governance', async function() {
    await this.smartTreasuryBootstrapInstance.swap([1, 1]) // swap all deposit tokens to WETH

    await this.smartTreasuryBootstrapInstance.setIDLEPrice(web3.utils.toWei('135')) // Set price, this is used for setting initial weights
    await this.smartTreasuryBootstrapInstance.initialise()
    await this.smartTreasuryBootstrapInstance.bootstrap()
    
    let crpAddress = await this.smartTreasuryBootstrapInstance.getCRPAddress.call()
    let bPoolAddress = await this.smartTreasuryBootstrapInstance.getCRPBPoolAddress.call()
    let crpInstance = await CRP.at(crpAddress)
    let bPoolInstance = await BPool.at(bPoolAddress)

    let bPoolBalanceCRP = await bPoolInstance.balanceOf.call(crpAddress)

    await this.smartTreasuryBootstrapInstance.renounce() // renounce ownership
    let newController = await crpInstance.getController()

    let canBootstrapProvideLiquidity = await crpInstance.canProvideLiquidity.call(this.smartTreasuryBootstrapInstance.address)

    let bPoolBalanceFeeCollector = await bPoolInstance.balanceOf.call(this.feeCollectorInstance.address)

    // add checks for whitelist
    expect(newController.toLowerCase()).to.equal(addresses.timelock.toLowerCase())

    expect(bPoolBalanceFeeCollector).to.be.bignumber.equal(bPoolBalanceCRP)

    expect(canBootstrapProvideLiquidity).to.be.false // after renounce bootstrap should no longer be able to provide liquidity
  })

  it('Should withdraw correctly', async function() {
    let newSmartTreasuryBootstrapInstance = await SmartTreasuryBootstrap.new(
      addresses.balancerCoreFactory,
      addresses.balancerCRPFactory,
      this.mockIDLE.address,
      this.mockWETH.address,
      accounts[1], // set timelock as accounts[1] to test withdrawal
      this.feeCollectorInstance.address, // set the feecollector address
      accounts[0], // set multisig as accounts[0]
      [this.mockDAI.address]
    )
    await this.mockIDLE.transfer(newSmartTreasuryBootstrapInstance.address, web3.utils.toWei("130000"));
    await this.mockDAI.transfer(newSmartTreasuryBootstrapInstance.address, BNify(web3.utils.toWei("40000")))

    // random address
    await expectRevert(
      newSmartTreasuryBootstrapInstance.withdraw(this.mockDAI.address, accounts[2], BNify(web3.utils.toWei("10000")), {from: accounts[2]}),
      "Only admin"
    )
    
    // multisig before revert
    await expectRevert(
      newSmartTreasuryBootstrapInstance.withdraw(this.mockDAI.address, accounts[0], BNify(web3.utils.toWei("10000")), {from: accounts[0]}), // default account is multisig
      "Only admin"
    )

    await newSmartTreasuryBootstrapInstance.withdraw(this.mockDAI.address, accounts[1], BNify(web3.utils.toWei("10000")), {from: accounts[1]}) // timelock should be able to withdraw
    let timelockBalance = BNify(await this.mockDAI.balanceOf.call(accounts[1]))

    expect(timelockBalance).to.be.bignumber.equal(BNify(web3.utils.toWei("10000")))

    await this.mockDAI.transfer(newSmartTreasuryBootstrapInstance.address, BNify(web3.utils.toWei("10000")))
    await newSmartTreasuryBootstrapInstance.swap([1]) // swap all deposit tokens to WETH
    await newSmartTreasuryBootstrapInstance.setIDLEPrice(BNify(web3.utils.toWei('135'))) // Set price, this is used for setting initial weights
    await newSmartTreasuryBootstrapInstance.initialise()
    await newSmartTreasuryBootstrapInstance.bootstrap()
    await newSmartTreasuryBootstrapInstance.renounce() 

    await this.mockDAI.transfer(newSmartTreasuryBootstrapInstance.address, BNify(web3.utils.toWei("10000")));

    // random address
    await expectRevert(
      newSmartTreasuryBootstrapInstance.withdraw(this.mockDAI.address, accounts[2], BNify(web3.utils.toWei("10000")), {from: accounts[2]}), // default account is multisig
      "Only admin"
    )

    await newSmartTreasuryBootstrapInstance.withdraw(this.mockDAI.address, accounts[1], BNify(web3.utils.toWei("5000")), {from: accounts[1]}) // timelock should be able to withdraw
    await newSmartTreasuryBootstrapInstance.withdraw(this.mockDAI.address, accounts[3], BNify(web3.utils.toWei("5000")), {from: accounts[0]}) // multisig should be able to withdraw after renounce

    let timelockBalanceAfterRenounce = BNify(await this.mockDAI.balanceOf.call(accounts[1]))
    let multisigBalanceAfterRenounce = BNify(await this.mockDAI.balanceOf.call(accounts[3]))

    expect(timelockBalanceAfterRenounce).to.be.bignumber.equal(BNify(web3.utils.toWei("15000")))
    expect(multisigBalanceAfterRenounce).to.be.bignumber.equal(BNify(web3.utils.toWei("5000")))
  })
})
