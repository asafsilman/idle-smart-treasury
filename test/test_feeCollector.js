const {BN, constants, expectRevert} = require('@openzeppelin/test-helpers')

const { expect } = require('chai');

const FeeCollector = artifacts.require('FeeCollector')
const IUniswapV2Router02 = artifacts.require('IUniswapV2Router02')
const ICRPFactory = artifacts.require('ICRPFactory')
const BPool = artifacts.require('BPool')
const ConfigurableRightsPool = artifacts.require('ConfigurableRightsPool')
const mockIDLE = artifacts.require('IDLEMock')
const mockWETH = artifacts.require('WETHMock')
const mockDAI = artifacts.require('DAIMock')

const addresses = require("../migrations/addresses").development

const BNify = n => new BN(String(n))

contract("FeeCollector", async accounts => {
  beforeEach(async function () {
    this.zeroAddress = "0x0000000000000000000000000000000000000000"
    this.nonZeroAddress = "0x0000000000000000000000000000000000000001"
    this.nonZeroAddress2 = "0x0000000000000000000000000000000000000002"

    this.one = BNify('1000000000000000000') // 18 decimals
    this.ratio_one_pecrent = BNify('1000')

    this.mockWETH = await mockWETH.new()
    this.mockDAI  = await mockDAI.new() // 600 dai == 1 WETH
    this.mockIDLE = await mockIDLE.new() // 135 idle == 1 WETH == ~ $4.45
    
    // get uniswap pool
    this.mockWETH.approve(addresses.uniswapRouterAddress, constants.MAX_UINT256)
    this.mockDAI.approve(addresses.uniswapRouterAddress, constants.MAX_UINT256)
    
    // initialise the mockWETH/mockDAI uniswap pool
    this.uniswapRouterInstance = await IUniswapV2Router02.at(addresses.uniswapRouterAddress)
    this.uniswapRouterInstance.addLiquidity(
      this.mockWETH.address, this.mockDAI.address,
      web3.utils.toWei("1000"), web3.utils.toWei("600000"), // 600,000 DAI deposit into pool
      0, 0,
      accounts[0],
      BNify(web3.eth.getBlockNumber())
    )

    // initialise a balancer pool 90/10 IDLE/ETH
    let poolParams = {
      poolTokenSymbol: 'ISTT',
      poolTokenName: 'Idle Smart Treasury Token',
      constituentTokens: [this.mockIDLE.address, this.mockWETH.address],
      tokenBalances: [web3.utils.toWei('130000'), web3.utils.toWei('100')],
      tokenWeights: [web3.utils.toWei('45'), web3.utils.toWei('5')],
      swapFee: web3.utils.toWei('0.005') // 0.5%
    }
    
    let permissions = {
      canPauseSwapping: true,
      canChangeSwapFee: true,
      canChangeWeights: true,
      canAddRemoveTokens: true,
      canWhitelistLPs: true,
      canChangeCap: false
    };

    let CRPFactoryInstance = await ICRPFactory.at(addresses.balancerCRPFactory)
    let newCRP = await CRPFactoryInstance.newCrp(addresses.balancerCoreFactory, poolParams, permissions)
    let newCRPAddress = newCRP.logs[0].args.pool

    // // Get new bpool
    this.crp = await ConfigurableRightsPool.at(newCRPAddress)
    this.mockWETH.approve(this.crp.address, constants.MAX_UINT256)
    this.mockIDLE.approve(this.crp.address, constants.MAX_UINT256)

    await this.crp.createPool(web3.utils.toWei('1000'), 10, 10);
    var bPoolAddress = await this.crp.bPool.call();
    this.bPool = await BPool.at(bPoolAddress)

    this.feeCollectorInstance = await FeeCollector.new(
      addresses.uniswapRouterAddress,
      this.mockWETH.address,
      addresses.feeTreasuryAddress,
      BNify('0')
    )
    
    // Whitelist feeCollector as liquidity provider
    await this.crp.whitelistLiquidityProvider(this.feeCollectorInstance.address);
  })
    
  it("Should correctly deploy", async function() {
    let instance = this.feeCollectorInstance

    let ratio = await instance.getSplitRatio.call()

    let deployerAddressWhitelisted = await instance.isAddressWhitelisted.call(accounts[0])
    let randomAddressWhitelisted = await instance.isAddressWhitelisted.call(accounts[1])
    let deployerAddressAdmin = await instance.isAddressAdmin.call(accounts[0])
    let randomAddressAdmin = await instance.isAddressAdmin.call(accounts[1])

    let feeTreasuryAddress = await instance.getFeeTreasuryAddress.call()
    let smartTreasuryAddress = await instance.getSmartTreasuryAddress.call()
    
    assert.equal(ratio, 0, "Initial ratio is not set to 0")

    assert.isTrue(deployerAddressWhitelisted, "Deployer account should be whitelisted")
    assert.isFalse(randomAddressWhitelisted, "Random account should not be whitelisted")

    assert.isTrue(deployerAddressAdmin, "Deployer account should be admin")
    assert.isFalse(randomAddressAdmin, "Random account should not be admin")

    assert.equal(feeTreasuryAddress.toLowerCase(), addresses.feeTreasuryAddress.toLowerCase())
    assert.equal(smartTreasuryAddress.toLowerCase(), this.zeroAddress) // should be zero address on deploy
  })

  it("Should deposit tokens with split set to 50/50", async function() {
    let instance = this.feeCollectorInstance

    await instance.setSmartTreasuryAddress(this.crp.address)
    await instance.setSplitRatio(this.ratio_one_pecrent.mul(BNify('50')), {from: accounts[0]}) // set split 50/50
    await instance.registerTokenToDepositList(this.mockDAI.address, {from: accounts[0]}) // whitelist dai
    
    let feeTreasuryDaiBalanceBefore = BNify(await this.mockDAI.balanceOf.call(addresses.feeTreasuryAddress))
    let smartTreasuryWethBalanceBefore = BNify(await this.mockWETH.balanceOf.call(this.crp.address))
    // let smartTreasuryWethBalanceBefore = BNify(await wethContract.methods.balanceOf(meta.address).call()); 
    
    let depositAmount = web3.utils.toWei("500")
    await this.mockDAI.transfer(instance.address, depositAmount, {from: accounts[0]}) // 500 DAI
    await instance.deposit({from: accounts[0]}) // call deposit
    
    let feeTreasuryDaiBalanceAfter = BNify(await this.mockDAI.balanceOf.call(addresses.feeTreasuryAddress))
    let smartTreasuryWethBalanceAfter = BNify(await this.mockWETH.balanceOf.call(this.bPool.address))     
    
    let balancerPoolTokenBalance = BNify(await this.crp.balanceOf.call(instance.address));

    expect(feeTreasuryDaiBalanceAfter.sub(feeTreasuryDaiBalanceBefore)).to.be.bignumber.equal(BNify(depositAmount).div(BNify('2')))
    expect(smartTreasuryWethBalanceAfter.sub(smartTreasuryWethBalanceBefore)).to.be.bignumber.that.is.greaterThan(BNify('0'))
    expect(balancerPoolTokenBalance).to.be.bignumber.that.is.greaterThan(BNify('0'))
  })

  it("Should revert when calling function with onlyWhitelisted modifier from non-whitelisted address", async function() {
    let instance = this.feeCollectorInstance
    
    await instance.setSmartTreasuryAddress(this.crp.address) // must set smart treasury address
    await expectRevert(instance.deposit({from: accounts[1]}), "Unauthorised") // call deposit
  })

  it("Should revert when calling function with onlyAdmin modifier when not admin", async function() {
    let instance = this.feeCollectorInstance
    
    let ratio = this.ratio_one_pecrent.mul(BNify('100'))
    
    await instance.setSmartTreasuryAddress(this.crp.address) // must set smart treasury address
    await expectRevert(instance.setSplitRatio(ratio, {from: accounts[1]}), "Unauthorised")
  })

  it("Should revert when calling function with smartTreasurySet modifier when smart treasury not set", async function() {
    let instance = this.feeCollectorInstance
    
    let ratio = this.ratio_one_pecrent.mul(BNify('100'))
    await expectRevert(instance.setSplitRatio(ratio, {from: accounts[0]}), "Smart Treasury not set")
  })

  it("Should add & remove a token from the deposit list", async function() {
    let instance = this.feeCollectorInstance
    let mockDaiAddress = this.mockDAI.address

    let isDaiInDepositListFromBootstrap = await instance.isTokenInDespositList.call(mockDaiAddress)
    assert.isFalse(isDaiInDepositListFromBootstrap)

    await instance.registerTokenToDepositList(mockDaiAddress, {from: accounts[0]})
    
    let daiInDepositList = await instance.isTokenInDespositList.call(mockDaiAddress)
    assert.isTrue(daiInDepositList)

    await instance.removeTokenFromDepositList(mockDaiAddress, {from: accounts[0]})
    let daiNoLongerInDepositList = await instance.isTokenInDespositList.call(mockDaiAddress)
    assert.isFalse(daiNoLongerInDepositList)
  })

  it("Should set fee treasury address", async function() {
    let instance = this.feeCollectorInstance

    let initialFeeTreasuryAddress = await instance.getFeeTreasuryAddress.call()
    expect(initialFeeTreasuryAddress.toLowerCase()).to.be.equal(addresses.feeTreasuryAddress.toLowerCase())

    await expectRevert(instance.setFeeTreasuryAddress(this.zeroAddress), "Fee treasury cannot be 0 address")
    await instance.setFeeTreasuryAddress(this.nonZeroAddress)

    let newFeeTreasuryAddress = await instance.getFeeTreasuryAddress.call()
    expect(newFeeTreasuryAddress.toLowerCase()).to.be.equal(this.nonZeroAddress)
  })

  it("Should set smart treasury address", async function() {
    let instance = this.feeCollectorInstance

    let initialSmartTreasuryAddress = await instance.getSmartTreasuryAddress.call()
    expect(initialSmartTreasuryAddress.toLowerCase()).to.be.equal(this.zeroAddress) // initially this address will not be set

    await expectRevert(instance.setSmartTreasuryAddress(this.zeroAddress), "Smart treasury cannot be 0 address")
    await instance.setSmartTreasuryAddress(this.nonZeroAddress)

    let newFeeTreasuryAddress = await instance.getSmartTreasuryAddress.call()
    expect(newFeeTreasuryAddress.toLowerCase()).to.be.equal(this.nonZeroAddress)

    wethAllowance = await this.mockWETH.allowance(instance.address, this.nonZeroAddress)
    expect(wethAllowance).to.be.bignumber.equal(constants.MAX_UINT256)

    await instance.setSmartTreasuryAddress(this.nonZeroAddress2)
    wethAllowanceAfter = await this.mockWETH.allowance(instance.address, this.nonZeroAddress)
    expect(wethAllowanceAfter).to.be.bignumber.equal(BNify('0'))
  })

  it("Should add & remove whitelist address", async function() {
    let instance = this.feeCollectorInstance

    let before = await instance.isAddressWhitelisted(this.nonZeroAddress)
    expect(before, "Address should not be whitelisted initially").to.be.false

    await instance.addAddressToWhiteList(this.nonZeroAddress, {from: accounts[0]})
    let after = await instance.isAddressWhitelisted(this.nonZeroAddress)
    expect(after, "Address should now be whitelisted").to.be.true

    await instance.removeAddressFromWhiteList(this.nonZeroAddress, {from: accounts[0]})
    let final = await instance.isAddressWhitelisted(this.nonZeroAddress)
    expect(final, "Address should not be whitelisted").to.be.false
  })

  it("Should withdraw underlying deposit token", async function() {
    let instance = this.feeCollectorInstance

    await instance.setSmartTreasuryAddress(this.crp.address)
    await instance.setSplitRatio(this.ratio_one_pecrent.mul(BNify('100')), {from: accounts[0]}) // set split to 100% smart tresury
    await instance.registerTokenToDepositList(this.mockDAI.address, {from: accounts[0]}) // whitelist dai

    let depositAmount = web3.utils.toWei("500")
    await this.mockDAI.transfer(instance.address, depositAmount, {from: accounts[0]}) // 500 DAI
    await instance.deposit({from: accounts[0]}) // call deposit

    let balancerPoolTokenBalanceBefore = BNify(await this.crp.balanceOf.call(instance.address));
    
    expect(balancerPoolTokenBalanceBefore).to.be.bignumber.that.is.greaterThan(BNify('0'))

    await instance.withdrawUnderlying(this.nonZeroAddress, balancerPoolTokenBalanceBefore.div(BNify("2")))

    let balancerPoolTokenBalanceAfter = BNify(await this.crp.balanceOf.call(instance.address));
    expect(balancerPoolTokenBalanceAfter).to.be.bignumber.that.is.equal(balancerPoolTokenBalanceBefore.div(BNify("2")))

    let idleBalanceWithdrawn = await this.mockIDLE.balanceOf.call(this.nonZeroAddress)
    let wethBalanceWithdrawn = await this.mockWETH.balanceOf.call(this.nonZeroAddress)
    
    expect(idleBalanceWithdrawn).to.be.bignumber.that.is.greaterThan(BNify('0'))
    expect(wethBalanceWithdrawn).to.be.bignumber.that.is.greaterThan(BNify('0'))
  })

  it("Should withdraw arbitrary token", async function() {
    let instance = this.feeCollectorInstance

    let depositAmount = web3.utils.toWei("500")

    await this.mockDAI.transfer(instance.address, depositAmount, {from: accounts[0]}) // 500 DAI

    await instance.withdraw(this.mockDAI.address, this.nonZeroAddress, depositAmount)
    let daiBalance = await this.mockDAI.balanceOf.call(this.nonZeroAddress)

    expect(daiBalance).to.be.bignumber.equal(depositAmount)
  })

  it("Should replace admin", async function() {
    let instance = this.feeCollectorInstance

    let nonZeroAddressIsAdmin = await instance.isAddressAdmin.call(this.nonZeroAddress)
    await instance.replaceAdmin(this.nonZeroAddress, {from: accounts[0]})

    let nonZeroAddressIsAdminAfter = await instance.isAddressAdmin.call(this.nonZeroAddress)
    let previousAdminRevoked = await instance.isAddressAdmin.call(accounts[0])

    expect(nonZeroAddressIsAdmin, "Address should not start off as admin").to.be.false
    expect(nonZeroAddressIsAdminAfter, "Address should be granted admin").to.be.true
    expect(previousAdminRevoked, "Previous admin should be revoked").to.be.false
  })

  it("Should not be able to add duplicate deposit token", async function() {
    let instance = this.feeCollectorInstance

    await instance.registerTokenToDepositList(this.mockDAI.address)
    await expectRevert(instance.registerTokenToDepositList(this.mockDAI.address), "Already exists")

    let totalDepositTokens = await instance.getNumTokensInDepositList.call()
    expect(totalDepositTokens).to.be.bignumber.equal(BNify('1'))
  })

  it("Should not add WETH as deposit token", async function() {
    let instance = this.feeCollectorInstance

    await expectRevert(instance.registerTokenToDepositList(this.mockWETH.address), "WETH not supported")
  })

  it("Should not be able to add deposit tokens past limit", async function() {
    let instance = this.feeCollectorInstance

    for (let index = 0; index < 15; index++) {
      let token = await mockDAI.new()
      await instance.registerTokenToDepositList(token.address)
    }

    let token = await mockDAI.new()
    await expectRevert(instance.registerTokenToDepositList(token.address), "Too many tokens")
  })

  it("Should not set invalid split ratio", async function() {
    let instance = this.feeCollectorInstance
    
    let ratio = this.ratio_one_pecrent.mul(BNify('101'))
    
    await instance.setSmartTreasuryAddress(this.crp.address) // must set smart treasury address
    await expectRevert(instance.setSplitRatio(ratio), "Ratio is too high")
  })
})
