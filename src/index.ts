import { ethers } from "ethers";
import dotenv from "dotenv";
import { formatEther } from "ethers/lib/utils";
import wethAbi from "./wethAbi.json";
import uniswapAbi from "./uniswapAbi.json";
import { erc20Abi } from "viem";

dotenv.config();

// arbitrum network provider
const provider = new ethers.providers.JsonRpcProvider(
  "https://rpc-sepolia.rockx.com"
);

const privateKey: any = process.env.PRIVATE_KEY;

// signer
const signer = new ethers.Wallet(privateKey, provider);

// uniswap universal router address
const uniswapRouter = "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E";

// swap parameters
const amountIn = ethers.utils.parseUnits("0.1", 18);
const WETHAddress = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const USDCAddress = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

async function main() {
  const routerContract = new ethers.Contract(uniswapRouter, uniswapAbi, signer);
  const tokenContract = new ethers.Contract(WETHAddress, erc20Abi, signer);
  console.log(
    "Native Balance : ",
    ethers.utils.formatEther(await provider.getBalance(signer.address))
  );
  console.log(
    "Weth Balance : ",
    ethers.utils.formatEther(await tokenContract.balanceOf(signer.address))
  );

  const CheckAllowance = await checkAllowance(WETHAddress);
  console.log("Allowance : ", ethers.utils.formatEther(CheckAllowance));
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
    const res = await routerContract.exactInputSingle(
      {
        tokenIn: WETHAddress,
        tokenOut: USDCAddress,
        fee: 3000, // Example fee (0.5%)
        recipient: signer.address,
        amountIn: amountIn,
        amountOutMinimum: 0, // Minimum amount of output token expected
        sqrtPriceLimitX96: 0, // No price limit
      },
      { gasLimit: 1000000, value: ethers.utils.parseEther("0.01") }
    );

    const receipt = await res.wait();

    console.log(receipt);
  } catch (err) {
    console.log("Swap Error", err);
  }
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
