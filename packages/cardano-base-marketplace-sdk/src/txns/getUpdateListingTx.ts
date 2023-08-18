import { Address, DataConstr, DataI, ITxBuildInput, Tx, TxBuilder, UTxO } from "@harmoniclabs/plu-ts";

export interface UpdateListingArgs {
    listingUtxo: UTxO
    marketplaceSourceRefUtxo: UTxO,
    collateral: UTxO,
    marketplaceAddr: Address,
    newPrice: number | bigint,
    assetOwnerAddr: Address,
    additionalInputs?: ITxBuildInput[]
}

export function getUpdateListingTx(
    txBuilder: TxBuilder,
    {
        listingUtxo,
        marketplaceSourceRefUtxo,
        collateral,
        marketplaceAddr,
        newPrice,
        assetOwnerAddr,
        additionalInputs
    }: UpdateListingArgs
): Tx
{
    const inputs: ITxBuildInput[] = [
        {
            utxo: listingUtxo,
            referenceScriptV2: {
                refUtxo: marketplaceSourceRefUtxo,
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
        ...(additionalInputs ?? [])
    ];

    if( listingUtxo.utxoRef.toString() !== collateral.utxoRef.toString() )
    {
        inputs.push({ utxo: collateral });
    }

    const initialDatum = listingUtxo.resolved.datum;

    if(!( initialDatum instanceof DataConstr )) throw new Error("listing utxo datum is not inline");

    const initialDatumFields = initialDatum.fields;

    return txBuilder.buildSync({
        inputs,
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
        requiredSigners: [ assetOwnerAddr.paymentCreds.hash ],
        changeAddress: assetOwnerAddr
    })
}