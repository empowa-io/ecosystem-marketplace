import { Address, Hash28, TxBuilder, Value, pDataB, pDataI } from "@harmoniclabs/plu-ts";
import { cli } from "./providers/cli";
import { koios } from "./providers/koios";
import { readFile } from "fs/promises";
import { tokenName } from "./constants";
import { getProtocolParams } from "./utils/getProtocolParams";
import { NFTSale } from "../src/contracts/marketplace";
import { tryGetMarketplaceConfig } from "./utils/tryGetMarketplaceConfig";
import { getListNFTTx } from "./getListNFTTx";

async function main()
{
    const cfg = tryGetMarketplaceConfig();

    const env = cfg.envFolderPath;

    const privateKey = cfg.signer.skey;
    const publicKey = cfg.signer.vkey;
    const addr = cfg.signer.address;

    const marketplaceAddr = cli.utils.readAddress(`${env}/marketplace.addr`);
    const feeOracleAddr = cli.utils.readAddress(`${env}/feeOracle.addr`);

    const feeOracleNftRefParam = await readFile(`${env}/feeOracleNft_refParam`, { encoding: "utf-8" });

    const oraclePolicy = new Hash28( await readFile(`${env}/feeOracleNft_${feeOracleNftRefParam}.policy`, { encoding: "utf8" }) );

    const feeOracleUtxos = await koios.address.utxos( feeOracleAddr );

    const oracleUtxo = feeOracleUtxos.find( u => u.resolved.value.get( oraclePolicy.toString(), tokenName ) === 1n );

    if( oracleUtxo === undefined ) throw "apples";

    const utxos = await koios.address.utxos( addr );

    const nftPolicyRef = await readFile(`${env}/last_ref_used`, { encoding: "utf-8" });

    const nftPolicy = cli.utils.readScript(`${env}/feeOracleNft_${nftPolicyRef}.plutus.json`);

    const lisingUtxo = utxos.find( u => u.resolved.value.get( nftPolicy.hash.toString(), tokenName ) === 1n )

    console.log( nftPolicy.hash.toString() );
    console.log( utxos.map( u => JSON.stringify( u.toJson(), null, 2 ) ) );

    if( lisingUtxo === undefined ) throw "oranges";

    const txBuilder = new TxBuilder( await getProtocolParams() );

    const tx = getListNFTTx(
        txBuilder,
        {
            changeAddress: addr,
            lisingUtxo,
            marketplaceAddr,
            nftName: tokenName,
            nftPolicy: nftPolicy.hash.toBuffer(),
            price: 10_000,
            seller: publicKey
        }
    );

    tx.signWith( privateKey );

    await koios.tx.submit( tx );

    await new Promise( res => setTimeout( res, 5000 ) );
    await koios.tx.waitConfirmed( tx.hash, 40_000, 10, true );
}
main();