import { Address, Hash28, PubKeyHash, PublicKey, Tx, TxBuilder, UTxO, Value, pDataB, pDataI } from "@harmoniclabs/plu-ts";
import { NFTSale } from "../src/contracts/marketplace";

export interface GetListNFTArgs {
    changeAddress: Address,
    marketplaceAddr: Address,
    nftPolicy: Uint8Array,
    nftName: Uint8Array,
    seller: PublicKey | PubKeyHash,
    price: number | bigint,
    lisingUtxo: UTxO
}

export function getListNFTTx(
    txBuilder: TxBuilder,
    {
        changeAddress,
        marketplaceAddr,
        nftPolicy,
        nftName,
        seller,
        price,
        lisingUtxo,
    }: GetListNFTArgs
): Tx
{
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
                datum: NFTSale.NFTSale({
                    policy:     pDataB( nftPolicy ),
                    price:      pDataI( price ),
                    seller:     pDataB( seller.toBuffer() ),
                    tokenName:  pDataB( nftName ),
                })
            }
        ],
        changeAddress: changeAddress
    });
}