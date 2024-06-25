import { Address, Hash28, PAddress, PCurrencySymbol, PPubKeyHash, PTokenName, PaymentCredentials, PublicKey, Tx, TxBuilder, TxOutRef, UTxO, pData } from "@harmoniclabs/plu-ts";
import { getDeployMarketplaceTx } from "../app/txns/marketplace/getDeployMarketplaceTx";
import { readFile } from "fs/promises";
import { makeMarketplace } from "../src/contracts/marketplace";
import { tokenName } from "../app/constants";
import { cli } from "../app/providers/cli";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getDeployMarketplaceTestTx } from "./getDeployMarketplaceTest"

export async function makeMarketplaceAndGetDeployTestTx(
    txBuilder: TxBuilder,
    utxo: UTxO,
    addr: Address,
    refParam: TxOutRef
): Promise<Tx>
{
    const cfg = tryGetMarketplaceConfig();
    const env = cfg.envFolderPath;

    const nftPolicy = new Hash28( await readFile(`${env}/feeOracleNft_${refParam}.policy`, { encoding: "utf-8" }) );

    const marketplace = makeMarketplace(
        PCurrencySymbol.from( cfg.paymentAsset.policy.toString() ),
        PTokenName.from( cfg.paymentAsset.tokenName ),
        PAddress.fromData( pData( addr.toData() ) ),
        PCurrencySymbol.from( nftPolicy.toBuffer() ),
        PTokenName.from( tokenName )
    );

    const marketplaceAddr = new Address(
        cfg.network === "mainnet" ? "mainnet" : "testnet",
        PaymentCredentials.script( marketplace.hash )
    );

    await cli.utils.writeScript( marketplace,      `${env}/marketplace.plutus.json` );
    await cli.utils.writeAddress( marketplaceAddr, `${env}/marketplace.addr` );
    
    return await getDeployMarketplaceTestTx(
        txBuilder,
        utxo,
        addr,
        marketplaceAddr,
        marketplace
    );
}