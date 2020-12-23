pragma solidity = 0.6.6;

// interfaces
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DAIMock is ERC20 {
  constructor()
    ERC20('DAI', 'DAI') public {
      _setupDecimals(18); // explicitly set decimals to 18
      _mint(msg.sender, 10**24); // 1,000,000 DAI
  }
}
