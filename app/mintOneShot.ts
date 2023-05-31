import { DataI, PTxOutRef, TxBuilder, Value, pData } from "@harmoniclabs/plu-ts";
import { makeOneShot } from "../src/contracts/oneShot";
import { cli } from "./providers/cli";
import { koios } from "./providers/koios";
import { withTestnetFolder } from "./utils/withTestnetFolder";
import { writeFile } from "fs/promises";
import { tokenName } from "./constants";
import { getProtocolParams } from "./utils/getProtocolParams";

async function main()
{
    const privateKey = cli.utils.readPrivateKey("./secret_testnet/payment.skey");
    const addr = cli.utils.readAddress("./secret_testnet/payment.addr");

    const utxos = await koios.address.utxos( addr );
    console.log( utxos.map( u => JSON.stringify( u.toJson(), null, 2 ) ) );

    const utxo = utxos[0];
    const ref = utxo.utxoRef;

    const oneShot = makeOneShot( PTxOutRef.fromData( pData( ref.toData() ) ) );

    await withTestnetFolder();

    await cli.utils.writeScript( oneShot, `./testnet/oneShot_${ref}.plutus.json` );

    const policy = oneShot.hash;

    await writeFile("./testnet/last_ref_used", ref.toString(), { encoding: "utf-8" });
    await writeFile(`./testnet/oneShot_${ref}.policy`, oneShot.hash.toString(), { encoding: "utf-8" });

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
                    inline: oneShot,
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