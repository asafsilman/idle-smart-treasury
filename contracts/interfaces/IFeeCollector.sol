// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <=0.7.5;

interface IFeeCollector {
   function deposit() external; // called by whitelisted address
   function setSplitRatio(uint256 ratio) external; // ratio of fees sent SmartTreasury vs FeeTreasury
   function setFeeTreasuryAddress(address _feeTreasuryAddress) external; // called by admin
   function setSmartTreasuryAddress(address _smartTreasuryAddress) external; // If for any reason the pool needs to be migrated, call this function. Called by admin

   function addAddressToWhiteList(address addressToAdd) external; // Whitelist address. Called by admin
   function removeAddressFromWhiteList(address addressToRemove) external; // Remove from whitelist. Called by admin

   function addTokenToDepositList(address tokenAddress) external; // Register a token which can converted to ETH and deposited to smart treasury. Called by admin
   function removeTokenFromDepositList(address tokenAddress) external; // Unregister a token. Called by admin

   function withdraw(address toAddress, uint256 amount) external; // withdraw balancer liquidity token to address. Called by admin

   function setAdmin(address newAdmin) external; // called by admin
}