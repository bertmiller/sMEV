//SPDX-License-Identifier: UNLICENSED
pragma solidity 0.6.12;

pragma experimental ABIEncoderV2;

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

contract sLiquidator {
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

    function execute_49668(address[] calldata sUSDAddresses, uint256[] calldata sUSDLoanIDs, uint256 wethEstimate, uint256 usdcEstimate, uint256 ethToCoinbase) external {
        require(msg.sender == executor);

        uint256 gasStart = gasleft();
        
        uniswapRouter.exactOutputSingle(
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

        curvePoolSUSD.exchange_underlying(
            1, // usdc
            3, // sUSD
            IERC20(usdcTokenAddress).balanceOf(address(this)), 
            1); // min sUSD
            
        for (uint256 i = 0; i < sUSDAddresses.length; i++) {
            sUSDLoansAddress.liquidateUnclosedLoan(sUSDAddresses[i], sUSDLoanIDs[i]);
        }
        
        block.coinbase.transfer(ethToCoinbase);

        uint256 gasSpent = 21000 + gasStart - gasleft() + (16 * msg.data.length);
        CHI.freeUpTo((gasSpent + 14154) / 41947);
    }

    function followUp_119827(address[] calldata sUSDAddresses, uint256[] calldata sUSDLoanIDs, uint256 wethEstimate, uint256 usdcEstimate, uint256 ethToCoinbase, uint256 ethStartingBalance) external {
        require(msg.sender == executor);
        uint256 gasStart = gasleft();
        
        if (address(this).balance <= ethStartingBalance){
            for (uint256 i = 0; i < 11; i++){
                block.coinbase.transfer(10000000000000000);
            }
        } else {
            WETH.deposit{value: wethEstimate}();
            
            uniswapRouter.exactOutputSingle(
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

            curvePoolSUSD.exchange_underlying(
                1, // usdc
                3, // sUSD
                IERC20(usdcTokenAddress).balanceOf(address(this)), 
                1); // min sUSD
                            
            for (uint256 i = 0; i < sUSDAddresses.length; i++) {
                sUSDLoansAddress.liquidateUnclosedLoan(sUSDAddresses[i], sUSDLoanIDs[i]);
            }
            
            block.coinbase.transfer(ethToCoinbase);

            uint256 gasSpent = 21000 + gasStart - gasleft() + (16 * msg.data.length);
            CHI.freeUpTo((gasSpent + 14154) / 41947);
        }
    }

    constructor(address _executor) public payable {
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

    function wethWithdraw(uint256 _amount) external {
        require(msg.sender == owner);
        require(_amount != 0);
        WETH.transfer(owner, _amount);
    }

    function ethWithdraw(uint256 _amount) external {
        require(msg.sender == owner);
        require(_amount != 0);
        msg.sender.transfer(_amount);
    }

    function call(address payable _to, uint256 _value, bytes calldata _data) external payable returns (bytes memory) {
        require(msg.sender == owner);
        require(_to != address(0));
        (bool _success, bytes memory _result) = _to.call{value: _value}(_data);
        require(_success);
        return _result;
    }
}