const { ethers } = require("ethers");

module.exports = Object.freeze ({
    minerRewardPercentage: 75,
    discount: 80,
    usdcSUSDPrice: 985,
    sUSDSwapsGasUsed: 350000,
    marginalGasPerLoan: 100000,
    startingWETHAmount: ethers.utils.parseEther("1000")
})