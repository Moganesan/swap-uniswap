import { ethers } from "ethers";
import dotenv from "dotenv";
import { formatEther } from "ethers/lib/utils";
import wethAbi from "./wethAbi.json";
import uniswapAbi from "./uniswapAbi.json";
import { erc20Abi } from "viem";

dotenv.config();

// arbitrum network provider
const provider = new ethers.providers.JsonRpcProvider(
  "https://arb1.arbitrum.io/rpc	"
);

const privateKey: any = process.env.PRIVATE_KEY;

// signer
const signer = new ethers.Wallet(privateKey, provider);

// uniswapv2 contact address
const uniswapRouter = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";

// swap parameters
const amountIn = ethers.utils.parseUnits("1", 18);
const WETHAddress = "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1";
const USDCAddress = "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9";

// Initialize moralis
async function InitializeMoralis() {
  await Moralis.start({
    apiKey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjcyYmUwY2ZhLWIzNTgtNDRkMS04MDU3LTAwYWUxMzRiMmE5OCIsIm9yZ0lkIjoiMTQ2NDciLCJ1c2VySWQiOiIxMDk1MyIsInR5cGVJZCI6ImQ5YmJmMjg1LTM0MGUtNGYzYy04ZTUwLWU1NGRmZWY2MTc5NCIsInR5cGUiOiJQUk9KRUNUIiwiaWF0IjoxNzE4Mjg1MDQwLCJleHAiOjQ4NzQwNDUwNDB9.LiBt5qdtrChVjaNVLbkwxwrsFZ6ceJLm5QV1IrTeoDU",
  });
}

const routerContract = new ethers.Contract(uniswapRouter, uniswapAbi, signer);
const tokenContract = new ethers.Contract(WETHAddress, erc20Abi, signer);
async function main() {
  await InitializeMoralis();
  console.log(
    "Native Balance : ",
    ethers.utils.formatEther(await provider.getBalance(signer.address))
  );
  console.log(
    "Weth Balance : ",
    ethers.utils.formatEther(await tokenContract.balanceOf(signer.address))
  );

  const CheckAllowance = await checkAllowance(WETHAddress);

  if (Number(CheckAllowance) < Number(ethers.utils.formatUnits(amountIn, 18))) {
    try {
      await tokenContract.approve(uniswapRouter, amountIn);
      console.log(
        "Now Allowance",
        await tokenContract.allowance(signer.address, uniswapRouter)
      );
    } catch (err) {
      console.log("Approve Failed", err);
    }
  }

  try {
    const path = [WETHAddress, USDCAddress];
    const amountOut = await getAmountsOutMin(amountIn.toString());
    const slippageTolerance = 1; // 1%
    const slippage = 1 - slippageTolerance / 100;
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now

    // calculating slippage
    const amountOutMin = ethers.utils.parseUnits(
      (
        Number(ethers.utils.formatUnits(amountOut[1].toString(), 6)) * slippage
      ).toString()
    );

    const wethInUsdPricePerToken: any = await getTokenPriceInUsd(
      WETHAddress
    ).then((res) => res?.usdPrice);

    const amountInUsd =
      wethInUsdPricePerToken * Number(ethers.utils.formatUnits(amountIn));

    const usdtInUsdPricePerToken: any = await getTokenPriceInUsd(
      USDCAddress
    ).then((res) => res?.usdPrice);

    console.log(usdtInUsdPricePerToken);
    console.log(
      usdtInUsdPricePerToken * Number(ethers.utils.formatUnits(amountOutMin))
    );

    const amountOutInUsd =
      usdtInUsdPricePerToken * Number(ethers.utils.formatUnits(amountOutMin));

    console.log(
      "Amount Out",
      Number(ethers.utils.formatUnits(amountOut[1].toString(), 6))
    );
    console.log(
      "Amount Out Min With Slippage",
      Number(ethers.utils.formatUnits(amountOutMin))
    );
    console.log("Amount In USD", amountInUsd);
    console.log("Amount Out USD", amountOutInUsd);

    const res = await routerContract.swapExactTokensForTokens(
      amountIn,
      amountOutMin,
      path,
      signer.address,
      deadline,
      {
        gasLimit: 1000000,
      }
    );

    const receipt = await res.wait();

    console.log(receipt);
  } catch (err) {
    console.log("Swap Error", err);
  }
}

// get swap token out min
async function getAmountsOutMin(amountIn: string) {
  const path = [WETHAddress, USDCAddress];
  return routerContract.getAmountsOut(amountIn, path);
}

// convert eth to weth
async function ethToWeth(eth: string) {
  try {
    await signer.sendTransaction({
      to: WETHAddress,
      value: eth,
    });
  } catch (err) {
    console.log("Error From Wrapping Token", err);
  }
}

// get token price in $usd
async function getTokenPriceInUsd(address: string) {
  try {
    const response = await Moralis.EvmApi.token.getTokenPrice({
      chain: "0xa4b1",
      include: "percent_change",
      address: address,
    });
    return response.raw;
  } catch (e) {
    console.error(e);
  }
}

// convert weth to eth
async function wethToEth(weth: string) {
  try {
    const wethContract = new ethers.Contract(WETHAddress, wethAbi, signer);

    await wethContract.approve(
      wethContract.address,
      ethers.utils.parseEther("100")
    );
    await wethContract.withdraw(weth);
  } catch (err) {
    console.log("Erro from Unwrapping Token", err);
  }
}

// check token allowance
async function checkAllowance(token: string) {
  const tokenContract = new ethers.Contract(token, erc20Abi, signer);

  const allowance = await tokenContract.allowance(
    signer.address,
    uniswapRouter
  );

  return allowance;
}

// approve token to spent
async function approveToken(token: string, amount: string) {
  const tokenContract = new ethers.Contract(token, erc20Abi, signer);
  try {
    await tokenContract.approve(uniswapRouter, amount, { gasLimit: 21632 });
  } catch (err) {
    console.log("Approve Error", err);
  }
}

main();
