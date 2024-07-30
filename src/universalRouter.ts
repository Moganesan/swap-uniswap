import { SwapRouter, UniswapTrade } from "@uniswap/universal-router-sdk";
import {
  TradeType,
  Token,
  CurrencyAmount,
  Percent,
  Currency,
  BigintIsh,
} from "@uniswap/sdk-core";
import { Trade as V2Trade } from "@uniswap/v2-sdk";
import {
  Pool,
  nearestUsableTick,
  TickMath,
  TICK_SPACINGS,
  FeeAmount,
  Trade as V3Trade,
  Route as RouteV3,
} from "@uniswap/v3-sdk";
import {
  MixedRouteSDK,
  MixedRouteTrade,
  Trade as RouterTrade,
  RouteV2,
} from "@uniswap/router-sdk";
import IUniswapV3Pool from "@uniswap/v3-core/artifacts/contracts/UniswapV3Pool.sol/UniswapV3Pool.json";
import IUniswapV3Factory from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import * as ethers from "ethers";
import { AllowanceTransfer } from "@uniswap/permit2-sdk";
import wethAbi from "./wethAbi.json";
import { config } from "../config";
import {
  FireblocksWeb3Provider,
  ChainId,
  ApiBaseUrl,
} from "@fireblocks/fireblocks-web3-provider";
import PERMIT_2_ABI from "./permit2Abi.json";
import Web3, { ProviderError } from "web3";
import { MAX_UINT160 } from "@uniswap/smart-order-router";

const SWAP_ROUTER_ADDRESS = config.UNISWAP_UNIVERSAL_ROUTER_ADDRESS;

const WETH_ADDRESS = config.WETH_ADDRESS;

const PERMIT2_ADDRESS = config.UNISWAP_PERMIT2_ADDRESS;

const MAX_UINT =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

const WETH = new Token(ChainId.SEPOLIA, WETH_ADDRESS, 18);

const makePermit = (
  tokenAddress,
  amount = ethers.constants.MaxUint256.toString(),
  nonce = "0"
) => {
  return {
    details: {
      token: tokenAddress,
      amount,
      expiration: Math.floor(new Date().getTime() / 1000 + 100000).toString(),
      nonce,
    },
    spender: SWAP_ROUTER_ADDRESS,
    sigDeadline: Math.floor(new Date().getTime() / 1000 + 100000).toString(),
  };
};

async function generatePermitSignature(permit, signer, chainId) {
  const { domain, types, values } = AllowanceTransfer.getPermitData(
    permit,
    PERMIT2_ADDRESS,
    chainId
  );
  return await signer._signTypedData(domain, types, values);
}
export async function getPool(
  provider: ethers.providers.Web3Provider,
  tokenA: Token,
  tokenB: Token,
  feeAmount: FeeAmount
): Promise<any> {
  console.log("Get Pool Called");
  const [token0, token1] = tokenA.sortsBefore(tokenB)
    ? [tokenA, tokenB]
    : [tokenB, tokenA];

  let poolAddress;

  try {
    const factoryContract = new ethers.Contract(
      config.UNISWAP_FACTORY_CONTRACT_ADDRESS,
      IUniswapV3Factory.abi,
      provider.getSigner()
    );
    const getPoolAddress = await factoryContract.getPool(
      token0.address,
      token1.address,
      feeAmount
    );

    console.log("Pool Address", getPoolAddress);
    poolAddress = getPoolAddress;
  } catch (err) {
    console.log("Error from gettingPool Address", err);
    throw err;
  }

  // Check if the contract exists
  if (poolAddress === ethers.constants.AddressZero) {
    throw new Error(`No contract found at address ${poolAddress}`);
  }

  let poolContract;
  try {
    poolContract = new ethers.Contract(
      poolAddress,
      IUniswapV3Pool.abi as any,
      provider.getSigner()
    );
  } catch (err) {
    console.log("Error from initializing pool contract", err);
    throw err;
  }

  try {
    const [liquidity, slot0] = await Promise.all([
      poolContract.liquidity(),
      poolContract.slot0(),
    ]);

    const liquidityBN = ethers.BigNumber.from(liquidity);
    const sqrtPriceX96BN = ethers.BigNumber.from(slot0.sqrtPriceX96);
    const tickNumber = slot0.tick;

    return new Pool(
      token0,
      token1,
      feeAmount,
      sqrtPriceX96BN.toString(),
      liquidityBN.toString(),
      tickNumber,
      [
        {
          index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
          liquidityNet: liquidityBN.toString(),
          liquidityGross: liquidityBN.toString(),
        },
        {
          index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
          liquidityNet: liquidityBN.mul(-1).toString(), // Convert to negative BigNumber
          liquidityGross: liquidityBN.toString(),
        },
      ]
    );
  } catch (error) {
    console.error("Error in getPool:", error);
    throw error;
  }
}

