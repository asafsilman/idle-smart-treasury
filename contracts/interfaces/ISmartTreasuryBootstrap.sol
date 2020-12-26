// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <=0.7.5;

interface ISmartTreasuryBootstrap {
  function swap() external; // Exchange fees + IDLE if required for ETH
  function bootstrap() external; // // Create smart treasury pool, using parameters from spec and call begin updating weights
  function renounce(address _governanceAddress, address _feeCollectorAddress) external; // transfer ownership to governance. 
}
