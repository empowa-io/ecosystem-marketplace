import { Address, DataB, DataConstr, DataI, Hash28, ITxBuildInput, PubKeyHash, PublicKey, Tx, TxBuilder, UTxO, Value, pDataB, pDataI } from "@harmoniclabs/plu-ts";

export interface GetListTxArgs {
    changeAddress: Address,
    marketplaceAddr: Address,
    nftPolicy: Uint8Array,
    nftName: Uint8Array,
    seller: Address,
    price: number | bigint,
    lisingUtxo: UTxO,
    additionalInputs?: ITxBuildInput[]
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
        additionalInputs
    }: GetListTxArgs
): Tx
{
    additionalInputs = Array.isArray( additionalInputs ) ? additionalInputs : [];

    const inputs = [{ utxo: lisingUtxo }].concat( additionalInputs );
    
    const inputsValues = inputs.map( i => i.utxo.resolved.value );
    const totInput = inputsValues.reduce( Value.add );
    
    return txBuilder.buildSync({
        inputs,
        collaterals: [ lisingUtxo ],
        collateralReturn: {
            address: changeAddress,
            value: Value.sub(
                totInput,
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
                        seller.toData(), // seller
                        new DataB( nftPolicy ), // policy
                        new DataB( nftName ), // tokenName
                    ]
                )
            }
        ],
        changeAddress: changeAddress
    });
}