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

  // address private feeTreasuryAddress;
  // address private smartTreasuryAddress;

  IUniswapV2Router02 private uniswapRouterV2;

  address private weth;

  // Need to use openzeppelin enumerableset
  EnumerableSet.AddressSet private depositTokens;

  uint256[] private allocations; // 100000 = 100%. allocation sent to beneficiaries
  address[] private beneficiaries; // Who are the beneficiaries of the fees generated from IDLE. The first beneficiary is always going to be the smart treasury

  uint128 public constant MAX_BENEFICIARIES = 5;
  uint128 public constant MIN_BENEFICIARIES = 2;
  uint256 public constant FULL_ALLOC = 100000;

  uint256 public constant MAX_NUM_FEE_TOKENS = 15; // Cap max tokens to 15
  bytes32 public constant WHITELISTED = keccak256("WHITELISTED_ROLE");

  modifier smartTreasurySet {
    require(beneficiaries[0]!=address(0), "Smart Treasury not set");
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
  @dev Sets the smartTreasury, weth address, uniswap router, and fee split allocations.
  @dev Also initialises the sender as admin, and whitelists for calling `deposit()`
  @dev At deploy time the smart treasury will not have been deployed yet.
       setSmartTreasuryAddress should be called after the treasury has been deployed.
  @param _weth The wrapped ethereum address.
  @param _feeTreasuryAddress The address of idle's fee treasury.
  @param _ratio Initial fee split ratio allocations between smart treasury and fee treasury.
  @param _multisig The multisig account to transfer ownership to after contract initialised
  @param _initialDepositTokens The initial tokens to register with the fee deposit
   */
  constructor (
    address _weth,
    address _feeTreasuryAddress,
    uint256 _ratio,
    address _multisig,
    address[] memory _initialDepositTokens
  ) public {
    require(_weth != address(0), "WETH cannot be the 0 address");
    require(_feeTreasuryAddress != address(0), "Fee Treasury cannot be 0 address");
    require(_ratio <= 100000, "Ratio is too high");
    require(_multisig != address(0), "Multisig cannot be 0 address");
    
    _setupRole(DEFAULT_ADMIN_ROLE, _multisig); // setup multisig as admin
    _setupRole(WHITELISTED, _multisig); // setup multisig as whitelisted address
    
    uniswapRouterV2 = IUniswapV2Router02(0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D); // configure uniswap router

    // configure weth address and ERC20 interface
    weth = _weth;

    allocations = new uint256[](2); // setup fee split ratio
    allocations[0] = _ratio;
    allocations[1] = FULL_ALLOC.sub(_ratio);
    
    beneficiaries = new address[](2); // setup benefifiaries
    beneficiaries[1] = _feeTreasuryAddress; // setup fee treasury address

    for (uint256 index = 0; index < _initialDepositTokens.length; index++) {
      require(_initialDepositTokens[index] != address(0), "Token cannot be  0 address");

      IERC20(_initialDepositTokens[index]).safeIncreaseAllowance(address(uniswapRouterV2), uint256(-1)); // max approval
      depositTokens.add(_initialDepositTokens[index]);
    }
  }

  /**
  @author Asaf Silman
  @notice Converts all registered fee tokens to WETH and deposits to
          fee treasury and smart treasury based on split allocations.
  @dev The fees are swaped using Uniswap simple route. E.g. Token -> WETH.
   */
  function deposit(bool[] memory _depositTokensEnabled) public override smartTreasurySet onlyWhitelisted {
    uint256 counter = depositTokens.length();
    require(_depositTokensEnabled.length == counter, "Invalid length");

    uint256 _currentBalance;

    uint256[] memory feeBalances;

    address[] memory path = new address[](2);
    path[1] = weth; // output will always be weth
    
    // iterate through all registered deposit tokens
    for (uint256 index = 0; index < counter; index++) {
      if (_depositTokensEnabled[index] == false) {continue;}

      IERC20 _tokenInterface = IERC20(depositTokens.at(index));

      _currentBalance = _tokenInterface.balanceOf(address(this));
      
      // Only swap if balance > 0
      if (_currentBalance > 0) {
        // create simple route; token->WETH
        
        path[0] = depositTokens.at(index);
        
        // swap token
        uniswapRouterV2.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          _currentBalance,
          1, 
          path,
          address(this),
          block.timestamp
        );
      }
    }

    // deposit all swapped WETH + the already present weth balance
    // to beneficiaries
    // the beneficiary at index 0 is the smart treasury
    uint256 wethBalance = IERC20(weth).balanceOf(address(this));
    if (wethBalance > 0){

      feeBalances = _amountsFromAllocations(allocations, wethBalance);
      // _feeToSmartTreasury = feeBalances[0]; // fee sent to smartTreasury

      if (wethBalance.sub(feeBalances[0]) > 0){
          // NOTE: allocation starts at 1, NOT 0, since 0 is reserved for smart treasury
          for (uint256 a_index = 1; a_index < allocations.length; a_index++){
            IERC20(weth).safeTransfer(beneficiaries[a_index], feeBalances[a_index]);
          }
        }

      if (feeBalances[0] > 0) {
        ConfigurableRightsPool crp = ConfigurableRightsPool(beneficiaries[0]); // the smart treasury is at index 0
        crp.joinswapExternAmountIn(weth, feeBalances[0], 0);
      }
    }
  }

  /**
  @author Asaf Silman
  @notice Sets the split allocations of fees to send to fee beneficiaries
  @dev The split allocations must sum to 100000.
  @dev Before the split allocation is updated internally a call to `deposit()` is made
       such that all fee accrued using the previous allocations.
  @dev smartTreasury must be set for this to be called.
  @param _allocations The updated split ratio.
   */
  function setSplitAllocation(uint256[] memory _allocations) public override smartTreasurySet onlyAdmin {
    uint256 numTokens = depositTokens.length();
    bool[] memory depositTokensEnabled = new bool[](numTokens);

    for (uint256 i=0; i<numTokens; i++) {
      depositTokensEnabled[i] = true;
    }

    deposit(depositTokensEnabled);

    _setSplitAllocation(_allocations);
  }

  /**
  @author Asaf Silman
  @notice Internal function to sets the split allocations of fees to send to fee beneficiaries
  @dev The split allocations must sum to 100000.
  @dev smartTreasury must be set for this to be called.
  @param _allocations The updated split ratio.
   */
  function _setSplitAllocation(uint256[] memory _allocations) internal smartTreasurySet {
    require(_allocations.length == beneficiaries.length, "Invalid length");
    
    uint256 sum=0;
    for (uint256 i=0; i<_allocations.length; i++) {
      sum = sum.add(_allocations[i]);
    }

    require(sum == 100000, "Ratio does not equal 100000");

    allocations = _allocations;
  }

  /**
  @author Asaf Silman
  @notice Adds an address as a beneficiary to the idle fees
  @dev The new beneficiary will be pushed to the end of the beneficiaries array.
  The new allocations must include the new beneficiary
  @dev There is a maximum of 5 beneficiaries which can be registered with the fee collector
  @param _newBeneficiary The new beneficiary to add
  @param _newAllocation The new allocation of fees including the new beneficiary
   */
  function addBeneficiaryAddress(address _newBeneficiary, uint256[] calldata _newAllocation) external override smartTreasurySet onlyAdmin {
    require(beneficiaries.length < MAX_BENEFICIARIES, "Max beneficiaries");
    require(_newBeneficiary!=address(0), "beneficiary cannot be 0 address");

    beneficiaries.push(_newBeneficiary);

    setSplitAllocation(_newAllocation); // 
  }

  /**
  @author Asaf Silman
  @notice removes a beneficiary at a given index.
  @notice WARNING: when using this method be very careful to note the new allocations
  The beneficiary at the LAST index, will be replaced with the beneficiary at `_index`.
  The new allocations need to reflect this updated array.

  eg.
  if beneficiaries = [a, b, c, d]
  and removeBeneficiaryAt(1, [...]) is called

  the final beneficiaries array will be
  [a, d, c]
  `_newAllocations` should be based off of this final array.

  @dev Cannot remove beneficiary past MIN_BENEFICIARIES. set to 2
  @dev Cannot replace the smart treasury beneficiary at index 0
  @param _index The index of the beneficiary to remove
  @param _newAllocation The new allocation of fees removing the beneficiary. NOTE !! The order of beneficiaries will change !!
   */
  function removeBeneficiaryAt(uint256 _index, uint256[] calldata _newAllocation) external override smartTreasurySet onlyAdmin {
    require(_index >= 1, "Invalid beneficiary to remove");
    require(beneficiaries.length > MIN_BENEFICIARIES, "Min beneficiaries");

    uint256 numTokens = depositTokens.length();
    bool[] memory depositTokensEnabled = new bool[](numTokens);

    for (uint256 i=0; i<numTokens; i++) {
      depositTokensEnabled[i] = true;
    }

    deposit(depositTokensEnabled); // call deposit before removing beneficiary
    
    // replace beneficiary with index with final beneficiary, and call pop
    beneficiaries[_index] = beneficiaries[beneficiaries.length-1];
    beneficiaries.pop();
    
    // NOTE THE ORDER OF ALLOCATIONS
    _setSplitAllocation(_newAllocation); // this does not call deposit. since it has already been called
  }

  /**
  @author Asaf Silman
  @notice replaces a beneficiary at a given index with a new one
  @notice a new allocation must be passed for this method
  @dev Cannot replace the smart treasury beneficiary at index 0
  @param _index The index of the beneficiary to replace
  @param _newBeneficiary The new beneficiary address
  @param _newAllocation The new allocation of fees
  */
  function replaceBeneficiaryAt(uint256 _index, address _newBeneficiary, uint256[] calldata _newAllocation) external override smartTreasurySet onlyAdmin {
    require(_index >= 1, "Invalid beneficiary to remove");
    require(_newBeneficiary!=address(0), "Beneficiary cannot be 0 address");

    setSplitAllocation(_newAllocation); // calling deposit
    
    beneficiaries[_index] = _newBeneficiary;
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
    if (beneficiaries[0] != address(0)) {
      IERC20(weth).safeApprove(beneficiaries[0], 0); // set approval for previous fee address to 0
    }
    // max approval for new smartTreasuryAddress
    IERC20(weth).safeIncreaseAllowance(_smartTreasuryAddress, uint256(-1));
    beneficiaries[0] = _smartTreasuryAddress;
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
   * Copied from idle.finance IdleTokenGovernance.sol
   *
   * Calculate amounts from percentage allocations (100000 => 100%)
   * @author idle.finance
   * @param _allocations : token allocations percentages
   * @param total : total amount
   * @return newAmounts : array with amounts
   */
  function _amountsFromAllocations(uint256[] memory _allocations, uint256 total) internal pure returns (uint256[] memory newAmounts) {
    newAmounts = new uint256[](_allocations.length);
    uint256 currBalance;
    uint256 allocatedBalance;

    for (uint256 i = 0; i < _allocations.length; i++) {
      if (i == _allocations.length - 1) {
        newAmounts[i] = total.sub(allocatedBalance);
      } else {
        currBalance = total.mul(_allocations[i]).div(FULL_ALLOC);
        allocatedBalance = allocatedBalance.add(currBalance);
        newAmounts[i] = currBalance;
      }
    }
    return newAmounts;
  }

  /**
  @author Asaf Silman
  @notice Exchanges balancer pool token for the underlying assets and withdraws
  @param _toAddress The address to send the underlying tokens to
  @param _amount The underlying amount of balancer pool tokens to exchange
  */
  function withdrawUnderlying(address _toAddress, uint256 _amount) external override smartTreasurySet onlyAdmin{
    ConfigurableRightsPool crp = ConfigurableRightsPool(beneficiaries[0]);
    BPool smartTreasuryBPool = crp.bPool();

    uint256 numTokensInPool = smartTreasuryBPool.getNumTokens();
    address[] memory poolTokens = smartTreasuryBPool.getCurrentTokens();
    uint256[] memory feeCollectorTokenBalances = new uint256[](numTokensInPool);

    for (uint256 i=0; i<poolTokens.length; i++) {
      // get the balance of a poolToken of the fee collector
      feeCollectorTokenBalances[i] = IERC20(poolTokens[i]).balanceOf(address(this));
    }

    // tokens are exitted to feeCollector
    crp.exitPool(_amount, new uint256[](numTokensInPool));

    for (uint256 i=0; i<poolTokens.length; i++) {
      IERC20 tokenInterface = IERC20(poolTokens[i]);

      // transfer to `_toAddress` [newBalance - oldBalance]
      tokenInterface.safeTransfer(
        _toAddress,
        tokenInterface.balanceOf(address(this)).sub( // get the new balance of token
          feeCollectorTokenBalances[i] // subtract previous balance
        )
      ); // transfer to `_toAddress`
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
    revokeRole(DEFAULT_ADMIN_ROLE, msg.sender); // caller must be admin
  }

  function getSplitAllocation() external view returns (uint256[] memory) { return (allocations); }

  function isAddressWhitelisted(address _address) external view returns (bool) {return (hasRole(WHITELISTED, _address)); }
  function isAddressAdmin(address _address) external view returns (bool) {return (hasRole(DEFAULT_ADMIN_ROLE, _address)); }

  function getBeneficiaries() external view returns (address[] memory) { return (beneficiaries); }
  function getSmartTreasuryAddress() external view returns (address) { return (beneficiaries[0]); }

  function isTokenInDespositList(address _tokenAddress) external view returns (bool) {return (depositTokens.contains(_tokenAddress)); }
  function getNumTokensInDepositList() external view returns (uint256) {return (depositTokens.length());}

  function getDepositTokens() external view returns (address[] memory) {
    uint256 numTokens = depositTokens.length();

    address[] memory depositTokenList = new address[](numTokens);
    for (uint256 index = 0; index < numTokens; index++) {
      depositTokenList[index] = depositTokens.at(index);
    }
    return (depositTokenList);
  }
}
