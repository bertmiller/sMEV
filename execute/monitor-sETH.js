const ethers = require('ethers')
const fs = require('fs')
const addresses = require('./utils/addresses')
const abis = require('./utils/abi')
const constants = require('./utils/constants')
require('dotenv').config()

let nodeHttpUrl = process.env.nodeHttpUrl
let nodeWsURl   = process.env.nodeWsURl

const ethersHTTPChainprovider = new ethers.providers.JsonRpcProvider(nodeHttpUrl)
const ethersWSChainProvider = new ethers.providers.WebSocketProvider(nodeWsURl)

let sAssetsOracle = new ethers.Contract(addresses.sAssetsOracle, abis.sAssetsOracle,  ethersHTTPChainprovider)

async function main(){
    let lock = false
    ethersWSChainProvider.on("block", async (blockNumber) => {
        const sETHAddresses = require('../data/sETH-addresses.json')
        const SETHLoanIDs = require('../data/sETH-loanIDs.json')

        console.log("Block number:", blockNumber)

        if (lock == false){
            lock = true

            console.time()
            console.log("Getting unique addresses")
            let uniqueSETHAddress = getUniqueAddresses(sETHAddresses)

            console.log("Getting what loans are open in a batch")
            let batchOpenIds = await sAssetsOracle.batchOpenLoanIDsByAccount(uniqueSETHAddress, addresses.sETH_loansAddress, SETHLoanIDs.length)
            
            let sETHCurrentAddresses, sETHCurrentLoanIds
            [sETHCurrentAddresses, sETHCurrentLoanIds] = parseBatchOpenIDReturnData(batchOpenIds)

            console.log(sETHCurrentAddresses)
            console.log(sETHCurrentLoanIds)
            
            console.log("Getting data on loans in a batch")
            let batchLoanData = await sAssetsOracle.batchGetLoanInformationSETH(sETHCurrentAddresses, sETHCurrentLoanIds, addresses.sETH_loansAddress)
            
            console.log("Put all the data in one JSON object to make it easier to interact with")
            let loanDataComposed = composeData(sETHCurrentAddresses, sETHCurrentLoanIds, batchLoanData[1], batchLoanData[0])
            
            console.log("Sort by the loans that are best to liquidate first")
            let sortedLoanData = sortData(loanDataComposed)
            console.log("Get the optimal strategy for liquidating loans")
            let optimalLiquidationOutput = getOptimalLiquidationsSorted(sortedLoanData)
            
            console.log("Optimal strategy:", optimalLiquidationOutput)
            
            let newSortedLoanData = sortedLoanData.slice(optimalLiquidationOutput.numberToLiquidate + 1)
            
            let secondOptimalLiquidationOutput = getOptimalLiquidationsSorted(newSortedLoanData)
            console.log("Optimal strategy 2:", secondOptimalLiquidationOutput)

            let thirdSortedLoanData = newSortedLoanData.slice(secondOptimalLiquidationOutput.numberToLiquidate + 1)

            let thirdOptimalLiquidationOutput = getOptimalLiquidationsSorted(thirdSortedLoanData)
            console.log("Optimal strategy 3:", thirdOptimalLiquidationOutput)

            fs.writeFileSync('../data/sETH-loanIDs.json', JSON.stringify(sETHCurrentLoanIds))
            fs.writeFileSync('../data/sETH-addresses.json', JSON.stringify(sETHCurrentAddresses))
            
            lock = false
        }
    })

}


