const ethers = require('ethers')
const fs = require('fs')
const addresses = require('./utils/addresses')
const abis = require('./utils/abi')
const constants = require('./utils/constants')
const request = require('request-promise')
require('dotenv').config()

var ethereumPriceCoingeckoOptions = {
  'method': 'GET',
  'url': 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
  'headers': {
  }
};

require('dotenv').config()

let nodeHttpUrl = process.env.nodeHttpUrl
let nodeWsURl   = process.env.nodeWsURl

const ethersHTTPChainprovider = new ethers.providers.JsonRpcProvider(nodeHttpUrl)
const ethersWSChainProvider = new ethers.providers.WebSocketProvider(nodeWsURl)


let sAssetsOracle = new ethers.Contract(addresses.sAssetsOracle, abis.sAssetsOracle,  ethersHTTPChainprovider)

async function main(){
    let lock = false
    ethersWSChainProvider.on("block", async (blockNumber) => {
        const sUSDAddresses = require('../data/sUSD-addresses.json')
        const sUSDLoanIDs = require('../data/sUSD-loanIDs.json')
        console.log("\nBlock number:", blockNumber)
        if (lock == false){
            lock = true
 
            console.time()
            
            console.log("Getting the price of ETH")
            const ethereumPriceJSON = JSON.parse(await request.get(ethereumPriceCoingeckoOptions))
            const ethereumPrice = Math.ceil((ethereumPriceJSON['ethereum'].usd)*0.99)

            console.log("Getting unique addresses")
            let uniquesUSDAddresses = getUniqueAddresses(sUSDAddresses)
            
            console.log("Getting what loans are open in a batch")
            let batchOpenIds = await sAssetsOracle.batchOpenLoanIDsByAccount(uniquesUSDAddresses, addresses.sUSD_loansAddress, sUSDLoanIDs.length)
            
            console.log("Making sense of batch open loans return data")
            let sUSDCurrentAddresses, sUSDCurrentLoanIds
            [sUSDCurrentAddresses, sUSDCurrentLoanIds] = parseBatchOpenIDReturnData(batchOpenIds)

            console.log("Getting data on loans in a batch")
            let batchLoanData = await sAssetsOracle.batchGetLoanInformation(sUSDCurrentAddresses, sUSDCurrentLoanIds, addresses.sUSD_loansAddress)
            
            console.log("Put all the data in one JSON object to make it easier to interact with")
            let loanDataComposed = composeData(sUSDCurrentAddresses, sUSDCurrentLoanIds, batchLoanData[1], batchLoanData[0])
            
            console.log("Sort by the loans that are best to liquidate first")
            let sortedLoanData = sortData(loanDataComposed)
            
            console.log("Get the optimal strategy for liquidating loans")
            let optimalLiquidationOutput = getOptimalLiquidationsSorted(sortedLoanData, ethereumPrice)
            
            console.log("Optimal strategy:", optimalLiquidationOutput)
            fs.writeFileSync('../data/sUSD-loanIDs.json', JSON.stringify(sUSDCurrentLoanIds))
            fs.writeFileSync('../data/sUSD-addresses.json', JSON.stringify(sUSDCurrentAddresses))
            fs.writeFileSync('../data/sUSD-optimalConfig.json', JSON.stringify(optimalLiquidationOutput))
            
            let newSortedLoanData = sortedLoanData.slice(optimalLiquidationOutput.numberToLiquidate + 1)
            // console.log(newSortedLoanData)
            
            let secondOptimalLiquidationOutput = getOptimalLiquidationsSorted(newSortedLoanData, ethereumPrice)
            console.log("Optimal strategy 2:", secondOptimalLiquidationOutput)

            let thirdSortedLoanData = newSortedLoanData.slice(secondOptimalLiquidationOutput.numberToLiquidate + 1)

            let thirdOptimalLiquidationOutput = getOptimalLiquidationsSorted(thirdSortedLoanData, ethereumPrice)
            console.log("Optimal strategy 3:", thirdOptimalLiquidationOutput)

            fs.writeFileSync('../data/sUSD-optimalConfig2.json', JSON.stringify(secondOptimalLiquidationOutput))
            fs.writeFileSync('../data/sUSD-optimalConfig3.json', JSON.stringify(thirdOptimalLiquidationOutput))
            
            console.timeEnd()

            lock = false
        }

    })

}

function composeData(currentAddresses, currentLoanIds, collateralLiquidated, repaymentAmounts){
    let loanData = []

    for(let i = 0; i < currentAddresses.length; i++){
        let entry = {
            address: currentAddresses[i],
            loanID: currentLoanIds[i],
            collateralLiquidated: collateralLiquidated[i],
            repaymentAmounts: repaymentAmounts[i]
        }
        loanData[i] = entry
    }
    return loanData
}

function sortData(composeData){
    return composeData.sort(sortOrder("collateralLiquidated"))
}

