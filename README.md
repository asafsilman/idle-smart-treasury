# idle-smart-treasury

## Starting ganache
Addresses which need to be unlocked 

- founder : 0x3675D2A334f17bCD4689533b7Af263D48D96eC72
- multisig : 0xe8eA8bAE250028a8709A3841E0Ae1a44820d677b

`ganache-cli --fork https://eth-mainnet.alchemyapi.io/v2/<API KEY>  --unlock 0x3675D2A334f17bCD4689533b7Af263D48D96eC72 --unlock 0xe8eA8bAE250028a8709A3841E0Ae1a44820d677b`

## Running coverage report
`truffle run coverage`

Make sure you gave a ganache server running on localhost:8545
