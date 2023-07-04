import { CborPositiveRational, ExBudget, ProtocolParamters, costModelsToJson, forceBigUInt } from "@harmoniclabs/plu-ts";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { koios } from "../providers/koios";
import { tryGetMarketplaceConfig } from "./tryGetMarketplaceConfig";
import { provider } from "../providers/provider";
import { BlockfrostPluts } from "@harmoniclabs/blockfrost-pluts";

const cfg = tryGetMarketplaceConfig();

const env = cfg.envFolderPath;

const ppPath = `${env}/protocol_params.json`;

let _pps: ProtocolParamters | undefined = undefined;

function ppsFromJsonString( jsonStr: string ): ProtocolParamters
{
    const json = JSON.parse(
        jsonStr,
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
    );

    const pps = {} as ProtocolParamters;

    pps.txFeePerByte = BigInt( json.txFeePerByte );
    pps.txFeeFixed = BigInt( json.txFeeFixed );
    pps.maxBlockBodySize = BigInt( json.maxBlockBodySize );
    pps.maxTxSize = BigInt( json.maxTxSize );
    pps.maxBlockHeaderSize = BigInt( json.maxBlockHeaderSize );
    pps.stakeAddressDeposit = BigInt( json.stakeAddressDeposit );
    pps.stakePoolDeposit = BigInt( json.stakePoolDeposit );
    pps.poolRetireMaxEpoch = BigInt( json.poolRetireMaxEpoch );
    pps.stakePoolTargetNum = BigInt( json.stakePoolTargetNum );
    pps.poolPledgeInfluence = CborPositiveRational.fromNumber( json.poolPledgeInfluence );
    pps.monetaryExpansion = CborPositiveRational.fromNumber( json.monetaryExpansion );
    pps.treasuryCut = CborPositiveRational.fromNumber( json.treasuryCut );
    pps.protocolVersion = json.protocolVerision;
    pps.minPoolCost = BigInt( json.minPoolCost );
    pps.utxoCostPerByte = BigInt( json.utxoCostPerByte );
    pps.costModels = {};

    if( typeof json.costModels.PlutusScriptV1 === "object" )
    {
        pps.costModels.PlutusScriptV1 = {} as any;
        for(const k in json.costModels.PlutusScriptV1)
        {
            (pps.costModels.PlutusScriptV1 as any)[k] = BigInt( json.costModels.PlutusScriptV1[k] )
        }
    }

    if( typeof json.costModels.PlutusScriptV2 === "object" )
    {
        pps.costModels.PlutusScriptV2 = {} as any;
        for(const k in json.costModels.PlutusScriptV2)
        {
            (pps.costModels.PlutusScriptV2 as any)[k] = BigInt( json.costModels.PlutusScriptV2[k] )
        }
    }
    
    pps.executionUnitPrices = json.executionUnitPrices;
    pps.maxTxExecutionUnits = ExBudget.fromJson( json.maxTxExecutionUnits );
    pps.maxBlockExecutionUnits = ExBudget.fromJson( json.maxBlockExecutionUnits );
    pps.maxValueSize = BigInt( json.maxValueSize );
    pps.collateralPercentage = BigInt( json.collateralPercentage );
    pps.maxCollateralInputs = BigInt( json.maxCollateralInputs );

    return pps;
}

export async function getProtocolParams(): Promise<ProtocolParamters>
{
    if( _pps ) return _pps;
    
    if( existsSync( ppPath ) )
    {
        return ppsFromJsonString( await readFile( ppPath, { encoding: "utf-8"} ) );
    }
    
    _pps = provider instanceof BlockfrostPluts ?
        await provider.getProtocolParameters() :
        await koios.epoch.protocolParams();

    await writeFile(
        ppPath,
        JSON.stringify(
            _pps,
            (k,v) => {
                if( k === "protocolVerision" )
                {
                    if( Array.isArray( v ) )
                    {
                        v = {
                            major: Number( forceBigUInt( v[0] ) ),
                            minor: Number( forceBigUInt( v[1] ) )
                        }
                    }

                    return v;
                }
                if( k === "executionUnitPrices" )
                {
                    if( Array.isArray( v ) )
                    {
                        v = {
                            priceMemory: v[0].toNumber(),
                            priceSteps: v[1].toNumber()
                        }
                    }

                    return v;
                }
                if( v instanceof ExBudget ) return v.toJson();
                if( v instanceof CborPositiveRational ) return v.toNumber();
                if( typeof v === "bigint" ) return v.toString();
                return v;
            }
        ), 
        { encoding: "utf-8" }
    );
    
    return _pps;
}