import { Data } from "@anastasia-labs/lucid-cardano-fork";
import {
  DataConstr,
  DataI,
  Tx,
  TxBuilder,
  UTxO,
} from "@harmoniclabs/plu-ts";

// valid input and datum
export async function getFeeUpdateTxTest(
 // lucid: Lucid,
  txBuilder: TxBuilder,
  newFee: number,
  //ownerPkh: Hash28,
  collateral: UTxO,
  feeOracleInput: UTxO,
  feeOracleSource: UTxO
  // feeOracleAddr : Address
): Promise<Tx> {

  const nextDatum = new DataI(newFee);

   const utxo = feeOracleInput;

  return txBuilder.buildSync({
    inputs: [{utxo}],
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
  /*
  return await txBuilder.build({
    inputs: [
      {
        utxo: feeOracleInput,
        referenceScriptV2: {
          refUtxo: feeOracleSource,
          datum:"inline",
         redeemer: Data.void(),
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
  });*/

}

//1. bad datum
//2. output redirected to change addr
//3. valid case --> updated correct datum
