import { Address, DataB, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PaymentCredentials, TxBuilder, TxOutRef, Value } from "@harmoniclabs/plu-ts";
import { cli } from "./providers/cli";
import { koios } from "./providers/koios";
import { readFile, writeFile } from "fs/promises";
import { tokenName } from "./constants";
import { getProtocolParams } from "./utils/getProtocolParams";
import { makeMarketplace } from "../src/contracts/marketplace";
import { tokensOne } from "../src/contracts/tokensOne";
import { tryGetMarketplaceConfig } from "./utils/tryGetMarketplaceConfig";
import { getDeployMarketplaceTx } from "./txns/marketplace/getDeployMarketplaceTx";
import { makeMarketplaceAndGetDeployTx } from "./txns/marketplace/makeMarketplaceAndGetDeployTx";

async function main()
{
    const cfg = tryGetMarketplaceConfig();

    const env = cfg.envFolderPath;

    const privateKey = cfg.signer.skey;
    const publicKey = cfg.signer.vkey;
    const addr = cfg.signer.address;

    const utxos = await koios.address.utxos( addr );

    console.log( utxos.map( u => JSON.stringify( u.toJson(), null, 2 ) ) );

    const utxo = utxos[0];

    if( utxo === undefined ) throw new Error(`missing utxo at address ${addr}`);

    const txBuilder = new TxBuilder(
        await getProtocolParams()
    );

    const [ idStr, idxStr ] = (await readFile(`${env}/last_ref_used`, { encoding: "utf-8" })).split("#");
    const ref = new TxOutRef({
        id: idStr,
        index: parseInt( idxStr )
    });

    const tx = await makeMarketplaceAndGetDeployTx(
        txBuilder,
        utxo,
        addr,
        ref
    );

    tx.signWith( privateKey );

    await koios.tx.submit( tx );

    await writeFile(
        `${env}/marketplace.utxoRef`,
        `${tx.hash}#0`,
        { encoding: "utf-8" }
    );

}
main();