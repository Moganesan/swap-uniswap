import { cleanEnv, str, num, bool } from "envalid";
import dotenv from "dotenv";
dotenv.config();

export const config = cleanEnv(process.env, {
  UNISWAP_UNIVERSAL_ROUTER_ADDRESS: str(),
  PERMIT2_ADDRESS: str(),
  UNISWAP_FACTORY_CONTRACT_ADDRESS: str(),
  WETH_ADDRESS: str(),
  FIREBLOCKS_SECRET_KEY: str(),
  FIREBLOCKS_API_KEY: str(),
});