function getOptimalLiquidationsSorted(sortedData, ethereumPrice){
    let topGasPrice = ethers.BigNumber.from(0)
    let topRepaymentAmount = ethers.BigNumber.from(0)
    let minerReward = ethers.BigNumber.from(0)
    let topUSDCNeeded = ethers.BigNumber.from(0)
    let topWETHNeeded = ethers.BigNumber.from(0)
    let topNumber = 0
    let topAddresses = []
    let topLoanIDs = []


    let totalGasUsed = ethers.BigNumber.from(constants.sUSDSwapsGasUsed)
    let totalMinerReward = ethers.BigNumber.from(0)
    let totalRepaymentAmount = ethers.BigNumber.from(0)
    let totalWETHNeeded = ethers.BigNumber.from(0)
    let totalUSDCNeeded = ethers.BigNumber.from(0)
    let totalProfit = ethers.BigNumber.from(0)

    for(let i = 0; i < sortedData.length; i++){
        // Get the gas used
        totalGasUsed = totalGasUsed.add(ethers.BigNumber.from(constants.marginalGasPerLoan))
        
        // Get the amount of sUSD needed to repay the loan
        totalRepaymentAmount = totalRepaymentAmount.add(sortedData[i].repaymentAmounts)
        
        // Using the sUSD amount back out to the amount of USDC needed
        let redenominateAmount = 10**12 // Needed to go from sUSD -> usdc or USDC -> WETH
        let usdcNeededToLiquidate = sortedData[i].repaymentAmounts.mul(1000).div(constants.usdcSUSDPrice).div(10**12)
        totalUSDCNeeded = totalUSDCNeeded.add(usdcNeededToLiquidate)

        // Using the USDC amount back out to the amount of WETH needed
        let wethNeededToLiquidate = usdcNeededToLiquidate.div(ethereumPrice).mul(redenominateAmount)
        totalWETHNeeded = totalWETHNeeded.add(wethNeededToLiquidate)
        
        // Given the amount of WETH needed to buy sUSD to repay the loan
        // AND the amount of ETH we'll get in return
        // Get the profit
        let profit = sortedData[i].collateralLiquidated.sub(wethNeededToLiquidate)
        totalProfit = totalProfit.add(profit)
        
        // Derive the miner reward using profit
        let newMinerReward = profit.mul(constants.minerRewardPercentage).div(100).mul(constants.discount).div(100)
        totalMinerReward = totalMinerReward.add(newMinerReward)
        
        // With miner reward and gas used find gas price
        let newGasPrice = totalMinerReward.div(totalGasUsed)
        
        // DEBUG
        // console.log("\nLoan number:", i)
        // console.log("Loan ID:", sortedData[i].loanID)
        // console.log("Additional collateral liquidated:", sortedData[i].collateralLiquidated.toString()/10**18)
        // console.log("Additional repayment needed:", sortedData[i].repaymentAmounts.toString()/10**18)
        // console.log("WETH needed to liquidate:", wethNeededToLiquidate.toString()/10**18)
        // console.log("Profit:", profit.toString()/10**18)

        // console.log("\nTotal miner reward:", totalMinerReward.toString()/10**18)
        // console.log("Total gas used:", totalGasUsed.toString())
        // console.log("Total repayment amount:", totalRepaymentAmount.toString()/10**18)
        // console.log("Total weth needed:", totalWETHNeeded.toString())
        // console.log("Total miner reward:", totalMinerReward.toString())
        // console.log("Total profit:", totalProfit.toString()/10**18)
        // console.log("New gas price:", newGasPrice/(10**9))
        
        // console.log("Top gas price:", topGasPrice.toString()/(10**9))
        if (newGasPrice.gt(topGasPrice)){
            // console.log("Gas price was higher, continuing!")
            // If the gas price of liquidating this loan was higher then update the top variables
            topGasPrice = newGasPrice
            topRepaymentAmount = totalRepaymentAmount
            topNumber = i
            topWETHNeeded = totalWETHNeeded
            topUSDCNeeded = totalUSDCNeeded
            topAddresses.push(sortedData[i].address)
            topLoanIDs.push(sortedData[i].loanID)
            minerReward = totalMinerReward
        } else {
            // If it was lower then break
            // console.log("Gas price was lower than top! Breaking!")
            break
        }
    }

    console.log("Weth needed:", topWETHNeeded.toString())
    console.log("Top gas price:", topGasPrice.toString())
    console.log("Top repayment amount:", topRepaymentAmount.toString())
    // An output for the stuff we need
    let output = {
        numberToLiquidate: topNumber,
        amountToRepay: topRepaymentAmount,
        wethNeeded: topWETHNeeded,
        usdcNeeded: topUSDCNeeded,
        minerReward: minerReward,
        addresses: topAddresses,
        loanIDs: topLoanIDs
    }

    return output
}

function getUniqueAddresses(addresses){
    let uniqueAddresses = []
  
    for (address in addresses){
        if(!uniqueAddresses.includes(addresses[address])){
            uniqueAddresses.push(addresses[address])
        }
    }
  
    return uniqueAddresses
}

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

function sortOrder(prop){
    return function(a, b) {    
        if (Number(a[prop]) < Number(b[prop])) {    
            return 1;    
        } else if (Number(a[prop]) > Number(b[prop])) {    
            return -1;    
        }    
        return 0;    
    }
}

main()