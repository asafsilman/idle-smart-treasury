// SPDX-License-Identifier: MIT

pragma solidity =0.6.6;

// import '@uniswap/v2-periphery/contracts/libraries/UniswapV2Library.sol';
import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";


import "./interfaces/IFeeCollector.sol";
import "./interfaces/BalancerInterface.sol";


contract FeeCollector is IFeeCollector, AccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    address feeTreasuryAddress;
    address smartTreasuryAddress;

    IUniswapV2Router02 private uniswapRouterV2;

    address private weth;
    IERC20 private wethInterface;

    // Need to use openzeppelin enumerableset
    EnumerableSet.AddressSet private whitelistedTokens;

    uint256 ratio; // 100000 = 100%. Ratio sent to smartTreasury vs feeTreasury

    uint256 FULL_ALLOC = 100000;
    uint256 MAX_NUM_FEE_TOKENS = 15;
    bytes32 public constant WHITELISTED = keccak256("WHITELISTED_ROLE");

    constructor (address _uniswapRouter, address _weth, address _feeTreasuryAddress, address _smartTreasuryAddress) public {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender); // setup deployed as admin
        _setupRole(WHITELISTED, msg.sender); // setup admin as whitelisted address
        
        uniswapRouterV2 = IUniswapV2Router02(_uniswapRouter); // configure uniswap router

        // configure weth address and ERC20 interface
        weth = _weth;
        wethInterface = IERC20(_weth);

        // setup feeTreasury address
        feeTreasuryAddress = _feeTreasuryAddress;

        // setup smartTreasury address
        smartTreasuryAddress = _smartTreasuryAddress;
    }

    function deposit() public override {
        require(hasRole(WHITELISTED, msg.sender), "Caller is not an admin");

        uint counter = whitelistedTokens.length();
        for (uint index = 0; index < counter; index++) {
            address _tokenAddress = whitelistedTokens.at(index);
            IERC20 _tokenInterface = IERC20(_tokenAddress);

            uint256 _currentBalance = _tokenInterface.balanceOf(address(this));

            
            if (_currentBalance > 0) {
                // notice how decimals are not considered since we are dealing with ratios
                uint256 _feeToSmartTreasury = _currentBalance.mul(ratio).div(FULL_ALLOC); // sent to smartTreasury
                uint256 _feeToFeeTreasury   = _currentBalance.sub(_feeToSmartTreasury); // sent to feeTreasury
            
                if (_feeToFeeTreasury > 0){
                    _tokenInterface.safeTransfer(feeTreasuryAddress, _feeToFeeTreasury);
                }

                if (_feeToSmartTreasury > 0) {
                    address[] memory path = new address[](2);
                    path[0] = _tokenAddress;
                    path[1] = weth;
                    
                    require(_tokenInterface.approve(address(uniswapRouterV2), _feeToSmartTreasury), 'approve failed');
                    uniswapRouterV2.swapExactTokensForTokensSupportingFeeOnTransferTokens(
                        _feeToSmartTreasury,
                        0, 
                        path,
                        address(this),
                        block.timestamp
                    );
                }
            }
        }

        // deposit all swapped WETH into balancer pool
        uint256 wethBalance = wethInterface.balanceOf(address(this));
        if (wethBalance > 0){
            // add to bpool
            BPool smartTreasuryBPool = BPool(smartTreasuryAddress);

            require(wethInterface.approve(feeTreasuryAddress, wethBalance), 'approve failed');
            smartTreasuryBPool.joinswapExternAmountIn(weth, wethBalance, 0);
        }
    }

    // ratio of fees sent SmartTreasury vs FeeTreasury
    // calls deposit first
    // so all fees accrued using the previous split value are honoured.
    function setSplitRatio(uint256 _ratio) external override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
        require(_ratio <= 100000, "Ratio is too high");
        deposit();

        ratio = _ratio;
    }

    function setFeeTreasuryAddress(address _feeTreasuryAddress) external override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");

        feeTreasuryAddress = _feeTreasuryAddress;
    }
    function setSmartTreasuryAddress(address _smartTreasuryAddress) external override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");

        smartTreasuryAddress = _smartTreasuryAddress;
    } // If for any reason the pool needs to be migrated, call this function. Called by admin

    function addAddressToWhiteList(address addressToAdd) external override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");

        grantRole(WHITELISTED, addressToAdd);
    } // Whitelist address. Called by admin
    function removeAddressFromWhiteList(address addressToRemove) external override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");

        revokeRole(WHITELISTED, addressToRemove);
    } // Remove from whitelist. Called by admin
    
     // Register a token which can converted to ETH and deposited to smart treasury. Called by admin
    function addTokenToDepositList(address tokenAddress) external override {
        // cannot be weth
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
        require(whitelistedTokens.length() < MAX_NUM_FEE_TOKENS, "Too many tokens");
        require(tokenAddress != weth, "WETH fees are not supported");

        whitelistedTokens.add(tokenAddress);
    }

    // Unregister a token. Called by admin
    function removeTokenFromDepositList(address tokenAddress) external override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
        // require(whitelistedTokens.contains(tokenAddress), "tokenAddress not cointained in whitelist");

        whitelistedTokens.remove(tokenAddress);
    }

    function withdraw(address toAddress, uint256 amount) external override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");

        IERC20 smartTreasuryLiquidityToken = IERC20(smartTreasuryAddress);
        smartTreasuryLiquidityToken.safeTransfer(toAddress, amount);
    } // withdraw balancer liquidity token to address. Called by admin

    function replaceAdmin(address newAdmin) external override {
        require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");

        grantRole(DEFAULT_ADMIN_ROLE, newAdmin);
        revokeRole(DEFAULT_ADMIN_ROLE, msg.sender);
    } // called by admin

    function getSplitRatio() external view returns (uint256) { return (ratio); }

    function isAddressWhitelisted(address _address) external view returns (bool) {return (hasRole(WHITELISTED, _address)); }
    function isAddressAdmin(address _address) external view returns (bool) {return (hasRole(DEFAULT_ADMIN_ROLE, _address)); }

    function getFeeTreasuryAddress() external view returns (address) { return (feeTreasuryAddress); }
    function getSmartTreasuryAddress() external view returns (address) { return (smartTreasuryAddress); }

    function isTokenInDespositList(address _tokenAddress) external view returns (bool) {return (whitelistedTokens.contains(_tokenAddress)); }
}