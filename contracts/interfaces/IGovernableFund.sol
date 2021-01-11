pragma solidity >0.5.16;
pragma experimental ABIEncoderV2;

interface IGovernorFund {
  function transfer(address token, address to, uint256 value) external returns (bool);
} 
