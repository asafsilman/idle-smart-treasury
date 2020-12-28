// SPDX-License-Identifier: MIT

pragma solidity = 0.6.6;
pragma experimental ABIEncoderV2;

import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';
import '@uniswap/v2-periphery/contracts/libraries/UniswapV2OracleLibrary.sol';

import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol';
import '@uniswap/v2-core/contracts/interfaces/IUniswapV2Pair.sol';

import "./interfaces/ISmartTreasuryBootstrap.sol";
import "./interfaces/BalancerInterface.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/utils/EnumerableSet.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

contract SmartTreasuryBootstrap is ISmartTreasuryBootstrap, Ownable {
  using EnumerableSet for EnumerableSet.AddressSet;
  using SafeERC20 for IERC20;
  using SafeMath for uint256;

  // using UniswapV2Library;

  address private crpaddress;

  uint private idlePerWeth;

  IBFactory private balancer_bfactory;
  ICRPFactory private balancer_crpfactory;

  IUniswapV2Factory private uniswapFactory;
  IUniswapV2Router02 private uniswapRouterV2;

  IERC20 private idle;
  IERC20 private weth;

  EnumerableSet.AddressSet private depositTokens;

  constructor (
    address _balancerBFactory,
    address _balancerCRPFactory,
    address _uniswapFactory,
    address _uniswapRouter,
    address _idle,
    address _weth
  ) public {
    balancer_bfactory = IBFactory(_balancerBFactory);
    balancer_crpfactory = ICRPFactory(_balancerCRPFactory);

    uniswapFactory = IUniswapV2Factory(_uniswapFactory);
    uniswapRouterV2 = IUniswapV2Router02(_uniswapRouter); // configure uniswap router

    idle = IERC20(_idle);
    weth = IERC20(_weth);
  }

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
        0, 
        path,
        address(this),
        block.timestamp
      );
    }
  }

  function bootstrap() external override onlyOwner {
    uint idleBalance = idle.balanceOf(address(this));
    uint wethBalance = weth.balanceOf(address(this));

    require(idleBalance > 0, "Cannot bootstrap without idle in contract");
    require(wethBalance > 0, "Cannot bootstrap without weth in contract");

    address[] memory tokens = new address[](2);
    tokens[0] = address(idle);
    tokens[1] = address(weth);

    uint[] memory balances = new uint[](2);
    balances[0] = idleBalance;
    balances[1] = wethBalance;

    uint[] memory valueInWeth = new uint[](2);
    valueInWeth[0] = balances[0].mul(idlePerWeth).div(10**18);
    valueInWeth[1] = balances[1];

    uint totalValueInPool = valueInWeth[0].add(valueInWeth[1]);

    uint[] memory weights = new uint[](2);
    weights[0] = totalValueInPool.div(balances[0]); // total value / num IDLE tokens
    weights[1] = totalValueInPool.div(balances[1]); // total value / num WETH tokens

    ICRPFactory.PoolParams memory params = ICRPFactory.PoolParams({
      poolTokenSymbol: "ISTT",
      poolTokenName: "Idle Smart Treasury Token",
      constituentTokens: tokens,
      tokenBalances: balances,
      tokenWeights: weights,
      swapFee: 5 * 10**16 // .5% fee = 50000000000000000
    });

    ICRPFactory.Rights memory rights = ICRPFactory.Rights({
      canPauseSwapping:   true,
      canChangeSwapFee:   true,
      canChangeWeights:   true,
      canAddRemoveTokens: true,
      canWhitelistLPs:    true,
      canChangeCap:       true
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

    crpaddress = address(crp);

    idle.approve(crpaddress, balances[0]); // approve transfer of idle
    weth.approve(crpaddress, balances[1]); // approve transfer of idle

    /**** CREATE POOL ****/

    crp.createPool(
        1000 * 10 ** 18, // mint 1000 shares
        3 days, // minimumWeightChangeBlockPeriodParam
        3 days  // addTokenTimeLockInBlocksParam
    );

    // 
    uint[] memory finalWeights = new uint[](2);
    finalWeights[0] = 9;
    finalWeights[1] = 1;

    /**** CALL GRADUAL POOL WEIGHT UPDATE ****/

    crp.updateWeightsGradually(
      finalWeights,
      block.timestamp,
      block.timestamp.add(90 days) // ~ 3 months
    );
  }

  function renounce(address _governanceAddress, address _feeCollectorAddress) external override onlyOwner {
    ConfigurableRightsPool crp = ConfigurableRightsPool(crpaddress);

    crp.whitelistLiquidityProvider(_governanceAddress);
    crp.whitelistLiquidityProvider(_feeCollectorAddress);
    crp.removeWhitelistedLiquidityProvider(address(this));

    crp.setController(_governanceAddress);

    crp.transfer(_feeCollectorAddress, crp.balanceOf(address(this)));
  }

  // withdraw arbitrary token to address. Called by admin, if any remaining tokens on contract
  function withdraw(address _token, address _toAddress, uint256 _amount) external onlyOwner {
    IERC20 token = IERC20(_token);
    token.safeTransfer(_toAddress, _amount);
  }

  // called by owner
  function _setIDLEPrice(uint _idlePerWeth) external onlyOwner {
    // set idle price per weth by owner
    // used for setting initial weights of smart treasury
    // expressed in Wei
    
    idlePerWeth = _idlePerWeth;
  }

  // called by owner
  function _addTokenToDepositList(address _tokenAddress) external onlyOwner {
    require(_tokenAddress != address(weth), "WETH fees are not supported"); // There is no WETH -> WETH pool in uniswap
    require(_tokenAddress != address(idle), "IDLE fees are not supported"); // Dont swap IDLE to WETH

    IERC20(_tokenAddress).safeApprove(address(uniswapRouterV2), uint256(-1)); // max approval
    depositTokens.add(_tokenAddress);
  }

  // Unregister a token. Called by admin
  function _removeTokenFromDepositList(address _tokenAddress) external onlyOwner {
    
    IERC20(_tokenAddress).safeApprove(address(uniswapRouterV2), 0); // 0 approval for uniswap
    depositTokens.remove(_tokenAddress);
  }

  function _getCRPAddress() external view returns (address) { return crpaddress; }
}
