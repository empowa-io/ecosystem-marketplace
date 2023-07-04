import { DataI, PTxOutRef, TxBuilder, Value, pData } from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { cli } from "./providers/cli";
import { koios } from "./providers/koios";
import { writeFile } from "fs/promises";
import { tokenName } from "./constants";
import { getProtocolParams } from "./utils/getProtocolParams";
import { tryGetMarketplaceConfig } from "./utils/tryGetMarketplaceConfig";
import { withFolder } from "./utils/withFolder";

async function main()
{
    const cfg = tryGetMarketplaceConfig();

    const env = cfg.envFolderPath;

    const privateKey = cfg.signer.skey;
    const addr = cfg.signer.address;

    const utxos = await koios.address.utxos( addr );
    console.log( utxos.map( u => JSON.stringify( u.toJson(), null, 2 ) ) );

    const utxo = utxos[0];
    const ref = utxo.utxoRef;

    const feeOracleNftPolicy = makeFeeOracleNftPolicy( PTxOutRef.fromData( pData( ref.toData() ) ) );

    await withFolder( env );

    await cli.utils.writeScript( feeOracleNftPolicy, `${env}/feeOracleNft_${ref}.plutus.json` );

    const policy = feeOracleNftPolicy.hash;

    await writeFile(`${env}/last_ref_used`, ref.toString(), { encoding: "utf-8" });
    await writeFile(`${env}/feeOracleNft_${ref}.policy`, feeOracleNftPolicy.hash.toString(), { encoding: "utf-8" });

    const txBuilder = new TxBuilder(
        await getProtocolParams()
    );

    const mintedValue = new Value([
        Value.singleAssetEntry(
            policy,
            tokenName,
            1
        )
    ]);

    const tx = txBuilder.buildSync({
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
    });

    tx.signWith( privateKey );

    const hash = await koios.tx.submit( tx );

    console.log( hash.toString() );
    
    await koios.tx.waitConfirmed( tx.hash, 40_000, undefined, true );

}
main();