// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <=0.7.5;

interface ISmartTreasuryBootstrap {
  function initialise () external; // Create smart treasury pool, using parameters from spec
  function swap() external; // Exchange fees + IDLE if required for ETH
  function bootstrap() external; // fund the smart treasury pool, and call begin updating weights
  function renounce() external; // transfer ownership to governance. 
}
