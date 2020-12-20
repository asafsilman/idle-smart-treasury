const {BN} = require('@openzeppelin/test-helpers');

const { expect } = require('chai');

const FeeCollector = artifacts.require("FeeCollector")
const addresses = require("../migrations/addresses").development;

const someoneWithALotOfDai = "0x70178102AA04C5f0E54315aA958601eC9B7a4E08";
const dai = addresses.dai;
const weth = addresses.weth
const erc20ABI = require("./abis/erc20");

const daiContract = new web3.eth.Contract(erc20ABI, dai);
const wethContract = new web3.eth.Contract(erc20ABI, weth);

const BNify = n => new BN(String(n));

contract("FeeCollector", async accounts => {
    beforeEach(async function () {
        this.one = BNify('1000000000000000000'); // 18 decimals
        this.ratio_one_pecrent = BNify('1000');
    
        let meta = await FeeCollector.deployed();
        
        try{
            await meta.removeTokenFromDepositList(dai, {from: accounts[0]}); // cleanup step
        }
        catch {}
    })
    
    it("Should correctly deploy", async () => {
        let meta = await FeeCollector.deployed();

        let ratio = await meta.getSplitRatio.call();

        let deployerAddressWhitelisted = await meta.isAddressWhitelisted.call(accounts[0]);
        let randomAddressWhitelisted = await meta.isAddressWhitelisted.call(accounts[1]);
        let deployerAddressAdmin = await meta.isAddressAdmin.call(accounts[0]);
        let randomAddressAdmin = await meta.isAddressAdmin.call(accounts[1]);

        let feeTreasuryAddress = await meta.getFeeTreasuryAddress.call()
        let smartTreasuryAddress = await meta.getSmartTreasuryAddress.call()
        
        assert.equal(ratio, 0, "Initial ratio is not set to 0");

        assert.isTrue(deployerAddressWhitelisted, "Deployer account should be whitelisted");
        assert.isFalse(randomAddressWhitelisted, "Random account should not be whitelisted");

        assert.isTrue(deployerAddressAdmin, "Deployer account should be admin");
        assert.isFalse(randomAddressAdmin, "Random account should not be admin");

        assert.equal(feeTreasuryAddress.toLowerCase(), addresses.feeTreasuryAddress.toLowerCase())
        assert.equal(smartTreasuryAddress.toLowerCase(), addresses.smartTreasuryAddress.toLowerCase())
    })

    it("Should deposit tokens", async function() {
        let meta = await FeeCollector.deployed();
        await meta.setSplitRatio(this.ratio_one_pecrent.mul(BNify(50)), {from: accounts[0]}) // set split 50/50

        
        await meta.addTokenToDepositList(dai, {from: accounts[0]}); // whitelist dai
        
        let feeTreasuryDaiBalanceBefore = BNify(await daiContract.methods.balanceOf(addresses.feeTreasuryAddress).call());
        let smartTreasuryWethBalanceBefore = BNify(await wethContract.methods.balanceOf(addresses.smartTreasuryAddress).call()); 
        // let smartTreasuryWethBalanceBefore = BNify(await wethContract.methods.balanceOf(meta.address).call()); 
               
        let uniswapPoolDaiBalanceBefore = BNify(await daiContract.methods.balanceOf("0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11").call()); // uniswap liquidity pool
        let someAddressDaiBalanceBefore = BNify(await daiContract.methods.balanceOf(someoneWithALotOfDai).call());
        
        let transferAmount = this.one.mul(BNify('50'));
        await daiContract.methods.transfer(meta.address, transferAmount).send({from: someoneWithALotOfDai}); // 500 DAI
        await debug( meta.deposit({from: accounts[0]}) ); // call deposit
        
        let feeTreasuryDaiBalanceAfter = BNify(await daiContract.methods.balanceOf(addresses.feeTreasuryAddress).call());
        let smartTreasuryWethBalanceAfter = BNify(await wethContract.methods.balanceOf(addresses.smartTreasuryAddress).call());      
        // let smartTreasuryWethBalanceAfter = BNify(await wethContract.methods.balanceOf(meta.address).call());      
        let uniswapPoolDaiBalanceAfter = BNify(await daiContract.methods.balanceOf("0xA478c2975Ab1Ea89e8196811F51A7B7Ade33eB11").call());
        let someAddressDaiBalanceAfter = BNify(await daiContract.methods.balanceOf(someoneWithALotOfDai).call());
        
        expect(feeTreasuryDaiBalanceAfter.sub(feeTreasuryDaiBalanceBefore)).to.be.bignumber.equal(transferAmount.div(BNify('2')))

        console.log(smartTreasuryWethBalanceBefore)
        console.log(smartTreasuryWethBalanceAfter)
        expect(smartTreasuryWethBalanceAfter.sub(smartTreasuryWethBalanceBefore)).to.be.bignumber.that.is.greaterThan(BNify('0'))

        expect(uniswapPoolDaiBalanceAfter.sub(uniswapPoolDaiBalanceBefore)).to.be.bignumber.equal(transferAmount.div(BNify('2')))
        expect(someAddressDaiBalanceBefore.sub(someAddressDaiBalanceAfter)).to.be.bignumber.equal(transferAmount)
    })

    it("Should add & remove a token from the deposit list", async () => {
        let meta = await FeeCollector.deployed();

        let response1 = await meta.isTokenInDespositList.call(dai);
        assert.isFalse(response1);

        await meta.addTokenToDepositList(dai, {from: accounts[0]});
        
        let response2 = await meta.isTokenInDespositList.call(dai);
        assert.isTrue(response2);

        await meta.removeTokenFromDepositList(dai, {from: accounts[0]});
        let response3 = await meta.isTokenInDespositList.call(dai);
        assert.isFalse(response3);
    })
})
