# sMEV
**Warning: this code will not make you money. But by studying it you might learn how to capture MEV.**

This repo contains a searcher developed to take advantage of a 1 off MEV opportunity created by the Synthetix team deprecating their ETH collateral trial program. As a result of this there were many loans that would be liquidatable after the governance proposal was executed. Taking advantage of this required a bot that could backrun the governance proposal execution transaction from the mempool as well as monitoring and execution infrastructure - all of which is contained here.

An accompanying blog post talking through the process of writing this bot and its strategy can be found [here](https://bertcmiller.com/2021/09/05/mev-synthetix.html). This is highly recommended to understand the thought process and design decisions behind this repo.

### Structure
The repo is structured as follows
- contracts: contains the oracle contract (`sAssetsOracle.sol`) used to improve data collection and the execution contract(`dYdXLiquidator.sol`) used to liquidate loans
- data: structured data from monitoring scripts, most importantly information on the optimal liquidation strategy
- execute: actual execution scripts, best to start with `index.js` here. Also contains the sETH and sUSD monitoring scripts.
- hardhat: my test environment. This is messy and I didn't clean my many files up. Note that you need to add your own rpc endpoint (Alchemy is good here) in `hardhat.config.js`.

To run index.js you must have an `.env` file with the right variables, but again, this code was for a 1 off opportunity and should be used exclusively for learning purposes.