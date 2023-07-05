import { DataI, PTxOutRef, TxBuilder, Value, pData } from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { cli } from "./providers/cli";
import { koios } from "./providers/koios";
import { writeFile } from "fs/promises";
import { tokenName } from "./constants";
import { getProtocolParams } from "./utils/getProtocolParams";
import { tryGetMarketplaceConfig } from "./utils/tryGetMarketplaceConfig";
import { withFolder } from "./utils/withFolder";
import { getMintOneShotTx } from "./txns/getMintOneShotTx";

async function main()
{
    const cfg = tryGetMarketplaceConfig();

    const privateKey = cfg.signer.skey;
    const addr = cfg.signer.address;

    const utxos = await koios.address.utxos( addr );
    console.log( utxos.map( u => JSON.stringify( u.toJson(), null, 2 ) ) );

    const txBuilder = new TxBuilder(
        await getProtocolParams()
    );

    const utxo = utxos[0];

    const tx = await getMintOneShotTx(
        txBuilder,
        utxo,
        addr
    );

    tx.signWith( privateKey );

    const hash = await koios.tx.submit( tx );

    console.log( hash.toString() );
    
    await koios.tx.waitConfirmed( tx.hash, 40_000, undefined, true );

}
main();