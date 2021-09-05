const { expect } = require("chai");
const Web3EthAbi = require('web3-eth-abi')

const addresses = require('../../execute/utils/addresses')
const abis = require('../../execute/utils/abi')

// const sETHLoanDataJson = require('../../data/sETH-loanData.json')

describe("Collateral Value Getter", function() {
  this.timeout(1000000)
  
  let owner
  
  before(async function() {
    [owner] = await hre.ethers.getSigners();
  })

  it("Should return values of collateral for a single loan", async function() {
    let collateralOracleFactory = await hre.ethers.getContractFactory("sAssetsOracle",
    {
      libraries: {
        SafeDecimalMath: "0x7133afF303539b0A4F60Ab9bd9656598BF49E272"
      }
    }
    )
    let collateralOracle = await collateralOracleFactory.deploy()
    await collateralOracle.deployed()

    let sUSDBytes = hre.ethers.utils.formatBytes32String("sUSD")
    let ethBytes = hre.ethers.utils.formatBytes32String("ETH")

    let collateralValue = await collateralOracle.getCollateralAmountSUSD(sUSDBytes, "458764573250397213659146", ethBytes);
    console.log("Test collateral returned for loan ID 311:", collateralValue.toString())
  })

  it("Should return values of open loan IDs in batches", async function() {
    let collateralOracleFactory = await hre.ethers.getContractFactory("sAssetsOracle",
    {
      libraries: {
        SafeDecimalMath: "0x7133afF303539b0A4F60Ab9bd9656598BF49E272"
      }
    }
    )
    let collateralOracle = await collateralOracleFactory.deploy()
    await collateralOracle.deployed()

    collateralOracle.getLoan("0x203444AdD0835d95AAbbf7Ab92b18a69e1F640F1", 255, addresses.sUSD_loansAddress)

    let numberToLiquidate = 100

    let sUSDAddresses, sUSDLoanIDs, sUSDTotalAmountToBurn, sUSDTotalCollateralInReturn
    [sUSDAddresses, sUSDLoanIDs, sUSDTotalAmountToBurn, sUSDTotalCollateralInReturn] = await getLoanData(sUSDLoanDataJson, numberToLiquidate)
    
    let uniquesUSDAddresses = getUniqueAddresses(sUSDAddresses)
    
    console.log("Max length:", sUSDLoanDataJson.length)
    let returnData = await collateralOracle.batchOpenLoanIDsByAccount(uniquesUSDAddresses, addresses.sUSD_loansAddress, sUSDLoanDataJson.length)
    
    let newAddress, newLoanIds
    [newAddress, newLoanIds] = parseBatchOpenIDReturnData(returnData)

  })

  it("Should return values of collateral in batches", async function() {
    let collateralOracleFactory = await hre.ethers.getContractFactory("sAssetsOracle",
      {
        libraries: {
          SafeDecimalMath: "0x7133afF303539b0A4F60Ab9bd9656598BF49E272"
        }
      }
    )
    let collateralOracle = await collateralOracleFactory.deploy()
    await collateralOracle.deployed()

    let numberToLiquidate = 100

    let sUSDAddresses, sUSDLoanIDs, sUSDTotalAmountToBurn, sUSDTotalCollateralInReturn
    [sUSDAddresses, sUSDLoanIDs, sUSDTotalAmountToBurn, sUSDTotalCollateralInReturn] = await getLoanData(sUSDLoanDataJson, numberToLiquidate)

    let returnData = await collateralOracle.batchGetLoanInformation(sUSDAddresses, sUSDLoanIDs, addresses.sUSD_loansAddress)
    
    let totalRepaymentAmounts = hre.ethers.BigNumber.from(0)
    let totalCollateralLiquidated = hre.ethers.BigNumber.from(0)

    for (entry in returnData[0]){
      totalRepaymentAmounts = totalRepaymentAmounts.add(returnData[0][entry])
    }

    for (entry in returnData[1]){
      totalCollateralLiquidated = totalCollateralLiquidated.add(returnData[1][entry])
    }

    console.log(totalRepaymentAmounts.toString())
    console.log(totalCollateralLiquidated.toString())
  })
  
});


function parseBatchOpenIDReturnData(batchOpenIDReturnData){
  let addresses = batchOpenIDReturnData[0]
  let loanIDs = batchOpenIDReturnData[1]

  let newAddresses = []
  let newLoans = []

  for (let i = 0; i < loanIDs.length; i++){
    if (loanIDs[i].toString() != '0'){
      newAddresses.push(addresses[i])
      newLoans.push(loanIDs[i].toString())
    }
  }
  
  return [newAddresses, newLoans]
}


function getLoanData(loanData, numberToLiquidate){
  let addresses = []
  let loanIDs = []
  let amountToBurn = []
  let totalAmountToBurn = hre.ethers.BigNumber.from(0)
  let totalCollateralInReturn = hre.ethers.BigNumber.from(0)

  
  if (numberToLiquidate == 100){
    numberToLiquidate = loanData.length;
  }
  for (let entry = 0; entry <= (numberToLiquidate - 1); entry++){
    // console.log(numberToLiquidate)
    // console.log("Address:",loanData[entry].address)
    // console.log("ID:", loanData[entry].loanID)
    addresses.push(loanData[entry].address)
    amountToBurn.push((hre.ethers.BigNumber.from(loanData[entry].loanAmount).add(loanData[entry].accruedInterest)).toString())
    loanIDs.push(loanData[entry].loanID)
    totalAmountToBurn = totalAmountToBurn.add(hre.ethers.BigNumber.from(loanData[entry].loanAmount).add(loanData[entry].accruedInterest))
    totalCollateralInReturn = totalCollateralInReturn.add(hre.ethers.BigNumber.from(loanData[entry].totalCollateralLiquidated))
    // console.log(t)
    // console.log("New collateral:",(loanData[entry].totalCollateralLiquidated).toString())
    // console.log("Total:", totalCollateralInReturn.toString())
  }

  // console.log("\nTotal amount to burn:", totalAmountToBurn.toString())
  // console.log("Total collateral in return:", totalCollateralInReturn.toString())

  return [addresses, loanIDs, totalAmountToBurn, totalCollateralInReturn]
}

function getUniqueAddresses(addresses){
  let uniqueAddresses = []

  for (entry in addresses){
    if (!uniqueAddresses.includes(addresses[entry])){
      uniqueAddresses.push(addresses[entry])
    }
  }

  return uniqueAddresses
}

// function accruedInterestOnLoan(uint256 _loanAmount, uint256 _seconds) public view returns (uint256 interestAmount) {
  // Simple interest calculated per second
  // Interest = Principal * rate * time
  // interestAmount = _loanAmount.multiplyDecimalRound(interestPerSecond.mul(_seconds));
// }