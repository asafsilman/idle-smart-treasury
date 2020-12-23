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

  /**
   * @dev Initialises the fee collector with addresses for the feeTreasury, the smartTreasury, weth address, and the uniswap router.
   * Also initialises the sender as admin, and whitelists for calling deposit
   */
  constructor (address _uniswapRouter, address _weth, address _feeTreasuryAddress, address _smartTreasuryAddress) public {
    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender); // setup deployed as admin
    _setupRole(WHITELISTED, msg.sender); // setup admin as whitelisted address
    
    uniswapRouterV2 = IUniswapV2Router02(_uniswapRouter); // configure uniswap router

    // configure weth address and ERC20 interface
    weth = _weth;
    wethInterface = IERC20(_weth);

    ratio = 0; // setup ratio
    
    feeTreasuryAddress = _feeTreasuryAddress; // setup feeTreasury address
    smartTreasuryAddress = _smartTreasuryAddress; // setup smartTreasury address

    // approve weth deposits to smartTreasury
    wethInterface.safeApprove(_smartTreasuryAddress, uint256(-1)); // max approval
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
  
  // If for any reason the pool needs to be migrated, call this function. Called by admin
  function setSmartTreasuryAddress(address _smartTreasuryAddress) external override {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");

    wethInterface.safeApprove(smartTreasuryAddress, 0); // set approval for previous fee address to 0
    wethInterface.safeApprove(_smartTreasuryAddress, uint256(-1)); // max approval for new smartTreasuryAddress
    smartTreasuryAddress = _smartTreasuryAddress;
  }

  // Whitelist address. Called by admin
  function addAddressToWhiteList(address _addressToAdd) external override {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");

    grantRole(WHITELISTED, _addressToAdd);
  }

  // Remove from whitelist. Called by admin
  function removeAddressFromWhiteList(address _addressToRemove) external override {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");

    revokeRole(WHITELISTED, _addressToRemove);
  }
    
  // Register a token which can converted to ETH and deposited to smart treasury. Called by admin
  /**
   * @dev the deposit token must have a uniswap TOKEN -> WETH pool.
   * This smart contract uses a simple route of TOKEN -> WETH to deposit into smart treasury
   */
  function addTokenToDepositList(address _tokenAddress) external override {
    // cannot be weth
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
    require(whitelistedTokens.length() < MAX_NUM_FEE_TOKENS, "Too many tokens");
    require(_tokenAddress != weth, "WETH fees are not supported"); // There is no WETH -> WETH pool in uniswap

    IERC20(_tokenAddress).safeApprove(address(uniswapRouterV2), uint256(-1)); // max approval
    whitelistedTokens.add(_tokenAddress);
  }

  // Unregister a token. Called by admin
  function removeTokenFromDepositList(address tokenAddress) external override {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
    // require(whitelistedTokens.contains(tokenAddress), "tokenAddress not cointained in whitelist");

    IERC20(tokenAddress).safeApprove(address(uniswapRouterV2), 0); // 0 approval for uniswap
    whitelistedTokens.remove(tokenAddress);
  }

  function withdraw(address _token, address _toAddress, uint256 _amount) external override {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");

    IERC20 token = IERC20(_token);
    token.safeTransfer(_toAddress, _amount);
  } // withdraw balancer liquidity token to address. Called by admin

  // exchange liquidity token for underlying token and withdraw to _toAddress
  function withdrawUnderlying(address _toAddress, uint256 _amount) external override {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");
    // TODO, does this address need to be approved ??
    BPool smartTreasuryBPool = BPool(smartTreasuryAddress);

    uint numTokensInPool = smartTreasuryBPool.getNumTokens();
    uint[] memory minTokens = new uint[](numTokensInPool); 

    smartTreasuryBPool.exitPool(_amount, minTokens);

    address[] memory treasuryTokens = smartTreasuryBPool.getCurrentTokens();

    for (uint i=0; i<treasuryTokens.length; i++) {
      IERC20 tokenInterface = IERC20(treasuryTokens[i]);
      tokenInterface.safeTransfer(_toAddress, tokenInterface.balanceOf(address(this))); // transfer all to address
    }
  }

  function replaceAdmin(address _newAdmin) external override {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Caller is not an admin");

    grantRole(DEFAULT_ADMIN_ROLE, _newAdmin);
    revokeRole(DEFAULT_ADMIN_ROLE, msg.sender); // caller must be admin
  } // called by admin

  function getSplitRatio() external view returns (uint256) { return (ratio); }

  function isAddressWhitelisted(address _address) external view returns (bool) {return (hasRole(WHITELISTED, _address)); }
  function isAddressAdmin(address _address) external view returns (bool) {return (hasRole(DEFAULT_ADMIN_ROLE, _address)); }

  function getFeeTreasuryAddress() external view returns (address) { return (feeTreasuryAddress); }
  function getSmartTreasuryAddress() external view returns (address) { return (smartTreasuryAddress); }

  function isTokenInDespositList(address _tokenAddress) external view returns (bool) {return (whitelistedTokens.contains(_tokenAddress)); }
}
