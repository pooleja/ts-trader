import 'dotenv/config';
import { AlphaRouter, ChainId, SwapType } from '@uniswap/smart-order-router'
import { Token, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core'
import { BigNumber, ethers } from 'ethers';
import { getBalance } from './balances';
import { getMaxUSDC, getMaxWETH, getPricing } from './pricing';

const V3_SWAP_ROUTER_ADDRESS = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45';
const MY_ADDRESS = process.env.MY_ADDRESS!;
const MY_PRIVATE_KEY = process.env.MY_PRIVATE_KEY!;
const web3Provider = new ethers.providers.JsonRpcProvider(process.env.PROVIDER_URI!)

const WETH_ADDRESS = '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619';
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const DAYS_AVERAGE = 20;

const MAX_TRADE_USD = 25000;

const USDC_DECIMALS = 6;
const USDC_MULTIPLIER = BigNumber.from(10).pow(USDC_DECIMALS);
const MAX_USDC = BigNumber.from(MAX_TRADE_USD).mul(USDC_MULTIPLIER);

const WETH_MULTIPLIER = BigNumber.from(10).pow(18);

const router = new AlphaRouter({ chainId: ChainId.POLYGON, provider: web3Provider });

const WETH = new Token(
  ChainId.POLYGON,
  WETH_ADDRESS,
  18,
  'WETH',
  'Wrapped Ether'
);

const USDC = new Token(
  ChainId.POLYGON,
  USDC_ADDRESS,
  6,
  'USDC',
  'USD//C'
);

async function swapTokens(inAmount: CurrencyAmount<Token>, outToken: Token) {

  const route = await router.route(
    inAmount,
    outToken,
    TradeType.EXACT_INPUT,
    {
      type: SwapType.SWAP_ROUTER_02,
      recipient: MY_ADDRESS,
      slippageTolerance: new Percent(5, 100),
      deadline: Math.floor(Date.now() / 1000 + 1800)
    }
  );

  if (route === null) {
    console.log('No route found');
    process.exit(1);
  }

  if (route.methodParameters === undefined) {
    console.log('No method parameters found');
    process.exit(1);
  }

  console.log(`Quote Exact In: ${route.quote.toFixed(outToken.decimals)}`);
  console.log(`Gas Adjusted Quote In: ${route.quoteGasAdjusted.toFixed(outToken.decimals)}`);
  console.log(`Gas Used USD: ${route.estimatedGasUsedUSD.toFixed(2)}`);


  const transaction = {
    data: route.methodParameters.calldata,
    to: V3_SWAP_ROUTER_ADDRESS,
    value: BigNumber.from(route.methodParameters.value),
    from: MY_ADDRESS,
    gasPrice: BigNumber.from(route.gasPriceWei),
  };

  const wallet = new ethers.Wallet(MY_PRIVATE_KEY, web3Provider);

  const tx = await wallet.sendTransaction(transaction);
  console.log(`Transaction hash: ${tx.hash}`);
}

async function main() {
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

      await swapTokens(wethAmount, USDC);
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
      await swapTokens(usdcAmount, WETH);

    } else {
      console.log('USDC price is lower than the average, do nothing');
    }
  }
}

main();