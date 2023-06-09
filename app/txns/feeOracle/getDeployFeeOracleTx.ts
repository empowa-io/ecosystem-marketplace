import { Address, DataB, DataI, Hash28, Script, Tx, TxBuilder, UTxO, Value } from "@harmoniclabs/plu-ts";
import { tokenName } from "../../constants";

export async function getDeployFeeOracleTx(
    txBuilder: TxBuilder,
    inputUtxo: UTxO,
    returnAddr: Address,
    feeOracleAddr: Address,
    feeOracleSource: Script,
    nftPolicy: Hash28
): Promise<Tx>
{
    const utxo = inputUtxo;
    const addr = returnAddr;
    
    return txBuilder.buildSync({
        inputs: [{ utxo }],
        collaterals: [ utxo ],
        collateralReturn: {
            address: addr,
            value: Value.sub(
                utxo.resolved.value,
                Value.lovelaces( 5_000_000 )
            )
        },
        outputs: [
            {
                address: feeOracleAddr,
                value: Value.lovelaces( 10_000_000 ),
                datum: new DataB(""), // invalid datum for the contract; always fails
                refScript: feeOracleSource
            },
            {
                address: feeOracleAddr,
                value: new Value([
                    Value.singleAssetEntry(
                        nftPolicy,
                        tokenName,
                        1
                    ),
                    Value.lovelaceEntry( 2_000_000 )
                ]),
                datum: new DataI( 25_000 ) // 2,5% fee
            }
        ],
        changeAddress: addr
    });
}