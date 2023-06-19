import { blockfrost } from "./blockfrost";
import { koios } from "./koios";

export const provider = blockfrost ? blockfrost : koios;