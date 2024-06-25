import { Address, DataB, Script, Tx, TxBuilder, UTxO, Value } from "@harmoniclabs/plu-ts";


export async function getDeployMarketplaceTestTx(
    txBuilder: TxBuilder,
    utxo: UTxO,
    addr: Address,
    marketplaceAddr: Address,
    marketplaceSource: Script
): Promise<Tx>
{
    return txBuilder.buildSync({
        inputs: [{ utxo }],
        outputs: [
            {
                address: marketplaceAddr,
                value: Value.lovelaces( 10_000_000 ),
                datum: new DataB(""), // invalid datum for the contract; always fails
                refScript: marketplaceSource
            }
        ],
        changeAddress: addr
    })
}