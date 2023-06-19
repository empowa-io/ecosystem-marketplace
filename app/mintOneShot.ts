import { DataI, PTxOutRef, TxBuilder, Value, pData } from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftIdPolicy } from "../src/contracts/feeOracleNftIdPolicy";
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

    const feeOracleNftIdPolicy = makeFeeOracleNftIdPolicy( PTxOutRef.fromData( pData( ref.toData() ) ) );

    await withFolder( env );

    await cli.utils.writeScript( feeOracleNftIdPolicy, `${env}/feeOracleNftId_${ref}.plutus.json` );

    const policy = feeOracleNftIdPolicy.hash;

    await writeFile(`${env}/last_ref_used`, ref.toString(), { encoding: "utf-8" });
    await writeFile(`${env}/feeOracleNftId_${ref}.policy`, feeOracleNftIdPolicy.hash.toString(), { encoding: "utf-8" });

    const txBuilder = new TxBuilder(
        "testnet",
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
                    inline: feeOracleNftIdPolicy,
                    policyId: policy,
                    redeemer: new DataI( 0 )
                }
            }
        ],
        changeAddress: addr
    });

    tx.signWith( privateKey );

    await koios.tx.submit( tx );

    await koios.tx.waitConfirmed( tx.hash, 40_000, undefined, true );

}
main();