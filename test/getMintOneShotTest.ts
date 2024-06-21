import { Address, DataI, PTxOutRef, Script, ScriptType, Tx, TxBuilder, UTxO, Value, pData } from "@harmoniclabs/plu-ts";
import { writeFile } from "fs/promises";
import { env } from "process";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { tokenName } from "../app/constants";
import { cli } from "../app/providers/cli";
import { withFolder } from "../app/utils/withFolder";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";

export async function getMintOneShotTestTx(
    txBuilder: TxBuilder,
    utxoToSpend: UTxO,
    returnAddress: Address,
    // parameters
) : Promise<{
    nftPolicySource: Script<"PlutusScriptV2">
    tx: Tx
}>
{
    const env = tryGetMarketplaceConfig().envFolderPath;

    const utxo = utxoToSpend;
    const addr = returnAddress

    const ref = utxo.utxoRef;

    const feeOracleNftPolicy = makeFeeOracleNftPolicy( PTxOutRef.fromData( pData( ref.toData() ) ) );

    await withFolder( env );

    await cli.utils.writeScript( feeOracleNftPolicy, `${env}/feeOracleNft_${ref}.plutus.json` );

    const policy = feeOracleNftPolicy.hash;

    await writeFile(`${env}/last_ref_used`, ref.toString(), { encoding: "utf-8" });
    await writeFile(`${env}/feeOracleNft_${ref}.policy`, feeOracleNftPolicy.hash.toString(), { encoding: "utf-8" });

    const mintedValue = new Value([
        Value.singleAssetEntry(
            policy,
            tokenName,
            1 //PARAMETER To the getmintshottx
        )
    ]);

    return {
        tx: txBuilder.buildSync({
            inputs: [{ utxo }],
            collaterals: [ utxo ],
            collateralReturn: {
                address: addr,
                value: Value.sub(
                    utxo.resolved.value,
                    Value.lovelaces( 5_000_000 )
                )
            },
            mints: [
                {
                    value: mintedValue, 
                    script: {
                        inline: feeOracleNftPolicy,
                        policyId: policy,
                        redeemer: new DataI( 0 )
                    }
                }
            ],
            changeAddress: addr
        }),
        nftPolicySource: feeOracleNftPolicy 
    };
}