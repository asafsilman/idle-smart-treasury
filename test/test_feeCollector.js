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
      BNify('0') // all to fee treasury
    )
    
    // Whitelist feeCollector as liquidity provider
    await this.crp.whitelistLiquidityProvider(this.feeCollectorInstance.address);
  })
    
  // it("Should correctly deploy", async function() {
  //   let instance = this.feeCollectorInstance

  //   let allocation = await instance.getSplitAllocation.call()

  //   let deployerAddressWhitelisted = await instance.isAddressWhitelisted.call(accounts[0])
  //   let randomAddressWhitelisted = await instance.isAddressWhitelisted.call(accounts[1])
  //   let deployerAddressAdmin = await instance.isAddressAdmin.call(accounts[0])
  //   let randomAddressAdmin = await instance.isAddressAdmin.call(accounts[1])

  //   let beneficiaries = await instance.getBeneficiaries.call()
    
  //   assert.equal(allocation[0], 0, "Initial ratio is not set to 0")

  //   assert.isTrue(deployerAddressWhitelisted, "Deployer account should be whitelisted")
  //   assert.isFalse(randomAddressWhitelisted, "Random account should not be whitelisted")

  //   assert.isTrue(deployerAddressAdmin, "Deployer account should be admin")
  //   assert.isFalse(randomAddressAdmin, "Random account should not be admin")

  //   assert.equal(beneficiaries[1].toLowerCase(), addresses.feeTreasuryAddress.toLowerCase())
  //   assert.equal(beneficiaries[0].toLowerCase(), this.zeroAddress) // should be zero address on deploy
  // })

  // it("Should deposit tokens with split set to 50/50", async function() {
  //   let instance = this.feeCollectorInstance

  //   await instance.setSmartTreasuryAddress(this.crp.address)
  //   await instance.setSplitAllocation(
  //     [this.ratio_one_pecrent.mul(BNify('50')), this.ratio_one_pecrent.mul(BNify('50'))],
  //     {from: accounts[0]}) // set split 50/50
  //   await instance.registerTokenToDepositList(this.mockDAI.address, {from: accounts[0]}) // whitelist dai
    
  //   let feeTreasuryDaiBalanceBefore = BNify(await this.mockDAI.balanceOf.call(addresses.feeTreasuryAddress))
  //   let smartTreasuryWethBalanceBefore = BNify(await this.mockWETH.balanceOf.call(this.crp.address))
  //   // let smartTreasuryWethBalanceBefore = BNify(await wethContract.methods.balanceOf(meta.address).call()); 
    
  //   let depositAmount = web3.utils.toWei("500")
  //   await this.mockDAI.transfer(instance.address, depositAmount, {from: accounts[0]}) // 500 DAI
  //   await instance.deposit([true], {from: accounts[0]}) // call deposit
    
  //   let feeTreasuryDaiBalanceAfter = BNify(await this.mockDAI.balanceOf.call(addresses.feeTreasuryAddress))
  //   let smartTreasuryWethBalanceAfter = BNify(await this.mockWETH.balanceOf.call(this.bPool.address))     
    
  //   let balancerPoolTokenBalance = BNify(await this.crp.balanceOf.call(instance.address));

  //   expect(feeTreasuryDaiBalanceAfter.sub(feeTreasuryDaiBalanceBefore)).to.be.bignumber.equal(BNify(depositAmount).div(BNify('2')))
  //   expect(smartTreasuryWethBalanceAfter.sub(smartTreasuryWethBalanceBefore)).to.be.bignumber.that.is.greaterThan(BNify('0'))
  //   expect(balancerPoolTokenBalance).to.be.bignumber.that.is.greaterThan(BNify('0'))
  // })

  it("Should deposit with max fee tokens and max beneficiaries", async function() {
    let instance = this.feeCollectorInstance
    await instance.setSmartTreasuryAddress(this.crp.address)

    let initialAllocation = [BNify('95'), BNify('5')]

    for (let index=0; index < 3; index++) {
      initialAllocation[0] = BNify(90-5*index)
      initialAllocation.push(BNify('5'))
      
      let allocation = initialAllocation.map(x => this.ratio_one_pecrent.mul(x))
      await instance.addBeneficiaryAddress(accounts[index], allocation)
    }

    let tokensEnables = [];
    for (let index = 0; index < 15; index++) {
      let token = await mockDAI.new()
      await instance.registerTokenToDepositList(token.address)

      token.approve(addresses.uniswapRouterAddress, constants.MAX_UINT256)
      await this.uniswapRouterInstance.addLiquidity(
        this.mockWETH.address, token.address,
        web3.utils.toWei("100"), web3.utils.toWei("60000"), // 600,000 DAI deposit into pool
        0, 0,
        accounts[0],
        BNify(web3.eth.getBlockNumber())
      )

      let depositAmount = web3.utils.toWei("500")
      await token.transfer(instance.address, depositAmount, {from: accounts[0]}) // 500 DAI
      tokensEnables.push(true);
    }

    let transaction = await instance.deposit(tokensEnables)

    console.log(`Gas used: ${transaction.receipt.gasUsed}`)
  })

  // it("Should remove beneficiary", async function() {
  //   let instance = this.feeCollectorInstance
  //   await instance.setSmartTreasuryAddress(this.crp.address) // must set smart treasury address

  //   let allocation = [this.ratio_one_pecrent.mul(BNify('100')), BNify('0'), BNify('0')]

  //   await instance.addBeneficiaryAddress(accounts[0], allocation)
  //   let beneficiaries = await instance.getBeneficiaries.call()

  //   expect(beneficiaries.length).to.be.equal(3)

  //   allocation.pop()
  //   await instance.removeBeneficiaryAt(1, allocation)
  //   beneficiaries = await instance.getBeneficiaries.call()
  //   expect(beneficiaries.length).to.be.equal(2)
  //   expect(beneficiaries[1].toLowerCase()).to.be.equal(accounts[0].toLowerCase())
  // })

  // it("Should revert when calling function with onlyWhitelisted modifier from non-whitelisted address", async function() {
  //   let instance = this.feeCollectorInstance
    
  //   await instance.setSmartTreasuryAddress(this.crp.address) // must set smart treasury address
  //   await expectRevert(instance.deposit([], {from: accounts[1]}), "Unauthorised") // call deposit
  // })

  // it("Should revert when calling function with onlyAdmin modifier when not admin", async function() {
  //   let instance = this.feeCollectorInstance
    
  //   let allocation = [this.ratio_one_pecrent.mul(BNify('100')), BNify('0')]
    
  //   await instance.setSmartTreasuryAddress(this.crp.address) // must set smart treasury address
  //   await expectRevert(instance.setSplitAllocation(allocation, {from: accounts[1]}), "Unauthorised")
  // })

  // it("Should revert when calling function with smartTreasurySet modifier when smart treasury not set", async function() {
  //   let instance = this.feeCollectorInstance
    
  //   let allocation = [this.ratio_one_pecrent.mul(BNify('100')), BNify('0')]
  //   await expectRevert(instance.setSplitAllocation(allocation, {from: accounts[0]}), "Smart Treasury not set")
  // })

  // it("Should add & remove a token from the deposit list", async function() {
  //   let instance = this.feeCollectorInstance
  //   let mockDaiAddress = this.mockDAI.address

  //   let isDaiInDepositListFromBootstrap = await instance.isTokenInDespositList.call(mockDaiAddress)
  //   assert.isFalse(isDaiInDepositListFromBootstrap)

  //   await instance.registerTokenToDepositList(mockDaiAddress, {from: accounts[0]})
    
  //   let daiInDepositList = await instance.isTokenInDespositList.call(mockDaiAddress)
  //   assert.isTrue(daiInDepositList)

  //   await instance.removeTokenFromDepositList(mockDaiAddress, {from: accounts[0]})
  //   let daiNoLongerInDepositList = await instance.isTokenInDespositList.call(mockDaiAddress)
  //   assert.isFalse(daiNoLongerInDepositList)
  // })

  // it("Should set beneficiary address", async function() {
  //   let instance = this.feeCollectorInstance
  //   await instance.setSmartTreasuryAddress(this.crp.address) // must set smart treasury address

  //   let allocation = [this.ratio_one_pecrent.mul(BNify('100')), BNify('0')]

  //   let initialFeeTreasuryAddress = await instance.getBeneficiaries.call()
  //   expect(initialFeeTreasuryAddress[1].toLowerCase()).to.be.equal(addresses.feeTreasuryAddress.toLowerCase())

  //   await expectRevert(instance.replaceBeneficiaryAt(1, this.zeroAddress, allocation), "Beneficiary cannot be 0 address")
  //   await instance.replaceBeneficiaryAt(1, this.nonZeroAddress, allocation)

  //   let newFeeTreasuryAddress = await instance.getBeneficiaries.call()
  //   expect(newFeeTreasuryAddress[1].toLowerCase()).to.be.equal(this.nonZeroAddress)
  // })

  // it("Should set smart treasury address", async function() {
  //   let instance = this.feeCollectorInstance

  //   let initialSmartTreasuryAddress = await instance.getSmartTreasuryAddress.call()
  //   expect(initialSmartTreasuryAddress.toLowerCase()).to.be.equal(this.zeroAddress) // initially this address will not be set

  //   await expectRevert(instance.setSmartTreasuryAddress(this.zeroAddress), "Smart treasury cannot be 0 address")
  //   await instance.setSmartTreasuryAddress(this.nonZeroAddress)

  //   let newFeeTreasuryAddress = await instance.getSmartTreasuryAddress.call()
  //   expect(newFeeTreasuryAddress.toLowerCase()).to.be.equal(this.nonZeroAddress)

  //   wethAllowance = await this.mockWETH.allowance(instance.address, this.nonZeroAddress)
  //   expect(wethAllowance).to.be.bignumber.equal(constants.MAX_UINT256)

  //   await instance.setSmartTreasuryAddress(this.nonZeroAddress2)
  //   wethAllowanceAfter = await this.mockWETH.allowance(instance.address, this.nonZeroAddress)
  //   expect(wethAllowanceAfter).to.be.bignumber.equal(BNify('0'))
  // })

  // it("Should add & remove whitelist address", async function() {
  //   let instance = this.feeCollectorInstance

  //   let before = await instance.isAddressWhitelisted(this.nonZeroAddress)
  //   expect(before, "Address should not be whitelisted initially").to.be.false

  //   await instance.addAddressToWhiteList(this.nonZeroAddress, {from: accounts[0]})
  //   let after = await instance.isAddressWhitelisted(this.nonZeroAddress)
  //   expect(after, "Address should now be whitelisted").to.be.true

  //   await instance.removeAddressFromWhiteList(this.nonZeroAddress, {from: accounts[0]})
  //   let final = await instance.isAddressWhitelisted(this.nonZeroAddress)
  //   expect(final, "Address should not be whitelisted").to.be.false
  // })

  // it("Should withdraw underlying deposit token", async function() {
  //   let instance = this.feeCollectorInstance
  //   let allocation = [this.ratio_one_pecrent.mul(BNify('100')), BNify('0')]

  //   await instance.setSmartTreasuryAddress(this.crp.address)
  //   await instance.setSplitAllocation(allocation, {from: accounts[0]}) // set split to 100% smart tresury
  //   await instance.registerTokenToDepositList(this.mockDAI.address, {from: accounts[0]}) // whitelist dai

  //   let depositAmount = web3.utils.toWei("500")
  //   await this.mockDAI.transfer(instance.address, depositAmount, {from: accounts[0]}) // 500 DAI
  //   await instance.deposit([true], {from: accounts[0]}) // call deposit

  //   let balancerPoolTokenBalanceBefore = BNify(await this.crp.balanceOf.call(instance.address));
    
  //   expect(balancerPoolTokenBalanceBefore).to.be.bignumber.that.is.greaterThan(BNify('0'))

  //   await instance.withdrawUnderlying(this.nonZeroAddress, balancerPoolTokenBalanceBefore.div(BNify("2")))

  //   let balancerPoolTokenBalanceAfter = BNify(await this.crp.balanceOf.call(instance.address));
  //   expect(balancerPoolTokenBalanceAfter).to.be.bignumber.that.is.equal(balancerPoolTokenBalanceBefore.div(BNify("2")))

  //   let idleBalanceWithdrawn = await this.mockIDLE.balanceOf.call(this.nonZeroAddress)
  //   let wethBalanceWithdrawn = await this.mockWETH.balanceOf.call(this.nonZeroAddress)
    
  //   expect(idleBalanceWithdrawn).to.be.bignumber.that.is.greaterThan(BNify('0'))
  //   expect(wethBalanceWithdrawn).to.be.bignumber.that.is.greaterThan(BNify('0'))
  // })

  // it("Should withdraw arbitrary token", async function() {
  //   let instance = this.feeCollectorInstance

  //   let depositAmount = web3.utils.toWei("500")

  //   await this.mockDAI.transfer(instance.address, depositAmount, {from: accounts[0]}) // 500 DAI

  //   await instance.withdraw(this.mockDAI.address, this.nonZeroAddress, depositAmount)
  //   let daiBalance = await this.mockDAI.balanceOf.call(this.nonZeroAddress)

  //   expect(daiBalance).to.be.bignumber.equal(depositAmount)
  // })

  // it("Should replace admin", async function() {
  //   let instance = this.feeCollectorInstance

  //   let nonZeroAddressIsAdmin = await instance.isAddressAdmin.call(this.nonZeroAddress)
  //   await instance.replaceAdmin(this.nonZeroAddress, {from: accounts[0]})

  //   let nonZeroAddressIsAdminAfter = await instance.isAddressAdmin.call(this.nonZeroAddress)
  //   let previousAdminRevoked = await instance.isAddressAdmin.call(accounts[0])

  //   expect(nonZeroAddressIsAdmin, "Address should not start off as admin").to.be.false
  //   expect(nonZeroAddressIsAdminAfter, "Address should be granted admin").to.be.true
  //   expect(previousAdminRevoked, "Previous admin should be revoked").to.be.false
  // })

  // it("Should not be able to add duplicate deposit token", async function() {
  //   let instance = this.feeCollectorInstance

  //   await instance.registerTokenToDepositList(this.mockDAI.address)
  //   await expectRevert(instance.registerTokenToDepositList(this.mockDAI.address), "Already exists")

  //   let totalDepositTokens = await instance.getNumTokensInDepositList.call()
  //   expect(totalDepositTokens).to.be.bignumber.equal(BNify('1'))
  // })

  // it("Should not add WETH as deposit token", async function() {
  //   let instance = this.feeCollectorInstance

  //   await expectRevert(instance.registerTokenToDepositList(this.mockWETH.address), "WETH not supported")
  // })

  // it("Should not be able to add deposit tokens past limit", async function() {
  //   let instance = this.feeCollectorInstance

  //   for (let index = 0; index < 15; index++) {
  //     let token = await mockDAI.new()
  //     await instance.registerTokenToDepositList(token.address)
  //   }

  //   let token = await mockDAI.new()
  //   await expectRevert(instance.registerTokenToDepositList(token.address), "Too many tokens")
  // })

  // it("Should not set invalid split ratio", async function() {
  //   let instance = this.feeCollectorInstance
    
  //   let allocation = [this.ratio_one_pecrent.mul(BNify('101')), BNify('0')]
    
    
  //   await instance.setSmartTreasuryAddress(this.crp.address) // must set smart treasury address
  //   await expectRevert(instance.setSplitAllocation(allocation), "Ratio does not equal 100000")
  // })
})
