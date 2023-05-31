import { existsSync } from "fs";
import { mkdir } from "fs/promises";

export const testnetPath = "./testnet";

export async function withTestnetFolder(): Promise<void>
{
    if( !existsSync(testnetPath) ) await mkdir(testnetPath);
}

export const secret_testnetPath = "./testnet";

export function assertSecretTestnetFolder(): void
{
    if( !existsSync(secret_testnetPath) ) throw "missing" + secret_testnetPath;
}