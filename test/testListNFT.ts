import { Address, TxBuilder, Hash28, UTxO, PAddress, PCurrencySymbol, PTokenName, pData } from "@harmoniclabs/plu-ts";
import { tokenName } from "../app/constants";
import { getProtocolParams } from "../app/utils/getProtocolParams";
import { getListNFTTx, GetListNFTArgs } from "../app/getListNFTTx";
import { Lucid } from "@anastasia-labs/lucid-cardano-fork";

export async function testListNFT(
    lucid: Lucid,
    signerAddr: Address, // return Address and seedphrase together? lucid.fromTx(tx.toCbor().toString())
    marketplaceAddr: Address,
    nftPolicy: Hash28,
    listingPrice: number,
    utxoWithNft: UTxO
): Promise<Tx> {
    // select the signer's wallet
    lucid.selectWalletFromSeed(signerAddr.seedPhrase);
    console.log("Selected wallet: ", signerAddr);

    //  TxBuilder
    const txBuilder: TxBuilder = new TxBuilder(await getProtocolParams());

    //  GetListNFTArgs to be passed into getListNFTTx
    const listNFTArgs: GetListNFTArgs = {
        changeAddress: Address.fromString(signerAddr.address), changeAddress: Address.fromString(signerAddr.address), // changeAddress as in which wallet to send collateral backto
        marketplaceAddr,
        nftPolicy: nftPolicy.toBuffer(),
        nftName: tokenName,
        seller: Address.fromString(signerAddr.address),
        price: listingPrice,
        lisingUtxo: utxoWithNft
    };

    // Create the listing transaction
    return getListNFTTx(txBuilder, listNFTArgs);
}