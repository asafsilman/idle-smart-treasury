const {BN, constants} = require('@openzeppelin/test-helpers');

const { expect } = require('chai');

const FeeCollector = artifacts.require('FeeCollector')
const IUniswapV2Router02 = artifacts.require('IUniswapV2Router02')
const IBFactory = artifacts.require('IBFactory')
const BPool = artifacts.require('BPool')
const mockIDLE = artifacts.require('IDLEMock')
const mockWETH = artifacts.require('WETHMock')
const mockDAI = artifacts.require('DAIMock')

const addresses = require("../migrations/addresses").development;

const BNify = n => new BN(String(n));

contract("FeeCollector", async accounts => {
  beforeEach(async function () {
    this.one = BNify('1000000000000000000'); // 18 decimals
    this.ratio_one_pecrent = BNify('1000');

    this.mockWETH = await mockWETH.new();
    this.mockDAI  = await mockDAI.new(); // 600 dai == 1 WETH
    this.mockIDLE = await mockIDLE.new() // 135 idle == 1 WETH == ~ $4.45
    
    // get uniswap pool
    this.mockWETH.approve(addresses.uniswapRouterAddress, constants.MAX_UINT256)
    this.mockDAI.approve(addresses.uniswapRouterAddress, constants.MAX_UINT256)
    
    // initialise the mockWETH/mockDAI uniswap pool
    this.uniswapRouterInstance = await IUniswapV2Router02.at(addresses.uniswapRouterAddress);
    this.uniswapRouterInstance.addLiquidity(
      this.mockWETH.address, this.mockDAI.address,
      web3.utils.toWei("1000"), web3.utils.toWei("600000"), // 600,000 DAI deposit into pool
      0, 0,
      accounts[0],
      BNify(web3.eth.getBlockNumber())
    )

    // initialise a balancer pool 90/10 IDLE/ETH
    let balancerFactoryInstance = await IBFactory.at(addresses.balancerCoreFactory)
    let newBPool = await balancerFactoryInstance.newBPool(); // call first
    let newBPoolAddress = newBPool.logs[0].args.pool;

    // Get new bpool
    this.balancerPool = await BPool.at(newBPoolAddress);
    this.mockWETH.approve(this.balancerPool.address, constants.MAX_UINT256);
    this.mockIDLE.approve(this.balancerPool.address, constants.MAX_UINT256);

    // deposit 130,000 IDLE into pool == 90% share
    // using a WETH price of 1 WETH = 135 IDLE
    // therefore ETH deposit = 130,000 * 10% / 135 = 96.3
    this.balancerPool.bind(this.mockWETH.address, web3.utils.toWei('96.3'), web3.utils.toWei('1'));
    this.balancerPool.bind(this.mockIDLE.address, web3.utils.toWei('130000'), web3.utils.toWei('9'));

    // must finalize a bpool to call joinswapExternAmountIn
    // for the smart treasury this is not needed
    this.balancerPool.finalize();
    
    this.feeCollectorInstance = await FeeCollector.new(
      addresses.uniswapRouterAddress,
      this.mockWETH.address,
      addresses.feeTreasuryAddress,
      this.balancerPool.address
    )
  })
    
  it("Should correctly deploy", async function() {
    let instance = this.feeCollectorInstance;

    let ratio = await instance.getSplitRatio.call();

    let deployerAddressWhitelisted = await instance.isAddressWhitelisted.call(accounts[0]);
    let randomAddressWhitelisted = await instance.isAddressWhitelisted.call(accounts[1]);
    let deployerAddressAdmin = await instance.isAddressAdmin.call(accounts[0]);
    let randomAddressAdmin = await instance.isAddressAdmin.call(accounts[1]);

    let feeTreasuryAddress = await instance.getFeeTreasuryAddress.call();
    let smartTreasuryAddress = await instance.getSmartTreasuryAddress.call();
    
    assert.equal(ratio, 0, "Initial ratio is not set to 0");

    assert.isTrue(deployerAddressWhitelisted, "Deployer account should be whitelisted");
    assert.isFalse(randomAddressWhitelisted, "Random account should not be whitelisted");

    assert.isTrue(deployerAddressAdmin, "Deployer account should be admin");
    assert.isFalse(randomAddressAdmin, "Random account should not be admin");

    assert.equal(feeTreasuryAddress.toLowerCase(), addresses.feeTreasuryAddress.toLowerCase());
    assert.equal(smartTreasuryAddress.toLowerCase(), this.balancerPool.address.toLowerCase());
  })

  it("Should deposit tokens", async function() {
    let instance = this.feeCollectorInstance;
    await instance.setSplitRatio(this.ratio_one_pecrent.mul(BNify(50)), {from: accounts[0]}) // set split 50/50
    await instance.addTokenToDepositList(this.mockDAI.address, {from: accounts[0]}); // whitelist dai
    
    let feeTreasuryDaiBalanceBefore = BNify(await this.mockDAI.balanceOf.call(addresses.feeTreasuryAddress));
    let smartTreasuryWethBalanceBefore = BNify(await this.mockWETH.balanceOf.call(this.balancerPool.address)); 
    // let smartTreasuryWethBalanceBefore = BNify(await wethContract.methods.balanceOf(meta.address).call()); 
    
    let depositAmount = web3.utils.toWei("500");
    await this.mockDAI.transfer(instance.address, depositAmount, {from: accounts[0]}); // 500 DAI
    await instance.deposit({from: accounts[0]}); // call deposit
    
    let feeTreasuryDaiBalanceAfter = BNify(await this.mockDAI.balanceOf.call(addresses.feeTreasuryAddress));
    let smartTreasuryWethBalanceAfter = BNify(await this.mockWETH.balanceOf.call(this.balancerPool.address));     
    
    expect(feeTreasuryDaiBalanceAfter.sub(feeTreasuryDaiBalanceBefore)).to.be.bignumber.equal(BNify(depositAmount).div(BNify('2')))
    expect(smartTreasuryWethBalanceAfter.sub(smartTreasuryWethBalanceBefore)).to.be.bignumber.that.is.greaterThan(BNify('0'))
  })

  it("Should add & remove a token from the deposit list", async function() {
    let instance = this.feeCollectorInstance;
    let mockDaiAddress = this.mockDAI.address

    let isDaiInDepositListFromBootstrap = await instance.isTokenInDespositList.call(mockDaiAddress);
    assert.isFalse(isDaiInDepositListFromBootstrap);

    await instance.addTokenToDepositList(mockDaiAddress, {from: accounts[0]});
    
    let daiInDepositList = await instance.isTokenInDespositList.call(mockDaiAddress);
    assert.isTrue(daiInDepositList);

    await instance.removeTokenFromDepositList(mockDaiAddress, {from: accounts[0]});
    let daiNoLongerInDepositList = await instance.isTokenInDespositList.call(mockDaiAddress);
    assert.isFalse(daiNoLongerInDepositList);
  })
})
