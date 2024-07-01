import {
  Address,
  DataI,
  Hash28,
  Tx,
  TxBuilder,
  TxOutRef,
  UTxO,
} from "@harmoniclabs/plu-ts";
import { getProtocolParams } from "../app/utils/getProtocolParams";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { readFile } from "fs/promises";
import { koios } from "../app/providers/koios";
import { tokenName } from "../app/constants";
import { Lucid } from "@anastasia-labs/lucid-cardano-fork";

// valid input and datum
export async function getFeeUpdateTxTest(
  lucid: Lucid,
  txBuilder: TxBuilder,
  newFee: number,
  //ownerPkh: Hash28,
  collateral: UTxO,
  feeOracleInput: UTxO,
  feeOracleSource: UTxO
  // feeOracleAddr : Address
): Promise<Tx> {
  const nextDatum = new DataI(newFee);

  return await txBuilder.build({
    inputs: [
      {
        utxo: feeOracleInput,
        referenceScriptV2: {
          refUtxo: feeOracleSource,
          datum: "inline",
          redeemer: nextDatum,
        },
      },
      { utxo: collateral },
    ],
    collaterals: [collateral],
    outputs: [
      {
        address: feeOracleInput.resolved.address, //feeOracleAddr,
        value: feeOracleInput.resolved.value,
        datum: nextDatum,
      },
    ],
    changeAddress: collateral.resolved.address,
  });
  /*return await txBuilder.build({
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
        changeAddress: collateral.resolved.address
    }); */
}

//1. bad datum
//2. output redirected to change addr
//3. valid case --> updated correct datum
