import { Address, DataB, DataI, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PaymentCredentials, TxBuilder, TxOutRef, Value, pData } from "@harmoniclabs/plu-ts";
import { cli } from "../app/providers/cli";
import { koios } from "../app/providers/koios";
import { readFile, writeFile } from "fs/promises";
import { tokenName } from "../app/constants";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { getProtocolParams } from "../app/utils/getProtocolParams";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getDeployFeeOracleTx } from "../app/txns/feeOracle/getDeployFeeOracleTx";
import { makeFeeOracleAndGetDeployTx } from "../app/txns/feeOracle/makeFeeOracleAndGetDeployTx";

async function main()
{
    const cfg = tryGetMarketplaceConfig();

    const env = cfg.envFolderPath;

    const privateKey = cfg.signer.skey;
    const publicKey = cfg.signer.vkey;
    const addr = cfg.signer.address;

    const [ idStr, idxStr ] = (await readFile(`${env}/last_ref_used`, { encoding: "utf-8" })).split("#");

    const ref = new TxOutRef({
        id: idStr,
        index: parseInt( idxStr )
    });

    const utxos = await koios.address.utxos( addr );

    console.log( utxos.map( u => JSON.stringify( u.toJson(), null, 2 ) ) );

    const nftPolicy = new Hash28( await readFile(`${env}/feeOracleNft_${ref}.policy`, { encoding: "utf-8" }) );

    const utxo = utxos.find( u => u.resolved.value.get( nftPolicy, tokenName ) === 1n )

    if( utxo === undefined ) throw "bananas";

    const txBuilder = new TxBuilder(
        await getProtocolParams()
    );

    const tx = await makeFeeOracleAndGetDeployTx(
        txBuilder,
        utxo,
        addr,
        nftPolicy,
        publicKey
    );

    tx.signWith( privateKey );

    await koios.tx.submit( tx );

    await writeFile(
        `${env}/feeOracle.utxoRef`,
        `${tx.hash}#0`,
        { encoding: "utf-8" }
    );

    await new Promise( res => setTimeout( res, 1000 ) );
    await koios.tx.waitConfirmed( tx.hash, 40_000, 10, true );

}
main();