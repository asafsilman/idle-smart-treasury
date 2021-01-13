// SPDX-License-Identifier: MIT

pragma solidity = 0.6.6;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

import "./interfaces/ISmartTreasuryBootstrap.sol";
import "./interfaces/BalancerInterface.sol";

import "./libraries/BalancerConstants.sol";

/**
@author Asaf Silman
@notice Smart contract for initialising the idle smart treasury
 */
contract SmartTreasuryBootstrap is ISmartTreasuryBootstrap, Ownable {
  using EnumerableSet for EnumerableSet.AddressSet;
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  address private crpaddress;

  uint private idlePerWeth; // internal price oracle for IDLE

  bool private renounced;

  IBFactory private balancer_bfactory;
  ICRPFactory private balancer_crpfactory;

  IUniswapV2Router02 private uniswapRouterV2;

  IERC20 private idle;
  IERC20 private weth;

  EnumerableSet.AddressSet private depositTokens;

  address timelock;
  address feeCollectorAddress;

  /**
  @author Asaf Silman
  @notice Initialises the bootstrap contract.
  @dev Configures balancer factories
  @dev Configures uniswap router
  @dev Configures IDLE and WETH token
  @param _balancerBFactory Balancer core factory
  @param _balancerBFactory Balancer configurable rights pool (CRP) factory
  @param _uniswapRouter Uniswap router address
  @param _idle IDLE governance token address
  @param _weth WETH token address
  @param _timelock address of IDLE timelock
  @param _feeCollectorAddress address of IDLE fee collector
  @param _initialDepositTokens The initial tokens to register with the fee deposit
   */
  constructor (
    address _balancerBFactory,
    address _balancerCRPFactory,
    address _uniswapRouter,
    address _idle,
    address _weth,
    address _timelock,
    address _feeCollectorAddress,
    address[] memory _initialDepositTokens
  ) public {

    // initialise balancer factories
    balancer_bfactory = IBFactory(_balancerBFactory);
    balancer_crpfactory = ICRPFactory(_balancerCRPFactory);

    // configure uniswap router
    uniswapRouterV2 = IUniswapV2Router02(_uniswapRouter);

    // configure tokens
    idle = IERC20(_idle);
    weth = IERC20(_weth);

    // configure network addresses
    timelock = _timelock;
    feeCollectorAddress = _feeCollectorAddress;

    renounced = false; // flag to indicate whether renounce has been called

    for (uint256 index = 0; index < _initialDepositTokens.length; index++) {
      require(_initialDepositTokens[index] != address(0), "Token cannot be  0 address");
      depositTokens.add(_initialDepositTokens[index]);
    }
  }

  /**
  @author Asaf Silman
  @notice Converts all tokens in depositToken enumerable set to WETH.
  @dev Converts tokens using uniswap simple path. E.g. token -> WETH.
  @dev This should be called after the governance proposal has transfered funds to bootstrapping address
  @dev After this has been called, `swap()` should be called.
   */
  function swap() external override onlyOwner {
    uint counter = depositTokens.length();
    for (uint index = 0; index < counter; index++) {
      address _tokenAddress = depositTokens.at(index);
      IERC20 _tokenInterface = IERC20(_tokenAddress);

      uint256 _currentBalance = _tokenInterface.balanceOf(address(this));

      address[] memory path = new address[](2);
      path[0] = _tokenAddress;
      path[1] = address(weth);
      
      uniswapRouterV2.swapExactTokensForTokensSupportingFeeOnTransferTokens(
        _currentBalance,
        1, // receive atleast 1 wei of ETH 
        path,
        address(this),
        block.timestamp
      );
    }
  }

  /**
  @author Asaf Silman
  @notice Initialises the smart treasury with bootstrapping parameters
  @notice Calculated initial weights based on total value of IDLE and WETH.
  @dev This function should be called after all fees have been swapped, by calling `swap()`
  @dev After this has been called, `bootstrap()` should be called.
   */
  function initialise() external override onlyOwner {
    require(crpaddress==address(0), "Cannot initialise if CRP already exists");
    
    uint idleBalance = idle.balanceOf(address(this));
    uint wethBalance = weth.balanceOf(address(this));

    require(idleBalance > 0, "Cannot initialise without idle in contract");
    require(wethBalance > 0, "Cannot initialise without weth in contract");

    address[] memory tokens = new address[](2);
    tokens[0] = address(idle);
    tokens[1] = address(weth);

    uint[] memory balances = new uint[](2);
    balances[0] = idleBalance;
    balances[1] = wethBalance;

    
    uint idleValueInWeth = balances[0].mul(10**18).div(idlePerWeth);
    uint wethValue = balances[1];

    uint totalValueInPool = idleValueInWeth.add(wethValue); // expressed in WETH

    // Sum of weights need to be in range B_ONE <= W_x <= B_ONE * 50
    //
    // The magic number 48 is used because this is 50 - (Number of Tokens In Pool) = 48
    //
    // weight_x = ( value_x / total_pool_value ) * B_ONE * 48 + B_ONE
    //          = (( value_x * B_ONE * 48) / total_pool_value) + B_ONE
    //
    uint[] memory weights = new uint[](2);
    weights[0] = idleValueInWeth.mul(BalancerConstants.BONE * 48).div(totalValueInPool).add(BalancerConstants.BONE); // total value / num IDLE tokens
    weights[1] = wethValue.mul(BalancerConstants.BONE * 48).div(totalValueInPool).add(BalancerConstants.BONE); // total value / num WETH tokens

    ICRPFactory.PoolParams memory params = ICRPFactory.PoolParams({
      poolTokenSymbol: "ISTT",
      poolTokenName: "Idle Smart Treasury Token",
      constituentTokens: tokens,
      tokenBalances: balances,
      tokenWeights: weights,
      swapFee: 5 * 10**15 // .5% fee = 5000000000000000
    });

    ICRPFactory.Rights memory rights = ICRPFactory.Rights({
      canPauseSwapping:   true,
      canChangeSwapFee:   true,
      canChangeWeights:   true,
      canAddRemoveTokens: true,
      canWhitelistLPs:    true,
      canChangeCap:       false
    });
    
    /**** DEPLOY POOL ****/

    ConfigurableRightsPool crp = balancer_crpfactory.newCrp(
      address(balancer_bfactory),
      params,
      rights
    );

    // A balancer pool with canWhitelistLPs does not initially whitelist the controller
    // This must be manually set
    crp.whitelistLiquidityProvider(address(this));
    crp.whitelistLiquidityProvider(timelock);
    crp.whitelistLiquidityProvider(feeCollectorAddress);

    crpaddress = address(crp);

    idle.safeIncreaseAllowance(crpaddress, balances[0]); // approve transfer of idle
    weth.safeIncreaseAllowance(crpaddress, balances[1]); // approve transfer of idle
  }

  /**
  @author Asaf Silman
  @notice Creates the smart treasury, pulls underlying funds, and mints 1000 liquidity tokens
  @notice calls updateWeightsGradually to being updating the token weights to the desired initial distribution.
  @dev Can only be called after initialise has been called
   */
  function bootstrap() external override onlyOwner {
    require(crpaddress!=address(0), "Cannot bootstrap if CRP does not exist");
    
    ConfigurableRightsPool crp = ConfigurableRightsPool(crpaddress);

    /**** CREATE POOL ****/
    crp.createPool(
      1000 * 10 ** 18, // mint 1000 shares
      3 days, // minimumWeightChangeBlockPeriodParam
      3 days  // addTokenTimeLockInBlocksParam
    );

    uint[] memory finalWeights = new uint[](2);
    finalWeights[0] = 45 * BalancerConstants.BONE; // 90 %
    finalWeights[1] = 5  * BalancerConstants.BONE; // 10 %

    /**** CALL GRADUAL POOL WEIGHT UPDATE ****/

    crp.updateWeightsGradually(
      finalWeights,
      block.timestamp,
      block.timestamp.add(90 days)  // ~ 3 months
    );
  }

  /**
  @author Asaf Silman
  @notice Renounces ownership of the smart treasury from this contract to idle governance
  @notice Transfers balancer liquidity tokens to fee collector
   */
  function renounce() external override onlyOwner {
    require(feeCollectorAddress != address(0), "Fee Collector Address is not set");
    require(crpaddress != address(0), "Cannot renounce if CRP does not exist");

    ConfigurableRightsPool crp = ConfigurableRightsPool(crpaddress);
    
    require(address(crp.bPool()) != address(0), "Cannot renounce if bPool does not exist");

    crp.removeWhitelistedLiquidityProvider(address(this));
    crp.setController(timelock);

    // transfer using safe transfer
    IERC20(crpaddress).safeTransfer(feeCollectorAddress, crp.balanceOf(address(this)));
    
    renounced = true;
  }

  /**
  @author Asaf Silman
  @notice Withdraws a arbitrarty ERC20 token from feeCollector to an arbitrary address.
  @param _token The ERC20 token address.
  @param _toAddress The destination address.
  @param _amount The amount to transfer.
   */
  function withdraw(address _token, address _toAddress, uint256 _amount) external onlyOwner {
    require(renounced==true, "Can only withdraw after contract is renounced");

    IERC20 token = IERC20(_token);
    token.safeTransfer(_toAddress, _amount);
  }

  /**
  @author Asaf Silman
  @notice Set idle price per weth. Used for setting initial weights of smart treasury
  @dev expressed in Wei
  @param _idlePerWeth idle price per weth expressed in Wei
   */
  function _setIDLEPrice(uint _idlePerWeth) external onlyOwner {
    idlePerWeth = _idlePerWeth;
  }

  /**
  @author Asaf Silman
  @notice Registers a fee token to depositTokens for swapping to WETH
  @dev All fee tokens from fee treasury should be added in this manor
  @param _tokenAddress Token address to register with bootstrap contract
   */
  function _registerTokenToDepositList(address _tokenAddress) external onlyOwner {
    require(_tokenAddress != address(weth), "WETH fees are not supported"); // There is no WETH -> WETH pool in uniswap
    require(_tokenAddress != address(idle), "IDLE fees are not supported"); // Dont swap IDLE to WETH

    IERC20(_tokenAddress).safeIncreaseAllowance(address(uniswapRouterV2), uint256(-1)); // max approval
    depositTokens.add(_tokenAddress);
  }

  /**
  @author Asaf Silman
  @notice Removes a fee token depositTokens
  @param _tokenAddress Token address to remove
   */
  function _removeTokenFromDepositList(address _tokenAddress) external onlyOwner {
    IERC20(_tokenAddress).safeApprove(address(uniswapRouterV2), 0); // 0 approval for uniswap
    depositTokens.remove(_tokenAddress);
  }

  function _getCRPAddress() external view returns (address) { return crpaddress; }
  function _getCRPBPoolAddress() external view returns (address) {return address(ConfigurableRightsPool(crpaddress).bPool());}
  function _tokenInDepositList(address _tokenAddress) external view returns (bool) {return depositTokens.contains(_tokenAddress);}
}