function getOptimalLiquidationsSorted(sortedData){
    let topGasPrice = ethers.BigNumber.from(0)
    let topRepaymentAmount = ethers.BigNumber.from(0)
    let minerReward = ethers.BigNumber.from(0)
    let topWETHNeeded = ethers.BigNumber.from(0)
    let topNumber = 0
    let topAddresses = []
    let topLoanIDs = []

    // Fix gas used ?
    let totalGasUsed = ethers.BigNumber.from(constants.sUSDSwapsGasUsed)
    let totalMinerReward = ethers.BigNumber.from(0)
    let totalRepaymentAmount = ethers.BigNumber.from(0)
    let totalWETHNeeded = ethers.BigNumber.from(0)
    let totalProfit = ethers.BigNumber.from(0)

    for(let i = 0; i < sortedData.length; i++){
        // Get the gas used
        totalGasUsed = totalGasUsed.add(ethers.BigNumber.from(constants.marginalGasPerLoan))
        
        // Get the amount of sUSD needed to repay the loan
        totalRepaymentAmount = totalRepaymentAmount.add(sortedData[i].repaymentAmounts)
        
        let wethNeededToLiquidate = sortedData[i].repaymentAmounts.mul(1015).div(1000)

        // Using the USDC amount back out to the amount of WETH needed
        // let wethNeededToLiquidate = usdcNeededToLiquidate.div(2150).mul(redenominateAmount)
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
        console.log("Profit:", profit.toString()/10**18)

        // console.log("\nTotal miner reward:", totalMinerReward.toString()/10**18)
        // console.log("Total gas used:", totalGasUsed.toString())
        // console.log("Total repayment amount:", totalRepaymentAmount.toString()/10**18)
        // console.log("Total weth needed:", totalWETHNeeded.toString())
        // console.log("Total miner reward:", totalMinerReward.toString())
        console.log("Total profit:", totalProfit.toString()/10**18)
        console.log("New gas price:", newGasPrice/(10**9))
        
        console.log("Top gas price:", topGasPrice.toString()/(10**9))
        if (newGasPrice.gt(topGasPrice)){
            // console.log("Gas price was higher, continuing!")
            // If the gas price of liquidating this loan was higher then update the top variables
            topGasPrice = newGasPrice
            topRepaymentAmount = totalRepaymentAmount
            topNumber = i
            topWETHNeeded = totalWETHNeeded
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

    // An output for the stuff we need
    let output = {
        numberToLiquidate: topNumber,
        amountToRepay: topRepaymentAmount,
        wethNeeded: topWETHNeeded,
        minerReward: minerReward,
        addresses: topAddresses,
        loanIDs: topLoanIDs
    }

    return output
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

async function createAccountsAndLoanIDsDataRerun(address, data, fileNameForSaving){
    const sETHContract = new ethers.Contract(address, abis.sCollateralContracts, ethersHTTPChainprovider)
    let loansByAccount = {}

    console.log(data)

    for(address in data){
        let loanInformation = await sETHContract.openLoanIDsByAccount(address)
        
        console.log(address)
        let entry = []
        if (loanInformation.toString() >= 1 || loanInformation.toString().length >= 2){
            if (loanInformation.length >= 2){
                
                for(let loanIndex = 0; loanIndex < loanInformation.length; loanIndex++){
                    entry[loanIndex] = loanInformation[loanIndex].toString()
                }
            } else {
                entry = loanInformation.toString()
            }
            console.log("\nAccount:", address)
            console.log('loanID:', entry)

            loansByAccount[address] = entry
        }
    }
    console.log(loansByAccount)
    return loansByAccount
}


async function createAccountsAndLoanIDsData(address, data, fileNameForSaving){
    console.log("Generating:", fileNameForSaving)
    const sETHContract = new ethers.Contract(address, abis.sCollateralContracts, ethersHTTPChainprovider)
    let loansByAccount = {}

    for (let index = 0; index < data.length; index++){
        let loanInformation = await sETHContract.openLoanIDsByAccount(data[index])
        
        let entry = []
        if (loanInformation.toString() >= 1 || loanInformation.toString().length >= 2){
            if (loanInformation.length >= 2){
                
                for(let loanIndex = 0; loanIndex < loanInformation.length; loanIndex++){
                    entry[loanIndex] = loanInformation[loanIndex].toString()
                }
            } else {
                entry = loanInformation.toString()
            }
            console.log("\nAccount:", data[index])
            console.log('loanID:', entry)

            loansByAccount[data[index]] = entry
        }
    }

    console.log(loansByAccount)
    
    fs.writeFileSync(`../data/${fileNameForSaving}.json`, JSON.stringify(loansByAccount))
    return loansByAccount
}

async function createAccountsAndLoanInformationData(address, data, fileNameForSaving){
    console.log("Generating:", fileNameForSaving)

    const sContract = new ethers.Contract(address, abis.sCollateralContracts, ethersHTTPChainprovider)
    const loans = []
    let loansNum = 0
    for (entry in data){
        let loanData

        if (Array.isArray(data[entry])){
            for (arrayEntry in data[entry]){
                loanData = await getLoanInformation(entry, data[entry][arrayEntry], sContract)
                loans[loansNum] = loanData
                loansNum++
                console.log(loanData)
            }
        } else {
            loanData = await getLoanInformation(entry, data[entry], sContract)
            loans[loansNum] = loanData
            loansNum++
            console.log(loanData)
        }
    }

    console.log(loans)
    
    fs.writeFileSync(`../data/${fileNameForSaving}.json`, JSON.stringify(loans))
    return loans
}

async function getLoanInformation(address, loanID, contract){
    let loanDataRaw = await contract.getLoan(address, loanID)

    let repayAmount = ((loanDataRaw[2]) + (loanDataRaw[6])).toString()
    let sUSDBytes = ethers.utils.formatBytes32String("sUSD")
    let ethBytes = ethers.utils.formatBytes32String("ETH")
    
    let totalCollateralLiquidated = await exchangeRatesOracle.getCollateralAmountSUSD(sUSDBytes, loanDataRaw[2].toString(), ethBytes)
    
    let loanData = {
        'address' : address,
        'loanID' : loanID,
        'collateralAmount' : loanDataRaw[1].toString(),
        'loanAmount' : loanDataRaw[2].toString(),
        'timeCreated': loanDataRaw[3].toString(),
        'accruedInterest': loanDataRaw[6].toString(),
        'totalCollateralLiquidated': totalCollateralLiquidated.toString()
    }
    
    return loanData
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