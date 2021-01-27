// SPDX-License-Identifier: MIT

pragma solidity = 0.6.8;
pragma experimental ABIEncoderV2;

interface BPool {
  event LOG_SWAP(
    address indexed caller,
    address indexed tokenIn,
    address indexed tokenOut,
    uint256         tokenAmountIn,
    uint256         tokenAmountOut
  );

  event LOG_JOIN(
    address indexed caller,
    address indexed tokenIn,
    uint256         tokenAmountIn
  );

  event LOG_EXIT(
    address indexed caller,
    address indexed tokenOut,
    uint256         tokenAmountOut
  );

  event LOG_CALL(
    bytes4  indexed sig,
    address indexed caller,
    bytes           data
  ) anonymous;

  function isPublicSwap() external view returns (bool);
  function isFinalized() external view returns (bool);
  function isBound(address t) external view returns (bool);
  function getNumTokens() external view returns (uint);
  function getCurrentTokens() external view returns (address[] memory tokens);
  function getFinalTokens() external view returns (address[] memory tokens);
  function getDenormalizedWeight(address token) external view returns (uint);
  function getTotalDenormalizedWeight() external view returns (uint);
  function getNormalizedWeight(address token) external view returns (uint);
  function getBalance(address token) external view returns (uint);
  function getSwapFee() external view returns (uint);
  function getController() external view returns (address);

  function setSwapFee(uint swapFee) external;
  function setController(address manager) external;
  function setPublicSwap(bool public_) external;
  function finalize() external;
  function bind(address token, uint balance, uint denorm) external;
  function unbind(address token) external;
  function gulp(address token) external;

  function getSpotPrice(address tokenIn, address tokenOut) external view returns (uint spotPrice);
  function getSpotPriceSansFee(address tokenIn, address tokenOut) external view returns (uint spotPrice);

  function joinPool(uint poolAmountOut, uint[] calldata maxAmountsIn) external;   
  function exitPool(uint poolAmountIn, uint[] calldata minAmountsOut) external;

  function swapExactAmountIn(
    address tokenIn,
    uint tokenAmountIn,
    address tokenOut,
    uint minAmountOut,
    uint maxPrice
  ) external returns (uint tokenAmountOut, uint spotPriceAfter);

  function swapExactAmountOut(
    address tokenIn,
    uint maxAmountIn,
    address tokenOut,
    uint tokenAmountOut,
    uint maxPrice
  ) external returns (uint tokenAmountIn, uint spotPriceAfter);

  function joinswapExternAmountIn(
    address tokenIn,
    uint tokenAmountIn,
    uint minPoolAmountOut
  ) external returns (uint poolAmountOut);

  function joinswapPoolAmountOut(
    address tokenIn,
    uint poolAmountOut,
    uint maxAmountIn
  ) external returns (uint tokenAmountIn);

  function exitswapPoolAmountIn(
    address tokenOut,
    uint poolAmountIn,
    uint minAmountOut
  ) external returns (uint tokenAmountOut);

  function exitswapExternAmountOut(
    address tokenOut,
    uint tokenAmountOut,
    uint maxPoolAmountIn
  ) external returns (uint poolAmountIn);

  function totalSupply() external view returns (uint);
  function balanceOf(address whom) external view returns (uint);
  function allowance(address src, address dst) external view returns (uint);

  function approve(address dst, uint amt) external returns (bool);
  function transfer(address dst, uint amt) external returns (bool);
  function transferFrom(
    address src, address dst, uint amt
  ) external returns (bool);
}

interface ConfigurableRightsPool {
  event LogCall(
    bytes4  indexed sig,
    address indexed caller,
    bytes data
  ) anonymous;

  event LogJoin(
    address indexed caller,
    address indexed tokenIn,
    uint tokenAmountIn
  );

  event LogExit(
    address indexed caller,
    address indexed tokenOut,
    uint tokenAmountOut
  );

  event CapChanged(
    address indexed caller,
    uint oldCap,
    uint newCap
  );
    
  event NewTokenCommitted(
    address indexed token,
    address indexed pool,
    address indexed caller
  );

  function createPool(
    uint initialSupply
    // uint minimumWeightChangeBlockPeriodParam,
    // uint addTokenTimeLockInBlocksParam
  ) external;

  function createPool(
    uint initialSupply,
    uint minimumWeightChangeBlockPeriodParam,
    uint addTokenTimeLockInBlocksParam
  ) external;

  function updateWeightsGradually(
    uint[] calldata newWeights,
    uint startBlock,
    uint endBlock
  ) external;

  function joinswapExternAmountIn(
    address tokenIn,
    uint tokenAmountIn,
    uint minPoolAmountOut
  ) external;
  
  function whitelistLiquidityProvider(address provider) external;
  function removeWhitelistedLiquidityProvider(address provider) external;
  function canProvideLiquidity(address provider) external returns (bool);
  function getController() external view returns (address);
  function setController(address newOwner) external;

  function transfer(address recipient, uint amount) external returns (bool);
  function balanceOf(address account) external returns (uint);
  function totalSupply() external returns (uint);
  function bPool() external view returns (BPool);

  function exitPool(uint poolAmountIn, uint[] calldata minAmountsOut) external;
}

interface IBFactory {
  event LOG_NEW_POOL(
    address indexed caller,
    address indexed pool
  );

  event LOG_BLABS(
    address indexed caller,
    address indexed blabs
  );

  function isBPool(address b) external view returns (bool);
  function newBPool() external returns (BPool);
}

interface ICRPFactory {
  event LogNewCrp(
    address indexed caller,
    address indexed pool
  );

  struct PoolParams {
    // Balancer Pool Token (representing shares of the pool)
    string poolTokenSymbol;
    string poolTokenName;
    // Tokens inside the Pool
    address[] constituentTokens;
    uint[] tokenBalances;
    uint[] tokenWeights;
    uint swapFee;
  }

  struct Rights {
    bool canPauseSwapping;
    bool canChangeSwapFee;
    bool canChangeWeights;
    bool canAddRemoveTokens;
    bool canWhitelistLPs;
    bool canChangeCap;
  }

  function newCrp(
    address factoryAddress,
    PoolParams calldata poolParams,
    Rights calldata rights
  ) external returns (ConfigurableRightsPool);
}
