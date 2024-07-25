import { SwapRouter, UniswapTrade } from "@uniswap/universal-router-sdk";
import {
  TradeType,
  Ether,
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
import { formatEther, parseEther } from "ethers";
import wethAbi from "./wethAbi.json";
import { config } from "../config";
import {
  FireblocksWeb3Provider,
  ChainId,
  ApiBaseUrl,
} from "@fireblocks/fireblocks-web3-provider";
import Web3, { Web3BaseProvider } from "web3";

const SWAP_ROUTER_ADDRESS = config.UNISWAP_UNIVERSAL_ROUTER_ADDRESS;

const WETH_ADDRESS = config.WETH_ADDRESS;

const ETHER = Ether.onChain(1);

const WETH = new Token(ChainId.SEPOLIA, WETH_ADDRESS, 18);

// export async function getPool(
//   web3: Web3,
//   tokenA: Token,
//   tokenB: Token,
//   feeAmount: FeeAmount
// ): Promise<Pool> {
//   const [token0, token1] = tokenA.sortsBefore(tokenB)
//     ? [tokenA, tokenB]
//     : [tokenB, tokenA]; // does safety checks
//   const poolAddress = Pool.getAddress(token0, token1, feeAmount);
//   const contract = new web3.eth.Contract(IUniswapV3Pool.abi, poolAddress);
//   let liquidity = await contract.methods.liquidity();
//   let { sqrtPriceX96, tick } = await contract.methods.slot0();
//   liquidity = JSBI.BigInt(liquidity.toString());
//   sqrtPriceX96 = JSBI.BigInt(sqrtPriceX96.toString());

//   return new Pool(
//     token0,
//     token1,
//     feeAmount,
//     sqrtPriceX96,
//     liquidity,
//     JSBI.toNumber(tick),
//     [
//       {
//         index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
//         liquidityNet: liquidity,
//         liquidityGross: liquidity,
//       },
//       {
//         index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
//         liquidityNet: JSBI.multiply(liquidity, JSBI.BigInt("-1")),
//         liquidityGross: liquidity,
//       },
//     ]
//   );
// }

interface LiquidityResult {
  _hex: string;
  _isBigNumber: boolean;
}

interface Slot0Result {
  sqrtPriceX96: string;
  tick: string;
  observationIndex: string;
  observationCardinality: string;
  observationCardinalityNext: string;
  feeProtocol: string;
  unlocked: boolean;
}

export async function getPool(
  web3: Web3,
  tokenA: Token,
  tokenB: Token,
  feeAmount: FeeAmount
): Promise<any> {
  const [token0, token1] = tokenA.sortsBefore(tokenB)
    ? [tokenA, tokenB]
    : [tokenB, tokenA];

  let poolAddress;

  try {
    const factoryContract = new web3.eth.Contract(
      IUniswapV3Factory.abi,
      config.UNISWAP_FACTORY_CONTRACT_ADDRESS
    );
    const getPoolAddress = await factoryContract.methods
      .getPool(token0.address, token1.address, feeAmount)
      .call();
    console.log(getPoolAddress);
    poolAddress = getPoolAddress;
  } catch (err) {
    console.log("Error from gettingPool Address", err);
  }

  // Check if the contract exists
  const code = await web3.eth.getCode(poolAddress, "latest");
  if (code === "0x") {
    throw new Error(`No contract found at address ${poolAddress}`);
  }

  let poolContract;
  try {
    const contract = new web3.eth.Contract(
      IUniswapV3Pool.abi as any,
      poolAddress
    );
    poolContract = contract;
  } catch (err) {
    console.log("Error from initializing pool contract", err);
  }

  try {
    const [liquidity, slot0] = await Promise.all([
      poolContract.methods
        .liquidity()
        .call()
        .catch((e) => {
          console.error("Error calling liquidity():", e);
          throw e;
        }),
      poolContract.methods
        .slot0()
        .call()
        .catch((e) => {
          console.error("Error calling slot0():", e);
          throw e;
        }),
    ]);

    const liquidityString =
      typeof liquidity === "object" ? liquidity._hex : liquidity.toString();
    const sqrtPriceX96String = slot0.sqrtPriceX96.toString();
    const tickNumber = parseInt(slot0.tick, 10);

    return new Pool(
      token0,
      token1,
      feeAmount,
      sqrtPriceX96String as BigintIsh,
      liquidityString as BigintIsh,
      tickNumber,
      [
        {
          index: nearestUsableTick(TickMath.MIN_TICK, TICK_SPACINGS[feeAmount]),
          liquidityNet: liquidityString as BigintIsh,
          liquidityGross: liquidityString as BigintIsh,
        },
        {
          index: nearestUsableTick(TickMath.MAX_TICK, TICK_SPACINGS[feeAmount]),
          liquidityNet: `-${liquidityString}` as BigintIsh,
          liquidityGross: liquidityString as BigintIsh,
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
  web3: Web3,
  tokenContract,
  owner,
  spender,
  amount
) => {
  try {
    const contract = new web3.eth.Contract(wethAbi, tokenContract);
    const currentAllowance = await contract.methods
      .allowance(owner, spender)
      .call();
    console.log("Current Allowance", currentAllowance);
    const tx = await contract.methods
      .approve(spender, amount)
      .send({ from: owner });
    console.log(tx);
  } catch (err) {
    console.log("Error from setting allowance", err);
  }
};

const getWeth = async (web3: Web3, amount: string) => {
  const accounts = await web3.eth.getAccounts();
  try {
    const contract = new web3.eth.Contract(wethAbi, WETH.address);

    console.log(
      "Before Balance WETH:",
      await contract.methods.balanceOf(accounts[0]).call()
    );
    await contract.methods
      .deposit(amount)
      .send({ from: accounts[0], value: amount });

    console.log(
      "After Balance WETH:",
      await contract.methods.balanceOf(accounts[0]).call()
    );
  } catch (err) {
    console.log("Error from converting weth", err);
  }
};

export const swapTokens = async () => {
  const eip1193Provider = new FireblocksWeb3Provider({
    apiBaseUrl: ApiBaseUrl.Sandbox, // If using a sandbox workspace
    privateKey: config.FIREBLOCKS_SECRET_KEY,
    apiKey: config.FIREBLOCKS_API_KEY,
    vaultAccountIds: ["50"],
    chainId: ChainId.SEPOLIA,
  });

  const web3 = new Web3(eip1193Provider);
  const address = await web3.eth.getAccounts();
  console.log(address);
  const TOKEN_B = new Token(
    ChainId.SEPOLIA,
    "0x4f7A67464B5976d7547c860109e4432d50AfB38e",
    18
  );

  const pool = await getPool(web3, WETH, TOKEN_B, FeeAmount.MEDIUM);
  const inputEther = parseEther("0.001");

  //   await setAllowance(
  //     web3,
  //     WETH.address,
  //     address[0],
  //     SWAP_ROUTER_ADDRESS,
  //     inputEther
  //   );

  //   await getWeth(web3, parseEther("0.09").toString());

  const trade = await V3Trade.fromRoute(
    new RouteV3([pool], WETH, TOKEN_B),
    CurrencyAmount.fromRawAmount(WETH, inputEther.toString()),
    TradeType.EXACT_INPUT
  );

  const opts = swapOptions({}, address[0]);

  const methodParameters = SwapRouter.swapCallParameters(
    new UniswapTrade(buildTrade([trade]), opts)
  );
  const gasPrice = await web3.eth.getGasPrice();

  const estimatedGas = await web3.eth.estimateGas({
    from: address[0],
    to: SWAP_ROUTER_ADDRESS,
    value: methodParameters.value,
    data: methodParameters.calldata,
  });

  const tx = await web3.eth.sendTransaction({
    from: address[0],
    to: SWAP_ROUTER_ADDRESS,
    value: methodParameters.value,
    data: methodParameters.calldata,
    gasPrice: gasPrice,
    gas: estimatedGas,
  });

  console.log(tx);
};

swapTokens();
