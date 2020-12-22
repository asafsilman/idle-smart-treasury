module.exports = {
    development: {
        uniswapRouterAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // https://uniswap.org/docs/v2/smart-contracts/router02
        
        // development addresses
        weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // https://etherscan.io/token/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
        dai: '0x6b175474e89094c44da98b954eedeac495271d0f', // https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f
        idle: '0x875773784Af8135eA0ef43b5a374AaD105c5D39e', // https://developers.idle.finance/contracts-and-codebase
        
        feeTreasuryAddress: '0x69a62C24F16d4914a48919613e8eE330641Bcb94', // https://developers.idle.finance/contracts-and-codebase
        
        // This random balancer smart pool, 50/50 WETH/WBTC 
        smartTreasuryAddress: '0x273d0F686A53a49a0fBa2A801566b19f9AaF8FcD', // https://pools.balancer.exchange/#/pool/0x221bf20c2ad9e5d7ec8a9d1991d8e2edcfcb9d6c/shares

        // https://docs.balancer.finance/smart-contracts/addresses
        balancerCoreFactory: '0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd',
        balancerCRPFactory: '0xed52D8E202401645eDAD1c0AA21e872498ce47D0'
    }
}