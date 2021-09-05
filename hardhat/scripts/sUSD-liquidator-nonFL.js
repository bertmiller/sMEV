const { expect } = require("chai");
const Web3EthAbi = require('web3-eth-abi')

const addresses = require('../../execute/utils/addresses')

const sUSDConfig = require('../../data/sUSD-optimalConfig.json')
const sUSDConfig2 = require('../../data/sUSD-optimalConfig2.json')
const sUSDConfig3 = require('../../data/sUSD-optimalConfig3.json')

const sLoanContractAbi = require('../../execute/utils/abi/sETH.json')

const chiTokenABI = require('../../execute/utils/abi/chi.json');
const { ethers } = require("ethers");

describe("Liquidation", function() {
  this.timeout(1000000)
  
  let owner, flashloanLiquidatorFactory, flashloanLiquidator
  
  before(async function() {
    [owner] = await hre.ethers.getSigners();
    flashloanLiquidatorFactory = await hre.ethers.getContractFactory("sLiquidator")
    chiToken = new hre.ethers.Contract(addresses.chiTokenAddress, chiTokenABI, owner)
  })
  
  beforeEach(async function() {
    console.log(`Initiating a new instance of the flashloan liqudator dispatcher contract`)
    
    let wethNeeded  = hre.ethers.BigNumber.from(sUSDConfig.wethNeeded)
    console.log("ETH needed:", wethNeeded.toString())
    let transactionOptions = {
      value: wethNeeded
    }

    flashloanLiquidator = await flashloanLiquidatorFactory.deploy(owner.address,transactionOptions)
    
    await flashloanLiquidator.deployed()
  })
  
  it("Should execute the flashloan and liquidate loans", async function() {

    //  await owner.sendTransaction({
    //   to: flashloanLiquidator.address,
    //   value: ethers.utils.parseEther("1000")
    // });

    console.log("\n--------------- Data prep ---------------")

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

    await chiToken.transfer(flashloanLiquidator.address, 50)

    let chiApproval = await chiToken.approve(
      flashloanLiquidator.address,
      10000
    )
    
    console.log("\n--------------- Executing ---------------")
    const tx = await flashloanLiquidator.execute_49668(
      sUSDConfig.addresses,
      sUSDConfig.loanIDs,
      hre.ethers.BigNumber.from(sUSDConfig.wethNeeded).toString(),
      hre.ethers.BigNumber.from(sUSDConfig.usdcNeeded).toString(),
      hre.ethers.BigNumber.from(sUSDConfig.minerReward).toString() 
    )

    const tx2 = await flashloanLiquidator.followUp_119827(
      sUSDConfig2.addresses,
      sUSDConfig2.loanIDs,
      hre.ethers.BigNumber.from(sUSDConfig2.wethNeeded).toString(),
      hre.ethers.BigNumber.from(sUSDConfig2.usdcNeeded).toString(),
      hre.ethers.BigNumber.from(sUSDConfig2.minerReward).toString(),
      hre.ethers.BigNumber.from(sUSDConfig.wethNeeded).toString()
    )

    const tx3 = await flashloanLiquidator.followUp_119827(
      sUSDConfig3.addresses,
      sUSDConfig3.loanIDs,
      hre.ethers.BigNumber.from(sUSDConfig3.wethNeeded).toString(),
      hre.ethers.BigNumber.from(sUSDConfig3.usdcNeeded).toString(),
      hre.ethers.BigNumber.from(sUSDConfig3.minerReward).toString(),
      hre.ethers.BigNumber.from(sUSDConfig.wethNeeded).toString()
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