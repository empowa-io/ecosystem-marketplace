import { Address, DataConstr, Tx, TxBuilder, TxOutRef, UTxO } from "@harmoniclabs/plu-ts";
import { NFTSale, SaleAction } from "../src/contracts/marketplace";
import { tryGetMarketplaceConfig } from "./utils/tryGetMarketplaceConfig";
import { readFile } from "fs/promises";
import { koios } from "./providers/koios";

export async function getCancelListingTx(
    txBuilder: TxBuilder,
    listingUtxo: UTxO,
    collateral: UTxO,
    ownerAddress: Address,
    marketplaceRef: TxOutRef
): Promise<Tx>
{
    /*
    const env = tryGetMarketplaceConfig().envFolderPath;
    
    const [ mIdStr, mIdxStr ] = (await readFile(`${env}/marketplace.utxoRef`, { encoding: "utf-8" })).split("#");

    const marketplaceRef = new TxOutRef({
        id: mIdStr,
        index: parseInt( mIdxStr )
    });
    */

    const marketplaceAddr = listingUtxo.resolved.address;

    const utxos = await koios.address.utxos( marketplaceAddr );

    const marketplaceSource = utxos.find( u => u.resolved.refScript && u.utxoRef.toString() === marketplaceRef.toString() );

    if(!marketplaceSource) throw new Error("missing marketplace source utxo");

    return await txBuilder.build({
        inputs: [
            {
                utxo: listingUtxo,
                referenceScriptV2: {
                    refUtxo: marketplaceSource,
                    datum: "inline",
                    redeemer: new DataConstr( 1, [] ) // SaleAction.Close({})
                }
            },
            { utxo: collateral }
        ],
        collaterals: [ collateral ],
        requiredSigners: [ ownerAddress.paymentCreds.hash ],
        changeAddress: ownerAddress
    });
}