
import { Address, DataConstr, DataI, Tx, TxBuilder, TxOutRef, UTxO } from "@harmoniclabs/plu-ts";
import { koios } from "./providers/koios";

export async function getUpdateListingTx(
    txBuilder: TxBuilder,
    newPrice: number | bigint,
    marketplaceRef: TxOutRef,
    listingUtxo: UTxO,
    collateral: UTxO,
    ownerAddress: Address
): Promise<Tx>
{
    const marketplaceAddr = listingUtxo.resolved.address;

    const utxos = await koios.address.utxos( marketplaceAddr );

    const marketplaceSource = utxos.find( u => u.resolved.refScript && u.utxoRef.toString() === marketplaceRef.toString() );

    if(!marketplaceSource) throw new Error("missing marketplace source utxo");

    const initialDatum = listingUtxo.resolved.datum;

    if(!( initialDatum instanceof DataConstr )) throw new Error("listing utxo datum is not inline");

    const initialDatumFields = initialDatum.fields;

    return await txBuilder.build({
        inputs: [
            {
                utxo: listingUtxo,
                referenceScriptV2: {
                    refUtxo: marketplaceSource,
                    datum: "inline",
                    /**
                     * close redeemer can also be used to update a listed asset (and is more efficient than `Update`)
                     * 
                     * however the contract will not check that the asset is sent back to the contract
                     * (which it does if using the `SaleAction.Update({ newPrice })`, or  `new DataConstr(2, [ new DataI( newPrice ) ] )` redeemer)
                    **/
                    redeemer: new DataConstr( 1, [] ) // SaleAction.Close({})
                }
            },
            { utxo: collateral }
        ],
        outputs: [
            {
                address: marketplaceAddr,
                value: listingUtxo.resolved.value,
                datum: new DataConstr(
                    0,
                    [
                        new DataI( newPrice ), // price
                        initialDatumFields[1], // seller
                        initialDatumFields[2], // policy
                        initialDatumFields[3], // tokenName
                    ]
                )
            }
        ],
        collaterals: [ collateral ],
        requiredSigners: [ ownerAddress.paymentCreds.hash ],
        changeAddress: ownerAddress
    })
}