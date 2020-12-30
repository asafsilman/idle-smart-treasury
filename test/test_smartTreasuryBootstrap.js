const {BN, constants} = require('@openzeppelin/test-helpers');

const { expect } = require('chai');

const SmartTreasuryBootstrap = artifacts.require('SmartTreasuryBootstrap')
const IUniswapV2Router02 = artifacts.require('IUniswapV2Router02')
const mockIDLE = artifacts.require('IDLEMock')
const mockWETH = artifacts.require('WETHMock')
const mockDAI = artifacts.require('DAIMock')
const mockUSDC = artifacts.require('USDCMock')

const CRP = artifacts.require('ConfigurableRightsPool')

const addresses = require("../migrations/addresses").development;

const BNify = n => new BN(String(n));

contract('SmartTreasuryBootstrap', async accounts => {
  beforeEach(async function() {
    this.zero_address = "0x0000000000000000000000000000000000000000";

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

    this.smartTreasuryBootstrapInstance = await SmartTreasuryBootstrap.new(
      addresses.balancerCoreFactory,
      addresses.balancerCRPFactory,
      addresses.uniswapFactory,
      addresses.uniswapRouterAddress,
      this.mockIDLE.address,
      this.mockWETH.address,
      addresses.governanceAddress,
      addresses.governanceAddress // set the feecollector as governance for the time being
    )

    await this.smartTreasuryBootstrapInstance._addTokenToDepositList(this.mockDAI.address)
    await this.smartTreasuryBootstrapInstance._addTokenToDepositList(this.mockUSDC.address)

    // initialise bootstrap contract with 10000 USDC and DAI
    await this.mockDAI.transfer(this.smartTreasuryBootstrapInstance.address, web3.utils.toWei("10000"));
    await this.mockUSDC.transfer(this.smartTreasuryBootstrapInstance.address, BNify("10000").mul(BNify('1000000')));

    // initialise bootstrap contract with 130,000 IDLE
    await this.mockIDLE.transfer(this.smartTreasuryBootstrapInstance.address, web3.utils.toWei("130000"));
  })

  it('Should swap all tokens in bootstrap', async function() {
    await this.smartTreasuryBootstrapInstance.swap();

    daiBalance = await this.mockDAI.balanceOf.call(this.smartTreasuryBootstrapInstance.address);
    usdcBalance = await this.mockUSDC.balanceOf.call(this.smartTreasuryBootstrapInstance.address);
    wethBalance = await this.mockWETH.balanceOf.call(this.smartTreasuryBootstrapInstance.address);

    expect(daiBalance).to.be.bignumber.equal(BNify('0'))
    expect(usdcBalance).to.be.bignumber.equal(BNify('0'))
    expect(wethBalance).to.be.bignumber.that.is.greaterThan(BNify('0'))
  })

  it('Should bootstrap', async function() {
    await this.smartTreasuryBootstrapInstance.swap(); // swap all deposit tokens to WETH

    await this.smartTreasuryBootstrapInstance._setIDLEPrice(web3.utils.toWei('135')); // Set price, this is used for setting initial weights
    await this.smartTreasuryBootstrapInstance.initialise();
    await this.smartTreasuryBootstrapInstance.bootstrap();

    let crpAddress = await this.smartTreasuryBootstrapInstance._getCRPAddress.call();
    let bPool = await this.smartTreasuryBootstrapInstance._getCRPBPoolAddress.call();
    
    expect(crpAddress).to.not.equal(this.zero_address);
    expect(bPool).to.not.equal(this.zero_address);
  })

  it('Should renounce ownership to governance', async function() {
    await this.smartTreasuryBootstrapInstance.swap(); // swap all deposit tokens to WETH

    await this.smartTreasuryBootstrapInstance._setIDLEPrice(web3.utils.toWei('135')); // Set price, this is used for setting initial weights
    await this.smartTreasuryBootstrapInstance.initialise();
    await this.smartTreasuryBootstrapInstance.bootstrap();
    
    let crpAddress = await this.smartTreasuryBootstrapInstance._getCRPAddress.call();
    let crpInstance = await CRP.at(crpAddress);

    let oldController = await crpInstance.getController()
    await this.smartTreasuryBootstrapInstance.renounce(); // renounce ownership
    let newController = await crpInstance.getController()

    console.log(oldController)
    console.log(newController)
  })
})
