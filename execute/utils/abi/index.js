const chi = require('./chi.json')
const collateralValueFull = require('./collateralValue.json')
const collateralValue = collateralValueFull.abi
const sCollateralContracts = require('./sETH.json')
const sAssetsOracleFull = require('./sAssetsOracle.json')
const sAssetsOracle = sAssetsOracleFull.abi
const liquidatorFull = require('./dYdXLiquidator.json')
const sLiquidator = liquidatorFull.abi

module.exports = {
    chi,
    collateralValue,
    sCollateralContracts,
    sAssetsOracle,
    sLiquidator
}