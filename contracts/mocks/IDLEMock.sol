pragma solidity = 0.6.6;

// interfaces
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract IDLEMock is ERC20 {
  constructor()
    ERC20('IDLE', 'IDLE') public {
      _setupDecimals(18); // explicitly set decimals to 18
      _mint(msg.sender, 13**24); // 1,300,000 IDLE
  }
}
