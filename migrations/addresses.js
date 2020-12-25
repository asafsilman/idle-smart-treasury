module.exports = {
    development: {
        uniswapRouterAddress: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', // https://uniswap.org/docs/v2/smart-contracts/router02
        
        // development addresses
        weth: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', // https://etherscan.io/token/0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2
        dai: '0x6b175474e89094c44da98b954eedeac495271d0f', // https://etherscan.io/token/0x6b175474e89094c44da98b954eedeac495271d0f
        idle: '0x875773784Af8135eA0ef43b5a374AaD105c5D39e', // https://developers.idle.finance/contracts-and-codebase
                
        // https://docs.balancer.finance/smart-contracts/addresses
        balancerCoreFactory: '0x9424B1412450D0f8Fc2255FAf6046b98213B76Bd',
        balancerCRPFactory: '0xed52D8E202401645eDAD1c0AA21e872498ce47D0',
        
        // idle contracts
        feeTreasuryAddress: '0x69a62C24F16d4914a48919613e8eE330641Bcb94', // https://developers.idle.finance/contracts-and-codebase
        ecosystemFund: '0xb0aA1f98523Ec15932dd5fAAC5d86e57115571C7',

        // fee tokens
        feeTokens: [
            '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // wbtc
            '0x0000000000085d4780B73119b644AE5ecd22b376', // tusd
            '0x57ab1ec28d129707052df4df418d58a2d46d5f51', // susd
            '0x6b175474e89094c44da98b954eedeac495271d0f', // dai
            '0xdac17f958d2ee523a2206206994597c13d831ec7', // tusd
            '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // usdc
            '0xc00e94cb662c3520282e6f5717214004a7f26888'  // comp
        ]
    }
}
