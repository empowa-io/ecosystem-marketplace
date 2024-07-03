import {
    Address,
    DataB,
    DataI,
    Hash28,
    Script,
    Tx,
    TxBuilder,
    UTxO,
    Value,
  } from "@harmoniclabs/plu-ts";
  import { tokenName } from "../app/constants";
  
  export async function getDeployFeeOracleWrongOutput(
    txBuilder: TxBuilder,
    inputUtxo: UTxO,
    returnAddr: Address,
    feeOracleAddr: Address,
    feeOracleSource: Script,
    nftPolicy: Hash28
    //datum : number
  ): Promise<Tx> {
    const utxo = inputUtxo;
    const addr = returnAddr;
    //const inlineDatum = new DataI(datum);
  
    return txBuilder.buildSync({
      inputs: [{ utxo }],
      collaterals: [utxo],
      collateralReturn: {
        address: addr,
        value: Value.sub(utxo.resolved.value, Value.lovelaces(5_000_000)),
      },
      outputs: [
        {
          address: feeOracleAddr,
          value: Value.lovelaces(10_000_000),
          datum: new DataB(""), // invalid datum for the contract; always fails
          refScript: feeOracleSource,
        },
        {
          address: feeOracleAddr,
          value: new Value([
            Value.singleAssetEntry(nftPolicy, tokenName, 1),
            Value.lovelaceEntry(2_000_000),
          ]),
          datum: new DataI(25_000), // 2,5% fee //inlineDatum //
        },
      ],
      changeAddress: addr,
    });
  }
  