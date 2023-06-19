import { existsSync } from "fs";
import { mkdir } from "fs/promises";
import { isValidPath } from "./isValidPath";

export async function withFolder( path: string ): Promise<void>
{
    if( !isValidPath( path ) ) throw new Error("invalid path: " + path);
    if( !existsSync( path ) ) await mkdir( path );
}

export const secret_testnetPath = "./testnet";

export function assertFolder( path: string ): void
{
    if( !existsSync( path ) ) throw new Error("missing" + path);
}