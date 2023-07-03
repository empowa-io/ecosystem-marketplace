import { existsSync } from "fs";

export function getConfigPath(): string
{
    let path = process.argv[2] ?? "./marketplace.config.local.json";

    if( !existsSync( path ) ) return "./marketplace.config.json";
    return path;
}