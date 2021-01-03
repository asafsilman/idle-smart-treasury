// SPDX-License-Identifier: MIT

pragma solidity = 0.6.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

import "./interfaces/IFeeCollector.sol";
import "./interfaces/BalancerInterface.sol";

/**
@title Idle finance Fee collector
@author Asaf Silman
@notice Receives fees from idle strategy tokens and routes to fee treasury and smart treasury
 */
contract FeeCollector is IFeeCollector, AccessControl {
  using EnumerableSet for EnumerableSet.AddressSet;
  using SafeMath for uint256;
  using SafeERC20 for IERC20;

  address private feeTreasuryAddress;
  address private smartTreasuryAddress;

  IUniswapV2Router02 private uniswapRouterV2;

  address private weth;
  IERC20 private wethInterface;

  // Need to use openzeppelin enumerableset
  EnumerableSet.AddressSet private depositTokens;

  uint256 private ratio; // 100000 = 100%. Ratio sent to smartTreasury vs feeTreasury

  uint256 public constant FULL_ALLOC = 100000;
  uint256 public constant MAX_NUM_FEE_TOKENS = 15; // Cap max tokens to 15
  bytes32 public constant WHITELISTED = keccak256("WHITELISTED_ROLE");

  modifier smartTreasurySet {
    require(smartTreasuryAddress!=address(0), "Smart Treasury not set");
    _;
  }

  modifier onlyAdmin {
    require(hasRole(DEFAULT_ADMIN_ROLE, msg.sender), "Unauthorised");
    _;
  }

  modifier onlyWhitelisted {
    require(hasRole(WHITELISTED, msg.sender), "Unauthorised");
    _;
  }

  /**
  @author Asaf Silman
  @notice Initialise the FeeCollector contract.
  @dev Sets the smartTreasury, weth address, uniswap router, and fee split ratio.
  @dev Also initialises the sender as admin, and whitelists for calling `deposit()`
  @dev setSmartTreasuryAddress should be called after the treasury has been deployed.
  @param _uniswapRouter The address of the uniswap router.
  @param _weth The wrapped ethereum address.
  @param _feeTreasuryAddress The address of idle's fee treasury.
  @param _ratio Initial fee split ratio.
   */
  constructor (address _uniswapRouter, address _weth, address _feeTreasuryAddress, uint _ratio) public {
    require(_uniswapRouter != address(0), "Uniswap router cannot be 0 address");
    require(_weth != address(0), "WETH cannot be the 0 address");
    require(_feeTreasuryAddress != address(0), "Fee Treasury cannot be 0 address");
    require(_ratio <= 100000, "Ratio is too high");
    
    _setupRole(DEFAULT_ADMIN_ROLE, msg.sender); // setup deployed as admin
    _setupRole(WHITELISTED, msg.sender); // setup admin as whitelisted address
    
    uniswapRouterV2 = IUniswapV2Router02(_uniswapRouter); // configure uniswap router

    // configure weth address and ERC20 interface
    weth = _weth;
    wethInterface = IERC20(_weth);

    ratio = _ratio; // setup fee split ratio (all fees will goto fee treasury)
    
    feeTreasuryAddress = _feeTreasuryAddress; // setup fee treasury address
  }

  /**
  @author Asaf Silman
  @notice Converts all registered fee tokens to WETH and deposits to
          fee treasury and smart treasury based on split ratio.
  @notice fees which are sent to fee treasury are not converted to WETH.
  @dev The fees are swaped using Uniswap simple route. E.g. Token -> WETH.
   */
  function deposit() public override smartTreasurySet onlyWhitelisted {
    uint counter = depositTokens.length();
    
    // iterate through all registered deposit tokens
    for (uint index = 0; index < counter; index++) {
      IERC20 _tokenInterface = IERC20(depositTokens.at(index));

      uint256 _currentBalance = _tokenInterface.balanceOf(address(this));
      
      // Only swap if balance > 0
      if (_currentBalance > 0) {
        // notice how decimals are not considered since we are dealing with ratios
        uint256 _feeToSmartTreasury = _currentBalance.mul(ratio).div(FULL_ALLOC); // sent to smartTreasury
        uint256 _feeToFeeTreasury   = _currentBalance.sub(_feeToSmartTreasury); // sent to feeTreasury
    
        if (_feeToFeeTreasury > 0){
          _tokenInterface.safeTransfer(feeTreasuryAddress, _feeToFeeTreasury);
        }

        if (_feeToSmartTreasury > 0) {
          // create simple route; token->WETH
          address[] memory path = new address[](2);
          path[0] = depositTokens.at(index);
          path[1] = weth;
          
          // swap token
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
      ConfigurableRightsPool crp = ConfigurableRightsPool(smartTreasuryAddress);

      crp.joinswapExternAmountIn(weth, wethBalance, 0);
    }
  }

  /**
  @author Asaf Silman
  @notice Sets the split ratio of fees to send to fee treasury vs smart treasury.
  @notice 100% means all fees are sent to smart treasury.
  @dev The split ratio must be in the range [0, 100000].
  @dev Before the split ratio is updated internally a call to `deposit()` is made
       such that all fee accrued using the previous.
  @dev smartTreasury must be set for this to be called.
  @param _ratio The updated split ratio.
   */
  function setSplitRatio(uint256 _ratio) external override smartTreasurySet onlyAdmin {
    require(_ratio <= 100000, "Ratio is too high");

    deposit();

    ratio = _ratio;
  }

  /**
  @author Asaf Silman
  @notice Sets the fee treasury address.
  @dev the fee treasury address cannot be the 0 address.
  @param _feeTreasuryAddress the new fee treasury address.
   */
  function setFeeTreasuryAddress(address _feeTreasuryAddress) external override onlyAdmin {
    require(_feeTreasuryAddress!=address(0), "Fee treasury cannot be 0 address");

    feeTreasuryAddress = _feeTreasuryAddress;
  }
  
  /**
  @author Asaf Silman
  @notice Sets the smart treasury address.
  @dev This needs to be called atleast once to properly initialise the contract
  @dev Sets maximum approval for WETH to the new smart Treasury
  @dev The smart treasury address cannot be the 0 address.
  @param _smartTreasuryAddress The new smart treasury address
   */
  function setSmartTreasuryAddress(address _smartTreasuryAddress) external override onlyAdmin {
    require(_smartTreasuryAddress!=address(0), "Smart treasury cannot be 0 address");

    // When contract is initialised, the smart treasury address is not yet set
    // Only call change allowance to 0 if previous smartTreasury was not the 0 address.
    if (smartTreasuryAddress != address(0)) {
      wethInterface.safeApprove(smartTreasuryAddress, 0); // set approval for previous fee address to 0
    }
    // max approval for new smartTreasuryAddress
    wethInterface.safeIncreaseAllowance(_smartTreasuryAddress, uint256(-1));
    smartTreasuryAddress = _smartTreasuryAddress;
  }

  /**
  @author Asaf Silman
  @notice Gives an address the WHITELISTED role. Used for calling `deposit()`.
  @dev Can only be called by admin.
  @param _addressToAdd The address to grant the role.
   */
  function addAddressToWhiteList(address _addressToAdd) external override onlyAdmin{
    grantRole(WHITELISTED, _addressToAdd);
  }

  /**
  @author Asaf Silman
  @notice Removed an address from whitelist.
  @dev Can only be called by admin
  @param _addressToRemove The address to revoke the WHITELISTED role.
   */
  function removeAddressFromWhiteList(address _addressToRemove) external override onlyAdmin {
    revokeRole(WHITELISTED, _addressToRemove);
  }
    
  /**
  @author Asaf Silman
  @notice Registers a fee token to the fee collecter
  @dev There is a maximum of 15 fee tokens than can be registered.
  @dev WETH cannot be accepted as a fee token.
  @dev The token must be a complient ERC20 token.
  @dev The fee token is approved for the uniswap router
  @param _tokenAddress The token address to register
   */
  function registerTokenToDepositList(address _tokenAddress) external override onlyAdmin {
    // cannot be weth
    require(depositTokens.length() < MAX_NUM_FEE_TOKENS, "Too many tokens");
    require(_tokenAddress != weth, "WETH not supported"); // There is no WETH -> WETH pool in uniswap
    require(depositTokens.contains(_tokenAddress) == false, "Already exists");

    IERC20(_tokenAddress).safeIncreaseAllowance(address(uniswapRouterV2), uint256(-1)); // max approval
    depositTokens.add(_tokenAddress);
  }

  /**
  @author Asaf Silman
  @notice Removed a fee token from the fee collector.
  @dev Resets uniswap approval to 0.
  @param _tokenAddress The fee token address to remove.
   */
  function removeTokenFromDepositList(address _tokenAddress) external override onlyAdmin {
    IERC20(_tokenAddress).safeApprove(address(uniswapRouterV2), 0); // 0 approval for uniswap
    depositTokens.remove(_tokenAddress);
  }

  /**
  @author Asaf Silman
  @notice Withdraws a arbitrarty ERC20 token from feeCollector to an arbitrary address.
  @param _token The ERC20 token address.
  @param _toAddress The destination address.
  @param _amount The amount to transfer.
   */
  function withdraw(address _token, address _toAddress, uint256 _amount) external override onlyAdmin {
    IERC20 token = IERC20(_token);
    token.safeTransfer(_toAddress, _amount);
  }

  /**
  @author Asaf Silman
  @notice Exchanges balancer pool token for the underlying assets and withdraws
  @param _toAddress The address to send the underlying tokens to
  @param _amount The underlying amount of balancer pool tokens to exchange
  */
  function withdrawUnderlying(address _toAddress, uint256 _amount) external override smartTreasurySet onlyAdmin{
    ConfigurableRightsPool crp = ConfigurableRightsPool(smartTreasuryAddress);
    BPool smartTreasuryBPool = crp.bPool();

    uint numTokensInPool = smartTreasuryBPool.getNumTokens();
    // uint[] memory minTokens = ; 

    crp.exitPool(_amount, new uint[](numTokensInPool));

    address[] memory treasuryTokens = smartTreasuryBPool.getCurrentTokens();

    for (uint i=0; i<treasuryTokens.length; i++) {
      IERC20 tokenInterface = IERC20(treasuryTokens[i]);
      tokenInterface.safeTransfer(_toAddress, tokenInterface.balanceOf(address(this))); // transfer all to address
    }
  }

  /**
  @author Asaf Silman
  @notice Replaces the current admin with a new admin.
  @dev The current admin rights are revoked, and given the new address.
  @dev The caller must be admin (see onlyAdmin modifier).
  @param _newAdmin The new admin address.
   */
  function replaceAdmin(address _newAdmin) external override onlyAdmin {
    grantRole(DEFAULT_ADMIN_ROLE, _newAdmin);
    revokeRole(DEFAULT_ADMIN_ROLE, msg.sender); // caller must be 
  }

  function getSplitRatio() external view returns (uint256) { return (ratio); }

  function isAddressWhitelisted(address _address) external view returns (bool) {return (hasRole(WHITELISTED, _address)); }
  function isAddressAdmin(address _address) external view returns (bool) {return (hasRole(DEFAULT_ADMIN_ROLE, _address)); }

  function getFeeTreasuryAddress() external view returns (address) { return (feeTreasuryAddress); }
  function getSmartTreasuryAddress() external view returns (address) { return (smartTreasuryAddress); }

  function isTokenInDespositList(address _tokenAddress) external view returns (bool) {return (depositTokens.contains(_tokenAddress)); }
  function getNumTokensInDepositList() external view returns (uint) {return (depositTokens.length());}
}
