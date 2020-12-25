// SPDX-License-Identifier: MIT

pragma solidity = 0.6.6;
pragma experimental ABIEncoderV2;

import '@uniswap/v2-periphery/contracts/interfaces/IUniswapV2Router02.sol';

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

  address admin;
  address crpaddress;

  IBFactory private balancer_bfactory;
  ICRPFactory private balancer_crpfactory;

  IUniswapV2Router02 private uniswapRouterV2;

  IERC20 private idle;
  IERC20 private weth;

  EnumerableSet.AddressSet private depositTokens;

  constructor (address _balancer_bfactory, address _balancer_crpfactory, address _uniswapRouter, address _idle, address _weth) public {
    admin = msg.sender;

    balancer_bfactory = IBFactory(_balancer_bfactory);
    balancer_crpfactory = ICRPFactory(_balancer_crpfactory);

    uniswapRouterV2 = IUniswapV2Router02(_uniswapRouter); // configure uniswap router

    idle = IERC20(_idle);
    weth = IERC20(_weth);
  }

  function initialise() external override onlyOwner {
    address[] memory tokens = new address[](2);
    tokens[0] = address(idle);
    tokens[1] = address(weth);

    uint[] memory balances = new uint[](2);
    balances[0] = idle.balanceOf(address(this));
    balances[1] = weth.balanceOf(address(this));

    uint[] memory weights = new uint[](2);
    weights[0] = 99 * 10 ** 18;
    weights[1] = 1  * 10 ** 18;

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
    
    ConfigurableRightsPool crp = balancer_crpfactory.newCrp(
      address(balancer_bfactory),
      params,
      rights
    );

    crpaddress = address(crp);

    idle.approve(crpaddress, balances[0]); // approve transfer of idle
    weth.approve(crpaddress, balances[1]); // approve transfer of idle
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
    require(msg.sender == admin, "Caller is not admin");

    ConfigurableRightsPool crp = ConfigurableRightsPool(crpaddress);

    crp.createPool(
        1000 * 10 ** 18, 
        3 days,
        3 days
    );
  }
  function renounce() external override {}

  // called by owner
  function _addTokenToDepositList(address _tokenAddress) external onlyOwner {
    require(_tokenAddress != address(weth), "WETH fees are not supported"); // There is no WETH -> WETH pool in uniswap
    require(_tokenAddress != address(idle), "IDLE fees are not supported"); // Dont swap IDLE to WETH

    IERC20(_tokenAddress).safeApprove(address(uniswapRouterV2), uint256(-1)); // max approval
    depositTokens.add(_tokenAddress);
  }

  // Unregister a token. Called by admin
  function removeTokenFromDepositList(address _tokenAddress) external onlyOwner {
    
    IERC20(_tokenAddress).safeApprove(address(uniswapRouterV2), 0); // 0 approval for uniswap
    depositTokens.remove(_tokenAddress);
  }
}
