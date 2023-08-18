import { Address, DataConstr, DataI, Hash28, PubKeyHash, Tx, TxBuilder, UTxO, Value } from "@harmoniclabs/plu-ts";

export interface BuyTxArgs {
    listingUtxo: UTxO,
    deployedMarketplaceUTxO: UTxO,
    collateral: UTxO,
    buyerAddress: Address,
    oracleUtxo: UTxO,
    nftPolicy: Uint8Array,
    nftName: Uint8Array,
    paymentTokenPolicy: Uint8Array,
    paymentTokenName: Uint8Array,
    protocolOwnerAddress: Address,
    sellerAddress:Address
}

export function getBuyTx(
    txBuilder: TxBuilder,
    {
        listingUtxo,
        deployedMarketplaceUTxO,
        collateral,
        buyerAddress,
        oracleUtxo,
        nftPolicy,
        nftName,
        paymentTokenPolicy,
        paymentTokenName,
        protocolOwnerAddress,
        sellerAddress
    }: BuyTxArgs
): Tx
{
    const buyerPkh = new PubKeyHash( buyerAddress.paymentCreds.hash.toString() );

    const nftSaleDatum = listingUtxo.resolved.datum;

    const feeNumeratorDatum = oracleUtxo.resolved.datum;

    if(!(
        nftSaleDatum instanceof DataConstr &&
        feeNumeratorDatum instanceof DataI 
    ))
    {
        console.error( nftSaleDatum, feeNumeratorDatum );
        throw new Error("incorrect datums found in the passed utxos");
    }

    const feeNumerator = feeNumeratorDatum.int;

    const saleFields = nftSaleDatum.fields;

    if(!( saleFields[0] instanceof DataI ))
    {
        console.error( saleFields[0], nftSaleDatum );
        throw new Error("incorrect datums found in the passed utxos");
    }

    const fullPrice = saleFields[0].int;
    
    const protocolFeeAmt = fullPrice * feeNumerator / 1_000_000n;

    const finalPrice = fullPrice - protocolFeeAmt;

    return txBuilder.buildSync({
        inputs: [{
            utxo: listingUtxo,
            referenceScriptV2: {
                refUtxo: deployedMarketplaceUTxO,
                redeemer: new DataConstr( 0, [] ), // SaleAction.Buy({}),
                datum: "inline"
            }
        }, { utxo: collateral }],
        collaterals: [ collateral ],
        collateralReturn: {
            address: buyerAddress,
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
                address: buyerAddress,
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
                address: sellerAddress,
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
        changeAddress: buyerAddress
    });
}