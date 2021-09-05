//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

import "hardhat/console.sol";


// Standard ERC-20 interface
interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}

// Additional methods available for WETH
interface IWETH is IERC20 {
    function deposit() external payable;
    function withdraw(uint wad) external;
}

// The only chi method we need
interface ICHI {
    function freeFromUpTo(address _addr, uint _amount) external returns (uint);
    function freeUpTo(uint _amount) external returns (uint);
}

// Only Synethix loan methods we need
interface sLoanContract {
    function liquidateUnclosedLoan(address _loanCreatorsAddress, uint256 _loanID) external;
}

library ISwapRouter {
    struct ExactOutputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountOut;
        uint256 amountInMaximum;
        uint160 sqrtPriceLimitX96;
    }
}

interface IUniswapV3Router {
    function exactOutputSingle(ISwapRouter.ExactOutputSingleParams memory params) external returns (uint256 amountIn);
}

interface ICurve {
    function exchange_underlying(
        int128 i,
        int128 j,
        uint256 dx,
        uint256 min_dy
    ) external;
}

contract sLiquidatorCL {
    address private immutable owner;
    address private immutable executor;
    
    IWETH private constant WETH = IWETH(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2);
    ICHI  constant private CHI = ICHI(0x0000000000004946c0e9F43F4Dee607b0eF1fA1c);
    
    sLoanContract sUSDLoansAddress = sLoanContract(0xfED77055B40d63DCf17ab250FFD6948FBFF57B82);
    sLoanContract sETHLoansAddress = sLoanContract(0x7133afF303539b0A4F60Ab9bd9656598BF49E272);
    
    IUniswapV3Router private uniswapRouter = IUniswapV3Router(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    ICurve curvePoolSUSD = ICurve(0xA5407eAE9Ba41422680e2e00537571bcC53efBfD);
    
    address usdcTokenAddress = address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48);
    address sETHTokenAddress = address(0x5e74C9036fb86BD7eCdcb084a0673EFc32eA31cb);
    address sUSDTokenAddress = address(0x57Ab1ec28D129707052df4dF418D58a2D46d5f51);

    modifier useCHI {
        uint256 gasStart = gasleft();
        _;
        uint256 gasSpent = 21000 + gasStart - gasleft() + (16 * msg.data.length);
        CHI.freeFromUpTo(owner, (gasSpent + 14154) / 41947);
    }

    function execute_49668(address[] calldata sUSDAddresses, uint256[] calldata sUSDLoanIDs, uint256 wethEstimate, uint256 usdcEstimate, uint256 ethToCoinbase) external {
        require(msg.sender == executor);

        uint256 gasStart = gasleft();
        uint ethStart = WETH.balanceOf(address(this));

        // console.log("WETH Balance:", WETH.balanceOf(address(this)));
        uint amountIn = uniswapRouter.exactOutputSingle(
            ISwapRouter.ExactOutputSingleParams(
                address(WETH),        // address tokenIn;
                usdcTokenAddress,     // address tokenOut;
                3000,                 // uint24 fee;
                address(this),        // address recipient;
                10**18,               // uint256 deadline;
                usdcEstimate,         // uint256 amountOut;
                wethEstimate,         // uint256 amountInMaximum;
                0                     // uint160 sqrtPriceLimitX96;
            )
        );

        // uint usdcBalance = IERC20(usdcTokenAddress).balanceOf(address(this));
        
        // console.log("\nUniswap swap done!");
        // console.log("Received this amount of USDC:", usdcBalance);
        // console.log("Swapped with this amount of ETH:", amountIn);
        
        curvePoolSUSD.exchange_underlying(
            1, // usdc
            3, // sUSD
            IERC20(usdcTokenAddress).balanceOf(address(this)), 
            1); // min sUSD
        
        console.log("\nCurve swap done");

        // uint sUSDBalanceAfterCurveSwap = IERC20(sUSDTokenAddress).balanceOf(address(this));
        // console.log("sUSD balance after Curve swap:", sUSDBalanceAfterCurveSwap);
            
        for (uint256 i = 0; i < sUSDAddresses.length; i++) {
            console.log("\nLoan number:", i);
            console.log("Address:", sUSDAddresses[i]);
            console.log("Loan IDs:",sUSDLoanIDs[i]);

            uint sUSDBalancePre = IERC20(sUSDTokenAddress).balanceOf(address(this));
            uint ETHPreBurn = address(this).balance;
            
            sUSDLoansAddress.liquidateUnclosedLoan(sUSDAddresses[i], sUSDLoanIDs[i]);
            
            uint sUSDBalancePost = IERC20(sUSDTokenAddress).balanceOf(address(this));
            uint ETHPostBurn = address(this).balance;
            uint ETHDifference = ETHPostBurn - ETHPreBurn;
            console.log("ETH pre-burn  :", ETHPreBurn);
            console.log("ETH post burn :", address(this).balance);
            console.log("ETH difference:", ETHDifference);
            
            uint difference = sUSDBalancePre - sUSDBalancePost;
            console.log("sUSD pre-burn  :", sUSDBalancePre);
            console.log("sUSD post burn :", sUSDBalancePost);
            console.log("sUSD difference:", difference);
        }
        // WETH.deposit{value: address(this).balance - ethToCoinbase}();
        block.coinbase.transfer(ethToCoinbase);

        uint ethEnd = address(this).balance;
        console.log("\nWETH at end:  ", ethEnd);
        console.log("WETH at start:", ethStart);

        uint wethProfit = ethEnd - ethStart;
        console.log("WETH Profit:", wethProfit/(10**18));

        uint sUSDBalancePost = IERC20(sUSDTokenAddress).balanceOf(address(this));
        console.log("sUSD at end:", sUSDBalancePost/(10**18));
        uint256 gasSpent = 21000 + gasStart - gasleft() + (16 * msg.data.length);
        CHI.freeUpTo((gasSpent + 14154) / 41947);
    }

    function followUp_119827(address[] calldata sUSDAddresses, uint256[] calldata sUSDLoanIDs, uint256 wethEstimate, uint256 usdcEstimate, uint256 ethToCoinbase, uint256 ethStartingBalance) external useCHI {
        require(msg.sender == executor);
        uint256 gasStart = gasleft();
        
        if (address(this).balance <= ethStartingBalance){
            block.coinbase.transfer(1);
        } else {
            uint ethStart = WETH.balanceOf(address(this)) + address(this).balance;
            WETH.deposit{value: wethEstimate}();
            // console.log("WETH Balance:", WETH.balanceOf(address(this)));
            uint amountIn = uniswapRouter.exactOutputSingle(
                ISwapRouter.ExactOutputSingleParams(
                    address(WETH),        // address tokenIn;
                    usdcTokenAddress,     // address tokenOut;
                    3000,                 // uint24 fee;
                    address(this),        // address recipient;
                    10**18,               // uint256 deadline;
                    usdcEstimate,         // uint256 amountOut;
                    wethEstimate,         // uint256 amountInMaximum;
                    0                     // uint160 sqrtPriceLimitX96;
                )
            );

            // uint usdcBalance = IERC20(usdcTokenAddress).balanceOf(address(this));
            
            // console.log("\nUniswap swap done!");
            // console.log("Received this amount of USDC:", usdcBalance);
            // console.log("Swapped with this amount of ETH:", amountIn);
            
            curvePoolSUSD.exchange_underlying(
                1, // usdc
                3, // sUSD
                IERC20(usdcTokenAddress).balanceOf(address(this)), 
                1); // min sUSD
            
            console.log("\nCurve swap done");

            uint sUSDBalanceAfterCurveSwap = IERC20(sUSDTokenAddress).balanceOf(address(this));
            console.log("sUSD balance after Curve swap:", sUSDBalanceAfterCurveSwap);
                
            for (uint256 i = 0; i < sUSDAddresses.length; i++) {
                // console.log("\nLoan number:", i);
                // console.log("Address:", sUSDAddresses[i]);
                // console.log("Loan IDs:",sUSDLoanIDs[i]);

                // uint sUSDBalancePre = IERC20(sUSDTokenAddress).balanceOf(address(this));
                // uint ETHPreBurn = address(this).balance;
                
                sUSDLoansAddress.liquidateUnclosedLoan(sUSDAddresses[i], sUSDLoanIDs[i]);
                
                // uint sUSDBalancePost = IERC20(sUSDTokenAddress).balanceOf(address(this));
                // uint ETHPostBurn = address(this).balance;
                // uint ETHDifference = ETHPostBurn - ETHPreBurn;
                // console.log("ETH pre-burn  :", ETHPreBurn);
                // console.log("ETH post burn :", address(this).balance);
                // console.log("ETH difference:", ETHDifference);
                
                // uint difference = sUSDBalancePre - sUSDBalancePost;
                // console.log("sUSD pre-burn  :", sUSDBalancePre);
                // console.log("sUSD post burn :", sUSDBalancePost);
                // console.log("sUSD difference:", difference);
            }
            // WETH.deposit{value: address(this).balance - ethToCoinbase}();
            block.coinbase.transfer(ethToCoinbase);

            uint ethEnd = address(this).balance + WETH.balanceOf(address(this)) + ethToCoinbase;
            console.log("\nWETH at end:  ", ethEnd);
            console.log("WETH at start:", ethStart);

            uint wethProfit = ethEnd - ethStart;
            console.log("WETH Profit:", wethProfit/(10**18));

            uint sUSDBalancePost = IERC20(sUSDTokenAddress).balanceOf(address(this));
            console.log("sUSD at end:", sUSDBalancePost/(10**18));
            
            uint256 gasSpent = 21000 + gasStart - gasleft() + (16 * msg.data.length);
            CHI.freeUpTo((gasSpent + 14154) / 41947);
        }
    }

    constructor(address _executor) public payable {
        // Give infinite approval to dydx to withdraw WETH on contract deployment,
        // so we don't have to approve the loan repayment amount (+2 wei) on each call.
        // The approval is used by the dydx contract to pay the loan back to itself.
        WETH.approve(address(uniswapRouter), uint(-1));
        IERC20(sUSDTokenAddress).approve(address(sUSDLoansAddress), uint(-1));
        IERC20(usdcTokenAddress).approve(address(curvePoolSUSD), uint(-1));
        
        owner = msg.sender;
        executor = _executor;
        if (msg.value > 0) {
            WETH.deposit{value: msg.value}();
        }
    }

    receive() external payable {
    }

    function withdraw(uint256 _amount) external {
        require(msg.sender == owner);
        require(_amount != 0);
        WETH.transfer(owner, _amount);
    }

    function call(address payable _to, uint256 _value, bytes calldata _data) external payable returns (bytes memory) {
        require(msg.sender == owner);
        require(_to != address(0));
        (bool _success, bytes memory _result) = _to.call{value: _value}(_data);
        require(_success);
        return _result;
    }
}