// Executor imports
const ethers = require('ethers')
const { FlashbotsBundleProvider} = require('@flashbots/ethers-provider-bundle')
const Executor = require('./executor')

const addresses = require('./utils/addresses')
const abis = require('./utils/abi/index')

// Blocknative imports
const BlocknativeSdk = require('bnc-sdk')
const WebSocket = require('ws')
const configuration = require('./utils/configuration.json')


module.exports = {
    
    async buildExecutorModule(privateKey, ethereumRPCURL){
        console.log("\nBuilding executor...")
        
        const ethersChainProvider = new ethers.providers.JsonRpcProvider(ethereumRPCURL)
        
        let wallet = new ethers.Wallet(privateKey)
        let signer = wallet.connect(ethersChainProvider)
        let nonce = await ethersChainProvider.getTransactionCount(wallet.address, 'latest')
        
        console.log(`Loaded wallet ${signer.address} as executor`)
        console.log(`Using ${wallet.address} for Flashbots reputation`)
        console.log("Starting nonce for executor:", nonce)
        
        const liquidatorContract = new ethers.Contract(addresses.sLiquidatorContract, abis.sLiquidator, signer)
        console.log("Loaded liquidation smart contract at address:", addresses.sLiquidatorContract)

        const flashbotsBundleProvider = await FlashbotsBundleProvider.create(ethersChainProvider, wallet)
        console.log("\nLoaded Flashbots bundle provider")

        const executor = new Executor(signer, nonce, liquidatorContract, flashbotsBundleProvider);
        return executor
    },

    async buildSDK(blocknativeAPIKey, Executor){
        console.log("\nBuilding Blocknative SDK...")

        let options = {
            dappId: blocknativeAPIKey,
            networkId: 1,
            system: 'ethereum',
            ws: WebSocket,
            transactionHandlers: [event => Executor.executeTransaction(event.transaction)],
        }
        
        const sdk = new BlocknativeSdk(options)
        
        const globalConfiguration = configuration.find(({ id }) => id === 'global')
        const addressConfigurations = configuration.filter(({ id }) => id !== 'global')
        
        globalConfiguration && await sdk.configuration({scope: 'global', filters: globalConfiguration.filters})

        addressConfigurations.forEach(({id, filters, abi}) => {
            const abiObj = abi ? { abi } : {}
            sdk.configuration({...abiObj, filters, scope: id, watchAddress: true})
        })

        console.log("Successfully built SDK")
        console.log("Listening for transactions")
        return sdk
    }
    
}