// SPDX-License-Identifier: MIT

pragma solidity = 0.6.8;

// interfaces
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract WETHMock is ERC20 {
  constructor()
    ERC20('WETH', 'WETH') public {
      _setupDecimals(18); // explicitly set decimals to 18
      _mint(msg.sender, 10**23); // 100,000 WETH
  }
}
