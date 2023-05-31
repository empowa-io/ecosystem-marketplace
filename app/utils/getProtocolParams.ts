import { ProtocolParamters } from "@harmoniclabs/plu-ts";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { koios } from "../providers/koios";

const ppPath = "./testnet/protocol_params.json";

export async function getProtocolParams(): Promise<ProtocolParamters>
{
    if( !existsSync( ppPath ) )
    {
        return JSON.parse(
            await readFile( ppPath, { encoding: "utf-8"} ),
            ( k, v ) =>  {
                if( typeof v === "string" )
                {
                    try{
                        return BigInt( v )
                    }
                    finally {
                        return v;
                    }
                }

                return v;
            }
        ) 
    }
    const pps = await koios.epoch.protocolParams();

    await writeFile(
        ppPath,
        JSON.stringify(
            pps,
            (k,v) => {

                if( typeof v == "bigint") return v.toString();
                return v;
            }
        ), 
        { encoding: "utf-8" }
    );

    return pps;
}