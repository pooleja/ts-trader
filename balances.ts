import { BigNumber, Contract, providers } from 'ethers';
import tokenAbi from './abis/token.json';

const getBalance = async (address: string, tokenAddress: string, provider: providers.Provider): Promise<BigNumber> => {

  const poolContract = new Contract(tokenAddress, tokenAbi, provider)

  const balance = await poolContract.balanceOf(address)

  return balance
}

export {
  getBalance
}