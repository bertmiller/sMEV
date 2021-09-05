const { expect } = require("chai");
const Web3EthAbi = require('web3-eth-abi')

const addresses = require('../../execute/utils/addresses')

const sUSDConfig = require('../../data/sUSD-optimalConfig.json')
const sLoanContractAbi = require('../../execute/utils/abi/sETH.json')

const chiTokenABI = require('../../execute/utils/abi/chi.json')

describe("Liquidation", function() {
  this.timeout(1000000)
  
  let owner, flashloanLiquidatorFactory, flashloanLiquidator
  
  before(async function() {
    [owner] = await hre.ethers.getSigners();
    flashloanLiquidatorFactory = await hre.ethers.getContractFactory("dYdXLiquidatorCL")
    chiToken = new hre.ethers.Contract(addresses.chiTokenAddress, chiTokenABI, owner)
  })
  
  beforeEach(async function() {
    console.log(`Initiating a new instance of the flashloan liqudator dispatcher contract`)
    flashloanLiquidator = await flashloanLiquidatorFactory.deploy(owner.address)
    await flashloanLiquidator.deployed()
  })
  
  it("Should execute the flashloan and liquidate loans", async function() {

    console.log("\n--------------- Data prep ---------------")
    let redenominateUSDC = 10**12
    let usdcEstimate = (ethers.BigNumber.from(sUSDConfig.amountToRepay).mul(100)).div(99).div(redenominateUSDC)
    console.log("Estimated USDC to buy:", usdcEstimate.toString())
    
    let redenominateWETH = 10**12
    let wethEstimateSUSD = usdcEstimate.div(2450).mul(redenominateWETH)
    console.log("WETH needed to buy:", wethEstimateSUSD.toString())
    
    // let sETHAddresses, sETHLoanIDs, sETHTotalAmountToBurn
    // [sETHAddresses, sETHLoanIDs, sETHTotalAmountToBurn] = await getLoanData(sETHLoanDataJson)
    // console.log("Total amount of sETH to burn:", sETHTotalAmountToBurn.toString())
    
    console.log("Generating abi encoded params")
    const types = [
      'address[]',
      'uint256[]',
      'uint256',
      'uint256',
      'uint256'
    ]

    const values = [
      sUSDConfig.addresses,
      sUSDConfig.loanIDs,
      (wethEstimateSUSD.mul(10)).toString(),
      usdcEstimate.toString(),
      hre.ethers.BigNumber.from(sUSDConfig.minerReward).toString()  
    ]

    console.log(values)
    let params = Web3EthAbi.encodeParameters(types, values)

    console.log("\n--------------- pDAO/chi mints ---------------")
    console.log("Impersonating pDAO")

    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [addresses.pDAOAddress]}
    )
      
    let pDAOSigner = await hre.ethers.provider.getSigner(addresses.pDAOAddress)
    let sUSDContractPDAO = new hre.ethers.Contract(addresses.sUSD_loansAddress, sLoanContractAbi, pDAOSigner)

    console.log("Triggering open liquidations")
    await sUSDContractPDAO.setLoanLiquidationOpen(true)

    console.log("Minting and approving some chi")

    let chiTest = await chiToken.mint(50)

    let chiApproval = await chiToken.approve(
      flashloanLiquidator.address,
      10000
    )
    
    console.log("\n--------------- Executing ---------------")
    const tx = await flashloanLiquidator.flashloan_22889(
      (wethEstimateSUSD.mul(10)).toString(),
      params
    )

    tx.wait(1).then(async function(response){
      console.log("Gas used by the sUSD liquidator", response.cumulativeGasUsed.toString())
    })

  });


});


function getLoanData(loanData, numberToLiquidate){
  let addresses = []
  let loanIDs = []
  let amountToBurn = []
  let totalAmountToBurn = hre.ethers.BigNumber.from(0)
  let totalCollateralInReturn = hre.ethers.BigNumber.from(0)

  for (let entry = 0; entry <=(numberToLiquidate - 1); entry++){
    // console.log("Address:",loanData[entry].address)
    // console.log("ID:", loanData[entry].loanID)
    addresses.push(loanData[entry].address)
    amountToBurn.push((hre.ethers.BigNumber.from(loanData[entry].loanAmount).add(loanData[entry].accruedInterest)).toString())
    loanIDs.push(loanData[entry].loanID)
    totalAmountToBurn = totalAmountToBurn.add(hre.ethers.BigNumber.from(loanData[entry].loanAmount).add(loanData[entry].accruedInterest))
    totalCollateralInReturn = totalCollateralInReturn.add(hre.ethers.BigNumber.from(loanData[entry].totalCollateralLiquidated))
    // console.log("New collateral:",(loanData[entry].totalCollateralLiquidated).toString())
    // console.log("Total:", totalCollateralInReturn.toString())
  }

  console.log("Total collateral in return:", totalCollateralInReturn.toString())

  return [addresses, loanIDs, totalAmountToBurn, totalCollateralInReturn]
}