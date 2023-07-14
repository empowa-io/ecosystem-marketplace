import { Address, Hash28, PubKeyHash, PublicKey, Tx, TxBuilder, UTxO, Value } from "@harmoniclabs/plu-ts";
import { SaleAction } from "../src/contracts/marketplace";

export function getBuyTx(
    txBuilder: TxBuilder,
    spendingUtxo: UTxO,
    deployedMarketplaceUTxO: UTxO,
    collateral: UTxO,
    returnAddress: Address,
    oracleUtxo: UTxO,
    buyer: PubKeyHash | PublicKey | Address,
    nftPolicy: Uint8Array,
    nftName: Uint8Array,
    paymentTokenPolicy: Uint8Array,
    paymentTokenName: Uint8Array,
    protocolFeeAmt: number | bigint,
    protocolOwnerAddress: Address,
    finalPrice: number | bigint

): Tx
{
    let buyerPkh: PubKeyHash = undefined as any;

    if( buyer instanceof PubKeyHash )   buyerPkh = buyer;
    if( buyer instanceof PublicKey )    buyerPkh = buyer.hash;
    if( buyer instanceof Address )      buyerPkh = buyer.paymentCreds.hash;
    if( !buyerPkh ) throw new Error("unable to derive 'buyerPkh' form " + buyer.toString())

    return txBuilder.buildSync({
        inputs: [{
            utxo: spendingUtxo,
            referenceScriptV2: {
                refUtxo: deployedMarketplaceUTxO,
                redeemer: SaleAction.Buy({}),
                datum: "inline"
            }
        }, { utxo: collateral }],
        collaterals: [ collateral ],
        collateralReturn: {
            address: returnAddress,
            value: Value.sub(
                collateral.resolved.value,
                Value.lovelaces( 15_000_000 )
            )
        },
        readonlyRefInputs: [ oracleUtxo ],
        requiredSigners: [ new PubKeyHash( buyerPkh ) ],
        outputs: [
            // nft to buyer
            {
                address: returnAddress,
                value: new Value([
                    Value.lovelaceEntry( 2_000_000 ),
                    Value.singleAssetEntry(
                        new Hash28( nftPolicy ),
                        nftName,
                        1
                    )
                ])
            },
            // paid protocol treasurery
            {
                address: protocolOwnerAddress,
                value: new Value([
                    Value.lovelaceEntry( 2_000_000 ),
                    Value.singleAssetEntry(
                        new Hash28( paymentTokenPolicy ),
                        paymentTokenName,
                        protocolFeeAmt
                    )
                ])
            },
            // paid seller
            {
                address: returnAddress,
                value: new Value([
                    Value.lovelaceEntry( 2_000_000 ),
                    Value.singleAssetEntry(
                        new Hash28( paymentTokenPolicy ),
                        paymentTokenName,
                        finalPrice
                    )
                ])
            },
        ],
        changeAddress: returnAddress
    })
}