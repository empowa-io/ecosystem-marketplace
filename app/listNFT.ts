import { Address, Hash28, TxBuilder, Value, pDataB, pDataI } from "@harmoniclabs/plu-ts";
import { cli } from "./providers/cli";
import { koios } from "./providers/koios";
import { readFile } from "fs/promises";
import { tokenName } from "./constants";
import { getProtocolParams } from "./utils/getProtocolParams";
import { NFTSale } from "../src/contracts/marketplace";

async function main()
{
    const privateKey = cli.utils.readPrivateKey("./secret_testnet/payment.skey");
    const publicKey = cli.utils.readPublicKey("./secret_testnet/payment.vkey");
    const addr = cli.utils.readAddress("./secret_testnet/payment.addr");

    const marketplaceAddr = cli.utils.readAddress("./testnet/marketplace.addr");
    const feeOracleAddr = cli.utils.readAddress("./testnet/feeOracle.addr");

    const feeOracleNftIdRefParam = await readFile("./testnet/feeOracleNftId_refParam", { encoding: "utf-8" });

    const oraclePolicy = new Hash28( await readFile(`${env}/feeOracleNftId_${feeOracleNftIdRefParam}.policy`, { encoding: "utf8" }) );

    const feeOracleUtxos = await koios.address.utxos( feeOracleAddr );

    const oracleUtxo = feeOracleUtxos.find( u => u.resolved.value.get( oraclePolicy.toString(), tokenName ) === 1n );

    if( oracleUtxo === undefined ) throw "apples";

    const utxos = await koios.address.utxos( addr );

    const nftPolicyRef = await readFile("./testnet/last_ref_used", { encoding: "utf-8" });

    const nftPolicy = cli.utils.readScript(`${env}/feeOracleNftId_${nftPolicyRef}.plutus.json`);

    const lisingUtxo = utxos.find( u => u.resolved.value.get( nftPolicy.hash.toString(), tokenName ) === 1n )

    console.log( nftPolicy.hash.toString() );
    console.log( utxos.map( u => JSON.stringify( u.toJson(), null, 2 ) ) );

    if( lisingUtxo === undefined ) throw "oranges";

    const txBuilder = new TxBuilder(
        "testnet",
        await getProtocolParams()
    );

    const tx = txBuilder.buildSync({
        inputs: [{ utxo: lisingUtxo }],
        collaterals: [ lisingUtxo ],
        collateralReturn: {
            address: addr,
            value: Value.sub(
                lisingUtxo.resolved.value,
                Value.lovelaces( 5_000_000 )
            )
        },
        outputs: [
            {
                address: marketplaceAddr,
                value: new Value([
                    Value.lovelaceEntry( 2_000_000 ),
                    Value.singleAssetEntry(
                        nftPolicy.hash,
                        tokenName,
                        1
                    )
                ]),
                datum: NFTSale.NFTSale({
                    policy:     pDataB( nftPolicy.hash.toBuffer() ),
                    price:      pDataI( 10_000 ),
                    seller:     pDataB( publicKey.hash.toBuffer() ),
                    tokenName:  pDataB( tokenName ),
                })
            }
        ],
        changeAddress: addr
    });

    tx.signWith( privateKey );

    await koios.tx.submit( tx );

    await new Promise( res => setTimeout( res, 5000 ) );
    await koios.tx.waitConfirmed( tx.hash, 40_000, 10, true );
}
main();