import { BigNumber } from "ethers";

type Pricing = {
  latest: number;
  average: number;
}

type OHLC = {
  close: string;
}

const getPricing = async (daysForAverage: number): Promise<Pricing> => {
  const secondsAgo = daysForAverage * 24 * 60 * 60;
  const now = new Date();
  const startTime = Math.floor(now.getTime() / 1000) - secondsAgo;

  console.log('startTime', startTime);

  const url = `https://www.bitstamp.net/api/v2/ohlc/ethusd/?step=86400&limit=365&start=${startTime}`;


  const response = await fetch(url);
  const data = await response.json();

  // console.log('data', JSON.stringify(data, null, 2));

  const ohlc: OHLC[] = data.data.ohlc;
  const total = ohlc.reduce((acc, cur) => acc + parseFloat(cur.close), 0);
  const average = total / ohlc.length;


  return { latest: parseFloat(ohlc[ohlc.length - 1].close), average }
}

const getMaxUSDC = (currentUsdcBalance: BigNumber, maxUsdcAllowed: BigNumber): BigNumber => {
  return currentUsdcBalance > maxUsdcAllowed ? maxUsdcAllowed : currentUsdcBalance;
}

const getMaxWETH = (currentWethBalance: BigNumber, maxWethAllowed: BigNumber): BigNumber => {
  return currentWethBalance > maxWethAllowed ? maxWethAllowed : currentWethBalance;
}

export {
  getPricing,
  getMaxUSDC,
  getMaxWETH
}


