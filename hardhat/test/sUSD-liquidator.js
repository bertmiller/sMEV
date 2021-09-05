const { expect } = require("chai");
const Web3EthAbi = require('web3-eth-abi')

const addresses = require('../../execute/utils/addresses')

const sUSDData = require('../../data/sUSD-optimalConfig.json')
const sUSDData2 = require('../../data/sUSD-optimalConfig2.json')
const sUSDData3 = require('../../data/sUSD-optimalConfig3.json')

const sLoanContractAbi = require('../../execute/utils/abi/sETH.json')

const chiTokenABI = require('../../execute/utils/abi/chi.json');
const { Signer } = require("ethers");

describe("Liquidation", function() {
  this.timeout(1000000)
  
  let owner, flashloanLiquidatorFactory, flashloanLiquidator
  
  before(async function() {
    [owner] = await hre.ethers.getSigners();
    flashloanLiquidatorFactory = await hre.ethers.getContractFactory("dYdXLiquidator")
    chiToken = new hre.ethers.Contract(addresses.chiTokenAddress, chiTokenABI, owner)
  })
  
  beforeEach(async function() {
    console.log(`Initiating a new instance of the flashloan liqudator dispatcher contract`)
    flashloanLiquidator = await flashloanLiquidatorFactory.deploy(owner.address)
    await flashloanLiquidator.deployed()
  })
  
  it("Should execute the flashloan and liquidate loans", async function() {

    await owner.sendTransaction({
      to: flashloanLiquidator.address,
      value: hre.ethers.utils.parseEther("1")
    })
    
    console.log("\n--------------- Data prep ---------------")
    
    console.log("Generating abi encoded params")
    const types = [
      'address[]',
      'uint256[]',
      'uint256',
      'uint256',
      'uint256'
    ]
  
    const values = [
      sUSDData.addresses,
      sUSDData.loanIDs,
      (hre.ethers.BigNumber.from(sUSDData.wethNeeded).mul(10)).toString(),
      hre.ethers.BigNumber.from(sUSDData.usdcNeeded).toString(),
      hre.ethers.BigNumber.from(sUSDData.minerReward).toString()    
    ]

    const bundleTwoValues = [
      sUSDData2.addresses,
      sUSDData2.loanIDs,
      (hre.ethers.BigNumber.from(sUSDData2.wethNeeded).mul(10)).toString(),
      hre.ethers.BigNumber.from(sUSDData2.usdcNeeded).toString(),
      hre.ethers.BigNumber.from(sUSDData2.minerReward).toString()    
    ]

    const bundleThreeValues = [
      sUSDData3.addresses,
      sUSDData3.loanIDs,
      (hre.ethers.BigNumber.from(sUSDData3.wethNeeded).mul(10)).toString(),
      hre.ethers.BigNumber.from(sUSDData3.usdcNeeded).toString(),
      hre.ethers.BigNumber.from(sUSDData3.minerReward).toString()    
    ]

    let params = Web3EthAbi.encodeParameters(types, values)
    let bundleTwoParams = Web3EthAbi.encodeParameters(types, bundleTwoValues)
    let bundleThreeParams = Web3EthAbi.encodeParameters(types, bundleThreeValues)

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

    let chiTest = await chiToken.mint(2)

    let chiApproval = await chiToken.approve(
      flashloanLiquidator.address,
      10000
    )

    let chiPreTx1 = await chiToken.balanceOf(owner.address);
    console.log("Chi pre:", chiPreTx1.toString())
    
    console.log("\n--------------- Executing ---------------")
    const tx = await flashloanLiquidator.flashloan_4247(
      (hre.ethers.BigNumber.from(sUSDData.wethNeeded).mul(10)).toString(),
      params,
      0
    )

    let chiPostTx1 = await chiToken.balanceOf(owner.address);
    console.log("Chi post:", chiPostTx1.toString())

    const tx2 = await flashloanLiquidator.flashloan_4247(
      (hre.ethers.BigNumber.from(sUSDData2.wethNeeded).mul(10)).toString(),
      bundleTwoParams,
      1
    )

    // const tx3 = await flashloanLiquidator.flashloan_4247(
    //   (hre.ethers.BigNumber.from(sUSDData3.wethNeeded).mul(10)).toString(),
    //   bundleThreeParams
    // )

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