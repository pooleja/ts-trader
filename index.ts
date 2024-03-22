import 'dotenv/config';
import { Token, CurrencyAmount, TradeType, Percent, ChainId, Currency} from '@uniswap/sdk-core'
import { ethers, BigNumber } from 'ethers';
import { getBalance } from './balances';
import { getMaxUSDC, getMaxWETH, getPricing } from './pricing';
import { WETH_ADDRESS, USDC_ADDRESS, SWAP_ROUTER_ADDRESS, DAYS_AVERAGE, MAX_USDC, WETH_MULTIPLIER, USDC_MULTIPLIER, QUOTER_CONTRACT_ADDRESS } from './config';
import { getPoolInfo } from './pool';
import { FeeAmount, Pool, Route, SwapOptions, SwapQuoter, SwapRouter, Trade } from '@uniswap/v3-sdk';


const MY_ADDRESS = process.env.MY_ADDRESS!;
const MY_PRIVATE_KEY = process.env.MY_PRIVATE_KEY!;
const web3Provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URI!)

const WETH = new Token(
  ChainId.ARBITRUM_ONE,
  WETH_ADDRESS,
  18,
  'WETH',
  'Wrapped Ether'
);

const USDC = new Token(
  ChainId.ARBITRUM_ONE,
  USDC_ADDRESS,
  6,
  'USDC',
  'USD//C'
);

async function getOutputQuote(route: Route<Currency, Currency>, inToken: Token, inAmount: CurrencyAmount<Token> ) {  

  if (!web3Provider) {
    throw new Error('Provider required to get pool state')
  }

  const { calldata } = await SwapQuoter.quoteCallParameters(
    route,
    inAmount,
    TradeType.EXACT_INPUT,
    {
      useQuoterV2: true,
    }
  )

  const quoteCallReturnData = await web3Provider.call({
    to: QUOTER_CONTRACT_ADDRESS,
    data: calldata,
  })

  return ethers.utils.defaultAbiCoder.decode(['uint256'], quoteCallReturnData)
}

async function swapTokens(inAmount: CurrencyAmount<Token>, inToken: Token, outToken: Token) {

  const poolInfo = await getPoolInfo(web3Provider, inToken, outToken)

  const pool = new Pool(
    inToken,
    outToken,
    FeeAmount.MEDIUM,
    poolInfo.sqrtPriceX96.toString(),
    poolInfo.liquidity.toString(),
    poolInfo.tick
  )

  const swapRoute = new Route(
    [pool],
    inToken,
    outToken
  )

  const amountOut = await getOutputQuote(swapRoute, inToken, inAmount)

  const uncheckedTrade = Trade.createUncheckedTrade({
    route: swapRoute,
    inputAmount: inAmount,
    outputAmount: CurrencyAmount.fromRawAmount(
      outToken,
      amountOut.toString()
    ),
    tradeType: TradeType.EXACT_INPUT,
  })


  const options: SwapOptions = {
    slippageTolerance: new Percent(50, 10_000), // 50 bips, or 0.50%
    deadline: Math.floor(Date.now() / 1000) + 60 * 20, // 20 minutes from the current Unix time
    recipient: MY_ADDRESS,
  }

  const methodParameters = SwapRouter.swapCallParameters([uncheckedTrade], options)

  const transaction = {
    data: methodParameters.calldata,
    to: SWAP_ROUTER_ADDRESS,
    value: methodParameters.value,
    from: MY_ADDRESS,
    // maxFeePerGas: MAX_FEE_PER_GAS,
    // maxPriorityFeePerGas: MAX_PRIORITY_FEE_PER_GAS,
  }


  const wallet = new ethers.Wallet(MY_PRIVATE_KEY, web3Provider);

  const tx = await wallet.sendTransaction(transaction);
  console.log(`Transaction hash: ${tx.hash}`);
}

async function main() {
  console.log("getting balances")
  // Get balances
  const wethBalance = await getBalance(MY_ADDRESS, WETH_ADDRESS, web3Provider);
  const usdcBalance = await getBalance(MY_ADDRESS, USDC_ADDRESS, web3Provider);
  console.log(`WETH Balance: ${wethBalance}`);
  console.log(`USDC Balance: ${usdcBalance}`);

  // Get pricing
  const pricing = await getPricing(DAYS_AVERAGE);
  console.log(`Latest price: ${pricing.latest}`);
  console.log(`Average price: ${pricing.average}`);

  if (wethBalance.gt(0)) {
    if (pricing.latest < pricing.average) {
      console.log('Price is below average and WETH balance is greater than 0, swap WETH for USDC');
      const MAX_WETH = MAX_USDC.mul(WETH_MULTIPLIER).div(Math.floor(pricing.latest)).div(USDC_MULTIPLIER)
      const amountToSwap = getMaxWETH(wethBalance, MAX_WETH);
      console.log('amountToSwap: ', amountToSwap.toString(), 'WETH Base Units');
      const wethAmount = CurrencyAmount.fromRawAmount(WETH, amountToSwap.toString());

      await swapTokens(wethAmount, WETH, USDC);
    } else {
      console.log('WETH price is higher than the average, do nothing');
    }
  }

  if (usdcBalance.gt(0)) {
    if (pricing.latest > pricing.average) {
      console.log('Price is above average and USDC balance is greater than 0, swap USDC for WETH');
      const amountToSwap = getMaxUSDC(usdcBalance, MAX_USDC);
      console.log('amountToSwap: ', amountToSwap.toString(), 'USDC Base Units');
      const usdcAmount = CurrencyAmount.fromRawAmount(USDC, amountToSwap.toString());
      await swapTokens(usdcAmount, USDC, WETH);

    } else {
      console.log('USDC price is lower than the average, do nothing');
    }
  }
}

main();