// Imports
const ethers = require('ethers')
const Web3EthAbi = require('web3-eth-abi')
var _ = require('lodash');

class Executor {
    constructor(signer, nonce, sUSDLiquidator, flashBotsBundleProvider) {
        this.signer = signer
        this.nonce = nonce
        this.sUSDLiquidator = sUSDLiquidator
        this.flashBotsBundleProvider = flashBotsBundleProvider
        console.log('Successfully created executor')
    }

    async executeTransaction(transaction){
        console.log("\nReceived transaction:", transaction)
        let currentBlockNumber = transaction.pendingBlockNumber
        
        console.log("Getting signed governance transaction")
        let signedGovernanceTransaction = await this.getSignedTransaction(transaction)
        
        console.log("Getting bundles")
        let sUSDBundleOne, sUSDBundleTwo, sUSDBundleThree
        [sUSDBundleOne, sUSDBundleTwo, sUSDBundleThree] = await this.buildSUSDBundles(signedGovernanceTransaction)
        
        console.log("Submitting bundles!")

        // Use Promise.all to send all bundles at the same time instead of sequentially
        const bundlePromises = _.map([currentBlockNumber + 1, currentBlockNumber + 2, currentBlockNumber + 3], targetBlockNumber =>
            this.sendThroughRelays(sUSDBundleOne, sUSDBundleTwo, sUSDBundleThree, targetBlockNumber)
        )

        await Promise.all(bundlePromises)
    }

    async getSignedTransaction(transaction){
        console.log("Getting signed transaction from raw transaction object")
        let transactionObject = {
            to: transaction.to,
            nonce: transaction.nonce,
            gasLimit: ethers.BigNumber.from(transaction.gas),
            gasPrice: ethers.BigNumber.from(transaction.gasPrice),
            data: transaction.input,
            value: ethers.BigNumber.from(transaction.value),
            chainId: 1
        }

        let signature = {
            v: parseInt(transaction.v),
            r: transaction.r,
            s: (transaction.s)
        }

        let signedTransaction = ethers.utils.serializeTransaction(transactionObject, signature)
        
        return signedTransaction
    }

    getSUSDFlashloanParameters(bundleConfig){
        console.log("Generating abi encoded params for Flashloans")
        
        const types = [
            'address[]',
            'uint256[]',
            'uint256',
            'uint256',
            'uint256'
        ]
        
        const values = [
            bundleConfig.addresses,
            bundleConfig.loanIDs,
            (ethers.BigNumber.from(bundleConfig.wethNeeded).mul(10)).toString(),
            ethers.BigNumber.from(bundleConfig.usdcNeeded).toString(),
            ethers.BigNumber.from(bundleConfig.minerReward).toString()   
        ]

        let params = Web3EthAbi.encodeParameters(types, values)

        return params
    }

    async buildSUSDBundles(signedTransaction){
        // Transaction options
        let bundleOneTransactionOptions = {
            gasPrice: ethers.BigNumber.from(0),
            gasLimit: ethers.BigNumber.from(1000000),
            nonce: this.nonce
        }

        let bundleTwoTransactionOptions = {
            gasPrice: ethers.BigNumber.from(0),
            gasLimit: ethers.BigNumber.from(1000000),
            nonce: this.nonce + 1
        }

        let bundleThreeTransactionOptions = {
            gasPrice: ethers.BigNumber.from(0),
            gasLimit: ethers.BigNumber.from(1000000),
            nonce: this.nonce + 2
        } 

        // Data
        let sUSDBundleOneConfig = require('../data/sUSD-optimalConfig.json')
        let sUSDBundleTwoConfig = require('../data/sUSD-optimalConfig2.json')
        let sUSDBundleThreeConfig = require('../data/sUSD-optimalConfig3.json')
        
        // Parameters for bundles
        let bundleOneParams = this.getSUSDFlashloanParameters(sUSDBundleOneConfig)
        let bundleTwoParams = this.getSUSDFlashloanParameters(sUSDBundleTwoConfig)
        let bundleThreeParams = this.getSUSDFlashloanParameters(sUSDBundleThreeConfig)
        
        // Actual bundles
        let bundleOneLiquidation = await this.sUSDLiquidator.populateTransaction.flashloan_4247(
            ethers.BigNumber.from(sUSDBundleOneConfig.wethNeeded).mul(10).toString(),
            bundleOneParams,
            0,
            bundleOneTransactionOptions
        )

        let bundleOne = [
            {
                signedTransaction: signedTransaction
            },
            {
                signer: this.signer,
                transaction: bundleOneLiquidation
            }
        ]

        let bundleTwoLiquidation = await this.sUSDLiquidator.populateTransaction.flashloan_4247(
            ethers.BigNumber.from(sUSDBundleTwoConfig.wethNeeded).mul(10).toString(),
            bundleTwoParams,
            1,
            bundleTwoTransactionOptions
        )

        let bundleTwo = [
            {
                signer: this.signer,
                transaction: bundleTwoLiquidation  
            }
        ]

        let bundleThreeLiquidation = await this.sUSDLiquidator.populateTransaction.flashloan_4247(
            ethers.BigNumber.from(sUSDBundleThreeConfig.wethNeeded).mul(10).toString(),
            bundleThreeParams,
            1,
            bundleThreeTransactionOptions
        )

        let bundleThree = [
            {
                signer: this.signer,
                transaction: bundleThreeLiquidation  
            }
        ]

        // Sign bundles
        let signedBundleOne = await this.flashBotsBundleProvider.signBundle(bundleOne)
        let signedBundleTwo = await this.flashBotsBundleProvider.signBundle(bundleTwo)
        let signedBundleThree = await this.flashBotsBundleProvider.signBundle(bundleThree)
        
        return [signedBundleOne, signedBundleTwo, signedBundleThree]
    }

    async sendThroughRelays(sUSDBundleOne, sUSDBundleTwo, sUSDBundleThree, targetBlockNumber){
        let receiptFlashbots = this.flashBotsBundleProvider.sendRawBundle(sUSDBundleOne, targetBlockNumber).catch(error => console.log(error))
        let receiptFlashbots2 = this.flashBotsBundleProvider.sendRawBundle(sUSDBundleTwo, targetBlockNumber).catch(error => console.log(error))
        let receiptFlashbots3 = this.flashBotsBundleProvider.sendRawBundle(sUSDBundleThree, targetBlockNumber).catch(error => console.log(error))
                               
        return [receiptFlashbots, receiptFlashbots2, receiptFlashbots3]
    }


}
module.exports = Executor