export function buildTrade(
  trades: (
    | V2Trade<Currency, Currency, TradeType>
    | V3Trade<Currency, Currency, TradeType>
    | MixedRouteTrade<Currency, Currency, TradeType>
  )[]
): RouterTrade<Currency, Currency, TradeType> {
  return new RouterTrade({
    v2Routes: trades
      .filter((trade) => trade instanceof V2Trade)
      .map((trade) => ({
        routev2: trade.route as RouteV2<Currency, Currency>,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
      })),
    v3Routes: trades
      .filter((trade) => trade instanceof V3Trade)
      .map((trade) => ({
        routev3: trade.route as RouteV3<Currency, Currency>,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
      })),
    mixedRoutes: trades
      .filter((trade) => trade instanceof MixedRouteTrade)
      .map((trade) => ({
        mixedRoute: trade.route as MixedRouteSDK<Currency, Currency>,
        inputAmount: trade.inputAmount,
        outputAmount: trade.outputAmount,
      })),
    tradeType: trades[0].tradeType,
  });
}

function swapOptions(options, recipient) {
  return Object.assign(
    {
      slippageTolerance: new Percent(5, 100),
      recipient: recipient,
    },
    options
  );
}

const setAllowance = async (
  provider: ethers.providers.Web3Provider,
  tokenContract,
  owner,
  spender,
  amount
) => {
  try {
    const contract = new ethers.Contract(
      tokenContract,
      wethAbi,
      provider.getSigner()
    );
    const currentAllowance = await contract.allowance(owner, spender);
    if (currentAllowance < amount) {
      const tx = await contract.approve(spender, amount);
      console.log(tx);
    } else {
      console.log("Allowance Already Set");
    }
  } catch (err) {
    console.log("Error from setting allowance", err);
  }
};

const getWeth = async (
  provider: ethers.providers.Web3Provider,
  amount: string
) => {
  const signer = provider.getSigner();
  const accounts = await signer.getAddress();
  try {
    const contract = new ethers.Contract(WETH.address, wethAbi, signer);

    console.log("Before Balance WETH:", await contract.balanceOf(accounts[0]));
    await contract.deposit(amount);

    console.log("After Balance WETH:", await contract.balanceOf(accounts[0]));
  } catch (err) {
    console.log("Error from converting weth", err);
  }
};

export const swapTokens = async (
  tokenAddress: string,
  vaultId: string,
  amountIn: string
) => {
  const eip1193Provider = new FireblocksWeb3Provider({
    apiBaseUrl: ApiBaseUrl.Sandbox, // If using a sandbox workspace
    privateKey: config.FIREBLOCKS_SECRET_KEY,
    apiKey: config.FIREBLOCKS_API_KEY,
    vaultAccountIds: [vaultId],
    chainId: ChainId.SEPOLIA,
  });

  const provider = new ethers.providers.Web3Provider(eip1193Provider);

  const signer = provider.getSigner();
  const address = await signer.getAddress();

  console.log(tokenAddress);

  const TOKEN_B = new Token(ChainId.SEPOLIA, tokenAddress, 18);
  console.log(TOKEN_B);

  const pool = await getPool(provider, WETH, TOKEN_B, FeeAmount.MEDIUM);

  const inputEther = ethers.utils.parseEther(amountIn);

  await setAllowance(
    provider,
    WETH.address,
    address,
    PERMIT2_ADDRESS,
    MAX_UINT
  );

  //   await getWeth(web3, parseEther("0.09").toString());

  const permit2 = new ethers.ethers.Contract(
    PERMIT2_ADDRESS,
    PERMIT_2_ABI,
    signer
  );

  const checkPermit: any = await permit2.allowance(
    address,
    WETH_ADDRESS,
    SWAP_ROUTER_ADDRESS
  );

  if (Number(checkPermit.expiration) == 0) {
    const txApproval = await permit2.approve(
      WETH_ADDRESS,
      SWAP_ROUTER_ADDRESS,
      MAX_UINT160,
      20_000_000_000_000
    );

    console.log("Approval Tx", txApproval);
  }

  const trade = await V3Trade.fromRoute(
    new RouteV3([pool], WETH, TOKEN_B),
    CurrencyAmount.fromRawAmount(WETH, inputEther.toString()),
    TradeType.EXACT_INPUT
  );

  const opts = swapOptions({}, address);

  const methodParameters = SwapRouter.swapCallParameters(
    new UniswapTrade(buildTrade([trade]), opts),
    { sender: address }
  );

  const gasPrice = await provider.getGasPrice();

  const estimatedGas = await provider.estimateGas({
    from: address,
    to: SWAP_ROUTER_ADDRESS,
    value: inputEther.toString(),
    data: methodParameters.calldata,
  });
  console.log("Balance");
  console.log(await provider.getBalance(address));

  const tx = await signer.sendTransaction({
    from: address,
    to: SWAP_ROUTER_ADDRESS,
    value: methodParameters.value,
    data: methodParameters.calldata,
    gasPrice: gasPrice,
    gasLimit: estimatedGas,
  });
  tx.wait();
  return tx;
};

swapTokens("0x4f7A67464B5976d7547c860109e4432d50AfB38e", "50", "0.01");
