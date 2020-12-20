// SPDX-License-Identifier: MIT

pragma solidity >=0.6.0 <=0.7.5;

import "./interfaces/ISmartTreasuryBootstrap.sol";

contract SmartTreasuryBootstrap is ISmartTreasuryBootstrap {
    address admin;

    constructor () public {
        admin = msg.sender;
    }

    function initialise() external override {}
    function swap() external override {}
    function bootstrap() external override {}
    function renounce() external override {}
}
