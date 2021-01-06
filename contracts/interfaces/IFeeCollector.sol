// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <=0.7.5;

interface IFeeCollector {
  function deposit(bool[] calldata _depositTokensEnabled) external; // called by whitelisted address
  function setSplitRatio(uint256 _ratio) external; // ratio of fees sent SmartTreasury vs FeeTreasury
  function setFeeTreasuryAddress(address _feeTreasuryAddress) external; // called by admin
  function setSmartTreasuryAddress(address _smartTreasuryAddress) external; // If for any reason the pool needs to be migrated, call this function. Called by admin

  function addAddressToWhiteList(address _addressToAdd) external; // Whitelist address. Called by admin
  function removeAddressFromWhiteList(address _addressToRemove) external; // Remove from whitelist. Called by admin

  function registerTokenToDepositList(address _tokenAddress) external; // Register a token which can converted to ETH and deposited to smart treasury. Called by admin
  function removeTokenFromDepositList(address _tokenAddress) external; // Unregister a token. Called by admin

   // withdraw arbitrary token to address. Called by admin
  function withdraw(address _token, address _toAddress, uint256 _amount) external;
  // exchange liquidity token for underlying token and withdraw to _toAddress
  function withdrawUnderlying(address _toAddress, uint256 _amount) external;

  function replaceAdmin(address _newAdmin) external; // called by admin
}
