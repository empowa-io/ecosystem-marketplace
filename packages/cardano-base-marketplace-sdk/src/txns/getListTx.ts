import { Address, DataB, DataConstr, DataI, Hash28, PubKeyHash, PublicKey, Tx, TxBuilder, UTxO, Value, pDataB, pDataI } from "@harmoniclabs/plu-ts";

export interface GetListTxArgs {
    changeAddress: Address,
    marketplaceAddr: Address,
    nftPolicy: Uint8Array,
    nftName: Uint8Array,
    seller: PublicKey | PubKeyHash | Address,
    price: number | bigint,
    lisingUtxo: UTxO
}

export function getListTx(
    txBuilder: TxBuilder,
    {
        changeAddress,
        marketplaceAddr,
        nftPolicy,
        nftName,
        seller,
        price,
        lisingUtxo,
    }: GetListTxArgs
): Tx
{
    seller = seller instanceof Address ? seller.paymentCreds.hash : seller;
    seller = seller instanceof PublicKey ? seller.hash : seller;

    return txBuilder.buildSync({
        inputs: [{ utxo: lisingUtxo }],
        collaterals: [ lisingUtxo ],
        collateralReturn: {
            address: changeAddress,
            value: Value.sub(
                lisingUtxo.resolved.value,
                Value.lovelaces( 5_000_000 )
            )
        },
        outputs: [
            {
                address: marketplaceAddr,
                value: new Value([
                    Value.lovelaceEntry( 2_000_000 ),
                    Value.singleAssetEntry(
                        new Hash28( nftPolicy ),
                        nftName,
                        1
                    )
                ]),
                datum: new DataConstr(
                    0, // NFTSale.NFTSale
                    [ // DO NOT CHANGE ORDER
                        new DataI( price ), // price
                        new DataB( seller.toBuffer() ), // seller
                        new DataB( nftPolicy ), // policy
                        new DataB( nftName ), // tokenName
                    ]
                )
            }
        ],
        changeAddress: changeAddress
    });
}