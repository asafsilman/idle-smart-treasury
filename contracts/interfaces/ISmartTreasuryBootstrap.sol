// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <=0.7.5;

interface ISmartTreasuryBootstrap {
  function swap(uint256[] calldata minBalances) external; // Exchange fees + IDLE if required for ETH
  function initialise() external;
  function bootstrap() external; // Create smart treasury pool, using parameters from spec and call begin updating weights
  function renounce() external; // transfer ownership to governance. 
}
