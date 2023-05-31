import { Address, DataB, DataI, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PaymentCredentials, TxBuilder, TxOutRef, Value, pData } from "@harmoniclabs/plu-ts";
import { cli } from "./providers/cli";
import { koios } from "./providers/koios";
import { readFile, writeFile } from "fs/promises";
import { tokenName } from "./constants";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { getProtocolParams } from "./utils/getProtocolParams";
import { makeMarketplace } from "../src/contracts/marketplace";
import { tokensOne } from "../src/contracts/tokensOne";

async function main()
{
    const privateKey = cli.utils.readPrivateKey("./secret_testnet/payment.skey");
    const publicKey = cli.utils.readPublicKey("./secret_testnet/payment.vkey");
    const addr = cli.utils.readAddress("./secret_testnet/payment.addr");

    const utxos = await koios.address.utxos( addr );

    console.log( utxos.map( u => JSON.stringify( u.toJson(), null, 2 ) ) );

    const utxo = utxos[0];

    if( utxo === undefined ) throw "bananas";

    const [ idStr, idxStr ] = (await readFile("./testnet/last_ref_used", { encoding: "utf-8" })).split("#");
    const ref = new TxOutRef({
        id: idStr,
        index: parseInt( idxStr )
    });
    const nftPolicy = new Hash28( await readFile(`./testnet/oneShot_${ref}.policy`, { encoding: "utf-8" }) );

    const marketplace = makeMarketplace(
        PCurrencySymbol.from( tokensOne.hash.toBuffer() ),
        PTokenName.from( tokenName ),
        PPubKeyHash.from( publicKey.hash.toBuffer() ),
        PCurrencySymbol.from( nftPolicy.toBuffer() ),
        PTokenName.from( tokenName )
    );

    const marketplaceAddr = new Address(
        "testnet",
        PaymentCredentials.script( marketplace.hash )
    );
    const marketplaceFileName = `marketplace`;

    await cli.utils.writeScript( marketplace,      `./testnet/${marketplaceFileName}.plutus.json` );
    await cli.utils.writeAddress( marketplaceAddr, `./testnet/${marketplaceFileName}.addr` );

    const txBuilder = new TxBuilder(
        "testnet",
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
        `./testnet/${marketplaceFileName}.utxoRef`,
        `${tx.hash}#0`,
        { encoding: "utf-8" }
    );

}
main();