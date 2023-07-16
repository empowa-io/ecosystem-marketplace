import { Address, DataConstr, Tx, TxBuilder, UTxO } from "@harmoniclabs/plu-ts";

export interface CancelListingArgs {
    listingUtxo: UTxO
    marketplaceSourceRefUtxo: UTxO,
    collateral: UTxO,
    assetOwnerAddr: Address
}

export function getCancelListingTx(
    txBuilder: TxBuilder,
    {
        listingUtxo,
        marketplaceSourceRefUtxo,
        collateral,
        assetOwnerAddr
    }: CancelListingArgs
): Tx
{
    return txBuilder.buildSync({
        inputs: [
            {
                utxo: listingUtxo,
                referenceScriptV2: {
                    refUtxo: marketplaceSourceRefUtxo,
                    datum: "inline",
                    redeemer: new DataConstr( 1, [] ) // SaleAction.Close({})
                }
            },
            { utxo: collateral }
        ],
        collaterals: [ collateral ],
        requiredSigners: [ assetOwnerAddr.paymentCreds.hash ],
        changeAddress: assetOwnerAddr
    });
}