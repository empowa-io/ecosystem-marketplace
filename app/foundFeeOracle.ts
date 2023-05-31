import { Address, DataB, DataI, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PaymentCredentials, TxBuilder, TxOutRef, Value, pData } from "@harmoniclabs/plu-ts";
import { cli } from "./providers/cli";
import { koios } from "./providers/koios";
import { readFile, writeFile } from "fs/promises";
import { tokenName } from "./constants";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { getProtocolParams } from "./utils/getProtocolParams";

async function main()
{
    const privateKey = cli.utils.readPrivateKey("./secret_testnet/payment.skey");
    const publicKey = cli.utils.readPublicKey("./secret_testnet/payment.vkey");
    const addr = cli.utils.readAddress("./secret_testnet/payment.addr");

    const [ idStr, idxStr ] = (await readFile("./testnet/last_ref_used", { encoding: "utf-8" })).split("#");

    const ref = new TxOutRef({
        id: idStr,
        index: parseInt( idxStr )
    });

    const utxos = await koios.address.utxos( addr );

    console.log( utxos.map( u => JSON.stringify( u.toJson(), null, 2 ) ) );

    const nftPolicy = new Hash28( await readFile(`./testnet/oneShot_${ref}.policy`, { encoding: "utf-8" }) );

    const utxo = utxos.find( u => u.resolved.value.get( nftPolicy, tokenName ) === 1n )

    if( utxo === undefined ) throw "bananas";

    const feeOracle = makeFeeOracle(
        PCurrencySymbol.from( nftPolicy.toBuffer() ),
        PTokenName.from( tokenName ),
        PPubKeyHash.from( publicKey.hash.toBuffer() )
    );

    const feeOracleAddr = new Address(
        "testnet",
        PaymentCredentials.script( feeOracle.hash )
    );

    await cli.utils.writeScript( feeOracle, `./testnet/feeOracl.plutus.json` );
    await cli.utils.writeAddress( feeOracleAddr, `./testnet/feeOracle.addr` );

    const txBuilder = new TxBuilder(
        "testnet",
        await getProtocolParams()
    );

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
        outputs: [
            {
                address: feeOracleAddr,
                value: Value.lovelaces( 10_000_000 ),
                datum: new DataB(""), // invalid datum for the contract; always fails
                refScript: feeOracle
            },
            {
                address: feeOracleAddr,
                value: new Value([
                    Value.singleAssetEntry(
                        nftPolicy,
                        tokenName,
                        1
                    ),
                    Value.lovelaceEntry( 2_000_000 )
                ]),
                datum: new DataI( 25_000 ) // 2,5% fee
            }
        ],
        changeAddress: addr
    });

    tx.signWith( privateKey );

    await koios.tx.submit( tx );

    await writeFile(
        `./testnet/feeOracle.utxoRef`,
        `${tx.hash}#0`,
        { encoding: "utf-8" }
    );

    await new Promise( res => setTimeout( res, 1000 ) );
    await koios.tx.waitConfirmed( tx.hash, 40_000, 10, true );

}
main();