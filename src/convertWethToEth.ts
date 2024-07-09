import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

// arbitrum network provider
const provider = new ethers.providers.JsonRpcProvider(
  "https://1rpc.io/sepolia"
);
const privateKey: any = process.env.PRIVATE_KEY;
const signer = new ethers.Wallet(privateKey, provider);

async function main() {
  console.log("Script Run");
  const wethAddress = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";

  try {
    const res = await ethToWeth(
      ethers.utils.parseEther("0.01").toString(),
      wethAddress
    );

    console.log(res);
  } catch (err) {
    console.log("Error From Initial Setup");
  }
}

// convert weth to eth
async function ethToWeth(eth: string, WETHAddress: string) {
  try {
    const tx = await signer.sendTransaction({
      to: WETHAddress,
      value: eth,
    });

    console.log(tx);

    tx.wait();

    return tx;
  } catch (err) {
    console.log("Error From Wrapping Token", err);
  }
}

main();
