pragma solidity = 0.6.6;

// interfaces
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract USDCMock is ERC20 {
  constructor()
    ERC20('USDC', 'USDC') public {
      _setupDecimals(6); // explicitly set decimals to 18
      _mint(msg.sender, 10**12); // 1,000,000 USDC
  }
}
