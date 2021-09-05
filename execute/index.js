const { buildSDK, buildExecutorModule } = require("./builder")
require('dotenv').config()

// Private key
let privateKey = process.env.privateKey

// Blocknative api-key
let blocknativeAPIKey = process.env.blocknativeAPIKey

// Ethereum RPC URL
let ethereumRPCUrl = process.env.nodeHttpUrl


async function main(){
    let Executor = await buildExecutorModule(privateKey, ethereumRPCUrl)
    let blocknativeSDK = buildSDK(blocknativeAPIKey, Executor)
}

main()