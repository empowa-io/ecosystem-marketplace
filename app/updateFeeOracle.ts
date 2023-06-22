import { Address, DataI, Hash28, Tx, TxBuilder, TxOutRef, UTxO } from "@harmoniclabs/plu-ts";
import { getProtocolParams } from "./utils/getProtocolParams";
import { tryGetMarketplaceConfig } from "./utils/tryGetMarketplaceConfig";
import { readFile } from "fs/promises";
import { koios } from "./providers/koios";
import { tokenName } from "./constants";

export async function getFeeUpdateTx(
    txBuilder: TxBuilder,
    newFee: number,
    ownerPkh: Hash28,
    collateral: UTxO
): Promise<Tx>
{
    const env = tryGetMarketplaceConfig().envFolderPath;
        
    const [ foIdStr, foIdxStr ] = (await readFile(`${env}/feeOracle.utxoRef`, { encoding: "utf-8" })).split("#");

    const feeOracleRef = new TxOutRef({
        id: foIdStr,
        index: parseInt( foIdxStr )
    });

    const feeOracleAddr = Address.fromString(
        await readFile(`${env}/feeOracle.addr`, { encoding: "utf-8" })
    );

    const [ idStr, idxStr ] = (await readFile(`${env}/last_ref_used`, { encoding: "utf-8" })).split("#");

    const ref = new TxOutRef({
        id: idStr,
        index: parseInt( idxStr )
    });

    const feeOracleUtxos = await koios.address.utxos( feeOracleAddr );

    console.log( feeOracleUtxos.map( u => JSON.stringify( u.toJson(), null, 2 ) ) );

    const nftPolicy = new Hash28( await readFile(`${env}/feeOracleNft_${ref}.policy`, { encoding: "utf-8" }) );

    const feeOracleInput = feeOracleUtxos.find( u => u.resolved.value.get( nftPolicy, tokenName ) === 1n )

    if( feeOracleInput === undefined ) throw new Error("can't find oracle utxo on address " + feeOracleAddr.toString() );

    const feeOracleSource = feeOracleUtxos.find( u => u.utxoRef.toString() === feeOracleRef.toString() && u.resolved.refScript !== undefined );

    if( feeOracleSource === undefined ) throw new Error("can't find oracle source utxo on address " + feeOracleAddr.toString() );

    const nextDatum = new DataI( newFee );

    return await txBuilder.build({
        inputs: [
            {
                utxo: feeOracleInput,
                referenceScriptV2: {
                    refUtxo: feeOracleSource,
                    datum: "inline",
                    redeemer: nextDatum
                }
            },
            { utxo: collateral }
        ],
        collaterals: [ collateral ],
        outputs: [
            {
                address: feeOracleAddr,
                value: feeOracleInput.resolved.value,
                datum: nextDatum
            }
        ],
        changeAddress: collateral.resolved.address
    });
}