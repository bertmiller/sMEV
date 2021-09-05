require("@nomiclabs/hardhat-waffle")
require("@nomiclabs/hardhat-truffle5")

module.exports = {
    solidity: "0.6.12",
    networks: {
      hardhat: {
        forking: {
          url: `RPC endpoint`
        }
      }
    },
  }
  