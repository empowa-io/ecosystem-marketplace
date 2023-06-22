
import { Address, DataConstr, DataI, Tx, TxBuilder, TxOutRef, UTxO } from "@harmoniclabs/plu-ts";
import { tryGetMarketplaceConfig } from "./utils/tryGetMarketplaceConfig";
import { readFile } from "fs/promises";
import { koios } from "./providers/koios";
import { getUpdateListingTx } from "./updateListing";

export async function getUpdateListingTxCLI(
    txBuilder: TxBuilder,
    newPrice: number | bigint,
    listingUtxo: UTxO,
    collateral: UTxO,
    ownerAddress: Address
): Promise<Tx>
{
    const env = tryGetMarketplaceConfig().envFolderPath;

    const [ mIdStr, mIdxStr ] = (await readFile(`${env}/marketplace.utxoRef`, { encoding: "utf-8" })).split("#");
    const marketplaceRef = new TxOutRef({
        id: mIdStr,
        index: parseInt( mIdxStr )
    });

    return await getUpdateListingTx(
        txBuilder,
        newPrice,
        marketplaceRef,
        listingUtxo,
        collateral,
        ownerAddress
    );
}