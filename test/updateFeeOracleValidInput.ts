import { Address, DataI, Hash28, Tx, TxBuilder, TxOutRef, UTxO } from "@harmoniclabs/plu-ts";
import { getProtocolParams } from "../app/utils/getProtocolParams";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { readFile } from "fs/promises";
import { koios } from "../app/providers/koios";
import { tokenName } from "../app/constants";

export async function getFeeUpdateValidTx(
    txBuilder: TxBuilder,
    newFee: number,
    collateral: UTxO,
    feeOracleInput: UTxO,
    feeOracleSource : UTxO
): Promise<Tx>
{

    const nextDatum = new DataI( newFee );

    const inputUtxo = feeOracleInput ;
    /*return txBuilder.buildSync({
        inputs: [ {inputUtxo}],
        collaterals: [ collateral ],
        readonlyRefInputs : [feeOracleSource],
        outputs: [
            {
                address: feeOracleInput.resolved.address,
                value: feeOracleInput.resolved.value,
                datum: nextDatum
            }
        ],
        changeAddress: collateral.resolved.address
    }); */
    const feeOracleAddr = feeOracleInput.resolved.address
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

