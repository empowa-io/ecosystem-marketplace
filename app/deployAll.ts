import { Tx, TxBuilder, TxOut, TxOutRef, UTxO } from "@harmoniclabs/plu-ts";
import { tryGetMarketplaceConfig } from "./utils/tryGetMarketplaceConfig";
import { withFolder } from "./utils/withFolder";
import { getProtocolParams } from "./utils/getProtocolParams";
import { koios } from "./providers/koios";
import { provider } from "./providers/provider";
import { getMintOneShotTx } from "./txns/getMintOneShotTx";
import { makeFeeOracleAndGetDeployTx } from "./txns/feeOracle/makeFeeOracleAndGetDeployTx";
import { makeMarketplaceAndGetDeployTx } from "./txns/marketplace/makeMarketplaceAndGetDeployTx";
import { BlockfrostPluts } from "@harmoniclabs/blockfrost-pluts";

function getOutAsUTxO( tx: Tx, idx: number ): UTxO
{
    return new UTxO({
        utxoRef: new TxOutRef({
            id: tx.hash.toString(),
            index: idx
        }),
        resolved: tx.body.outputs[ idx ]
    });
}

async function wait( n = 60 )
{
    console.log(`waiting ${n} seconds to allow for the transaction to be included in the chain`);
    await new Promise( res => setTimeout( res, n * 1000 ) );    
}

void async function main()
{
    const cfg = tryGetMarketplaceConfig();
    let _pps = provider instanceof BlockfrostPluts ?
        await provider:
        await koios;
    const isBlockFrost = provider instanceof BlockfrostPluts
    const env = cfg.envFolderPath;

    await  withFolder( env );

    const privateKey = cfg.signer.skey;
    const publicKey = cfg.signer.vkey;
    const addr = cfg.signer.address;
    
    const txBuilder = new TxBuilder(
        await getProtocolParams()
    );

    let utxos= isBlockFrost ? await (_pps as BlockfrostPluts).addressUtxos(addr) : await koios.address.utxos( addr );
    
    // let utxos = await koios.address.utxos( addr );
    console.log("UTXOs: ", utxos)
    const initialUtxo = utxos[0]

    console.log(`using utxo '${initialUtxo.utxoRef}' as initial utxo parameter`);

    let { tx, nftPolicySource } = await getMintOneShotTx(
        txBuilder,
        initialUtxo,
        addr
    );

    tx.signWith( privateKey );

    let txHash = isBlockFrost? await (_pps as BlockfrostPluts).submitTx(tx) : await koios.tx.submit( tx );

    console.log([
        `-------------------------------------------------------------------------`,
        `submitted tx that mints the feeOracle NFT identifyier;`,
        `tx hash: ${txHash}`,
        `-------------------------------------------------------------------------`
    ].join("\n"));

    await wait();

    tx = await makeFeeOracleAndGetDeployTx(
        txBuilder,
        getOutAsUTxO( tx, 0 ),
        addr,
        nftPolicySource.hash,
        publicKey
    );

    tx.signWith( privateKey );

    // txHash = await koios.tx.submit( tx );
    txHash = isBlockFrost? await (_pps as BlockfrostPluts).submitTx(tx) : await koios.tx.submit( tx );
    console.log([
        `-------------------------------------------------------------------------`,
        `submitted tx that deploys the feeOracle contract;`,
        `tx hash: ${txHash}`,
        `source was deployed to utxo: ${txHash}#0`,
        `at the feeOracleAddress: ${tx.body.outputs[0].address};`,
        `the oracle utxo is: ${txHash}#1`,
        `-------------------------------------------------------------------------`
    ].join("\n"));

    await wait();

    tx = await makeMarketplaceAndGetDeployTx(
        txBuilder,
        getOutAsUTxO( tx, 2 ),
        addr,
        initialUtxo.utxoRef,
        publicKey
    );

    tx.signWith( privateKey );

    // txHash = await koios.tx.submit( tx );
    txHash = isBlockFrost? await (_pps as BlockfrostPluts).submitTx(tx) : await koios.tx.submit( tx );

    console.log([
        `-------------------------------------------------------------------------`,
        `submitted tx that deploys the marketplace;`,
        `tx hash: ${txHash}`,
        `source was deployed to utxo: ${txHash}#0`,
        `at the marketplaceAddress: ${tx.body.outputs[0].address}`,
        `-------------------------------------------------------------------------`
    ].join("\n"));
}()