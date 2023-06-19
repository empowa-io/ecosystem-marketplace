import { DataB, DataConstr, DataI, Hash28, PubKeyHash, Tx, TxBuilder, TxOutRef, Value, isData } from "@harmoniclabs/plu-ts";
import { cli } from "./providers/cli";
import { koios } from "./providers/koios";
import { readFile } from "fs/promises";
import { tokenName } from "./constants";
import { getProtocolParams } from "./utils/getProtocolParams";
import { SaleAction } from "../src/contracts/marketplace";
import Blockfrost from "@blockfrost/blockfrost-js";
import { tryGetMarketplaceConfig } from "./utils/tryGetMarketplaceConfig";

const API = new Blockfrost.BlockFrostAPI({
    projectId: "previewD7dYruaqECLZTKOzpDZfoDekk9hA78TR", // see: https://blockfrost.io
});

async function main()
{
    const cfg = tryGetMarketplaceConfig();

    const env = cfg.envFolderPath;

    const privateKey = cfg.signer.skey;
    const publicKey = cfg.signer.vkey;
    const addr = cfg.signer.address;

    console.log( publicKey.hash.toString() );

    const myUtxos = await koios.address.utxos( addr );

    const marketplaceRefStr = await readFile(`${env}/marketplace.utxoRef`, { encoding: "utf-8" });
    let [ idStr, idxStr ] = marketplaceRefStr.split("#");

    const marketplaceRef = new TxOutRef({
        id: idStr,
        index: parseInt( idxStr )
    });

    const _deployedMarketplaceTx = (await koios.tx.utxos( marketplaceRef.id ))[0]

    const deployedMarketplaceUTxO = _deployedMarketplaceTx.outputs
        .find( out => 
            out.utxoRef.id.toString() === idStr && 
            out.resolved.refScript
        );

    if( deployedMarketplaceUTxO === undefined ) throw "kiwis";

    const marketplaceAddr = cli.utils.readAddress("./testnet/marketplace.addr"); 

    const marketplaceUtxos = await koios.address.utxos( marketplaceAddr );

    const lastNftPolicyRef = await readFile("./testnet/last_ref_used", { encoding: "utf-8" });
    const lastNftPolicy = new Hash28( await readFile(`${env}/feeOracleNftId_${lastNftPolicyRef}.policy`, { encoding: "utf-8" }) );

    const spendingUtxo = marketplaceUtxos.find( u => u.resolved.value.get( lastNftPolicy, tokenName ) === 1n );

    if( spendingUtxo === undefined ) throw "papayas";
    
    const nftParamRefStr = await readFile("./testnet/feeOracle_nft_param", { encoding: "utf-8" });
    const feeOracleNftPolicy = new Hash28( await readFile(`${env}/feeOracleNftId_${nftParamRefStr}.policy`, { encoding: "utf-8" }) );

    const feeOracleAddr = cli.utils.readAddress("./testnet/feeOracle.addr"); 
    const feeOracleUtxos = await koios.address.utxos( feeOracleAddr );
    
    const oracleUtxo = feeOracleUtxos.find( u => u.resolved.value.get( feeOracleNftPolicy, tokenName ) === 1n );

    if( oracleUtxo === undefined ) throw "peppermints";
    
    const pp =  await koios.epoch.protocolParams();

    pp.costModels = {
        PlutusScriptV2: pp.costModels.PlutusScriptV2
    };

    console.log(
        JSON.stringify( pp, (k,v) => typeof v === "bigint" ? v.toString() : v, 2 )
    );
    const txBuilder = new TxBuilder(
        "testnet",
        pp
    );

    const collateral = myUtxos[0];

    const fakeTokenPolicy = new Hash28( await readFile(`${env}/fake.policy`, { encoding: "utf-8" }) );

    const nftSaleDatum = spendingUtxo.resolved.datum;

    const feeNumeratorDatum = oracleUtxo.resolved.datum;

    if(!( nftSaleDatum instanceof DataConstr && feeNumeratorDatum instanceof DataI )) throw "watermelons";

    const feeNumerator = feeNumeratorDatum.int;

    const saleFields = nftSaleDatum.fields;

    if(!( saleFields[0] instanceof DataI )) throw "cherrys";

    const fullPrice = saleFields[0].int;
    
    const protocolFeeAmt = fullPrice * feeNumerator / 1_000_000n;

    const finalPrice = fullPrice - protocolFeeAmt;

    let tx = txBuilder.buildSync({
        inputs: [{
            utxo: spendingUtxo,
            referenceScriptV2: {
                refUtxo: deployedMarketplaceUTxO,
                redeemer: SaleAction.Buy({}),
                datum: "inline"
            }
        }, { utxo: collateral }],
        collaterals: [ collateral ],
        collateralReturn: {
            address: addr,
            value: Value.sub(
                collateral.resolved.value,
                Value.lovelaces( 15_000_000 )
            )
        },
        readonlyRefInputs: [ oracleUtxo ],
        requiredSigners: [ new PubKeyHash( publicKey.hash ) ],
        outputs: [
            // nft to buyer
            {
                address: addr,
                value: new Value([
                    Value.lovelaceEntry( 2_000_000 ),
                    Value.singleAssetEntry(
                        lastNftPolicy,
                        tokenName,
                        1
                    )
                ])
            },
            // paid protocol treasurery
            {
                address: addr,
                value: new Value([
                    Value.lovelaceEntry( 2_000_000 ),
                    Value.singleAssetEntry(
                        fakeTokenPolicy,
                        tokenName,
                        protocolFeeAmt
                    )
                ])
            },
            // paid seller
            {
                address: addr,
                value: new Value([
                    Value.lovelaceEntry( 2_000_000 ),
                    Value.singleAssetEntry(
                        fakeTokenPolicy,
                        tokenName,
                        finalPrice
                    )
                ])
            },
        ],
        changeAddress: addr
    });

    tx = Tx.fromCbor(
        tx.toCbor().toString()
        .replace("f764973101d2c56bd4ab6b9958a284dbadac8ec9b0c968e6338295ac86cd7cf6","97211dc5da7d7a79c42df1ca5273caed4e38cdbdc5ca1a9192f98951a0e438dd")
    )
    tx.signWith( privateKey );

    // await API.txSubmit( tx.toCbor().toString() );

    console.log(
        await fetch(`https://preview.koios.rest/api/v0/submittx`, {
            method: "post",
            headers: {
            'Content-Type': 'application/cbor'
            },
            body: tx.toCbor().toBuffer().buffer
        }).then( res => res.text() )
    );

    await koios.tx.submit( tx );
    console.log( "tx submitted" )
}
main();