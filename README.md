# idle-smart-treasury

## Starting ganache
Addresses which need to be unlocked 

- founder : 0x3675D2A334f17bCD4689533b7Af263D48D96eC72
- multisig : 0xe8eA8bAE250028a8709A3841E0Ae1a44820d677b

`ganache-cli --fork https://eth-mainnet.alchemyapi.io/v2/<API KEY> -u 0x70178102AA04C5f0E54315aA958601eC9B7a4E08 -u 0x69a62C24F16d4914a48919613e8eE330641Bcb94 -u 0xb0aA1f98523Ec15932dd5fAAC5d86e57115571C7`

## Running coverage report
`truffle run coverage`

Make sure you gave a ganache server running on localhost:8545
