import { Address, DataB, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PaymentCredentials, TxBuilder, TxOutRef, Value } from "@harmoniclabs/plu-ts";
import { cli } from "./providers/cli";
import { koios } from "./providers/koios";
import { readFile, writeFile } from "fs/promises";
import { tokenName } from "./constants";
import { getProtocolParams } from "./utils/getProtocolParams";
import { makeMarketplace } from "../src/contracts/marketplace";
import { tokensOne } from "../src/contracts/tokensOne";
import { tryGetMarketplaceConfig } from "./utils/tryGetMarketplaceConfig";

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

    const [ idStr, idxStr ] = (await readFile(`${env}/last_ref_used`, { encoding: "utf-8" })).split("#");
    const ref = new TxOutRef({
        id: idStr,
        index: parseInt( idxStr )
    });
    const nftPolicy = new Hash28( await readFile(`${env}/feeOracleNftId_${ref}.policy`, { encoding: "utf-8" }) );

    const marketplace = makeMarketplace(
        PCurrencySymbol.from( cfg.paymentAsset.policy.toString() ),
        PTokenName.from( cfg.paymentAsset.tokenName ),
        PPubKeyHash.from( publicKey.hash.toBuffer() ),
        PCurrencySymbol.from( nftPolicy.toBuffer() ),
        PTokenName.from( tokenName )
    );

    const marketplaceAddr = new Address(
        "testnet",
        PaymentCredentials.script( marketplace.hash )
    );
    const marketplaceFileName = `marketplace`;

    await cli.utils.writeScript( marketplace,      `${env}/${marketplaceFileName}.plutus.json` );
    await cli.utils.writeAddress( marketplaceAddr, `${env}/${marketplaceFileName}.addr` );

    const txBuilder = new TxBuilder(
        await getProtocolParams()
    );

    const tx = txBuilder.buildSync({
        inputs: [{ utxo }],
        outputs: [
            {
                address: marketplaceAddr,
                value: Value.lovelaces( 10_000_000 ),
                datum: new DataB(""), // invalid datum for the contract; always fails
                refScript: marketplace
            }
        ],
        changeAddress: addr
    });

    tx.signWith( privateKey );

    await koios.tx.submit( tx );

    await writeFile(
        `${env}/${marketplaceFileName}.utxoRef`,
        `${tx.hash}#0`,
        { encoding: "utf-8" }
    );

}
main();