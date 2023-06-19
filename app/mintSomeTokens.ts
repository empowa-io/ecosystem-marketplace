import { DataI, TxBuilder, Value } from "@harmoniclabs/plu-ts";
import { cli } from "./providers/cli";
import { koios } from "./providers/koios";
import { writeFile } from "fs/promises";
import { tokenName } from "./constants";
import { getProtocolParams } from "./utils/getProtocolParams";
import { tokensOne } from "../src/contracts/tokensOne";

async function main()
{
    const privateKey = cli.utils.readPrivateKey("./secret_testnet/payment.skey");
    const addr = cli.utils.readAddress("./secret_testnet/payment.addr");

    const utxos = await koios.address.utxos( addr );
    console.log( utxos.map( u => JSON.stringify( u.toJson(), null, 2 ) ) );

    const utxo = utxos[0];

    const policy = tokensOne.hash; 

    cli.utils.writeScript( tokensOne, "./testnet/fake.plutus.json" );
    await writeFile(`${env}/fake.policy`, policy.toString(), { encoding: "utf-8" });

    const txBuilder = new TxBuilder(
        "testnet",
        await getProtocolParams()
    );

    const mintedValue = new Value([
        Value.singleAssetEntry(
            policy,
            tokenName,
            1_000_000
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
                    inline: tokensOne,
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