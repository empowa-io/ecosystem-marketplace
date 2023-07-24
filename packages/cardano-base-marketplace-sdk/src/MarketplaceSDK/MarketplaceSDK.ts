import { Address, ITxBuildInput, PubKeyHash, PublicKey, Tx, TxBuilder, UTxO } from "@harmoniclabs/plu-ts";
import { getListTx } from "../txns/getListTx";
import { getUpdateListingTx } from "../txns/getUpdateListingTx";
import { getBuyTx } from "../txns/getBuyTx";
import { getCancelListingTx } from "../txns/getCancelListingTx";

export interface SDKConfigMarketplace {
    address: Address,
    refUtxoSource: UTxO
}

export interface SDKConfigPaymentAsset {
    policy: Uint8Array,
    name: Uint8Array
}

export interface MarketplaceSDKConfig {
    txBuilder: TxBuilder
    marketplace: SDKConfigMarketplace,
    feeOracleRefUtxo: UTxO,
    paymentAsset: SDKConfigPaymentAsset,
    protocolOwnerAddress: Address
}

export interface ListArgs {
    changeAddress: Address,
    lisingUtxo: UTxO,
    nftName: Uint8Array,
    nftPolicy: Uint8Array,
    price: bigint | number,
    seller: PublicKey | PubKeyHash | Address,
    additionalInputs?: ITxBuildInput[]
}

export interface UpdateArgs {
    listingUtxo: UTxO
    collateral: UTxO,
    newPrice: number | bigint,
    assetOwnerAddr: Address
}

export interface BuyArgs {
    listingUtxo: UTxO,
    collateral: UTxO,
    buyerAddress: Address,
    nftPolicy: Uint8Array,
    nftName: Uint8Array,
    sellerAddress: Address
}

export interface CancelArgs {
    listingUtxo: UTxO
    collateral: UTxO,
    assetOwnerAddr: Address
}

export class MarketplaceSDK
{
    readonly cfg!: MarketplaceSDKConfig

    constructor( cfg: MarketplaceSDKConfig )
    {
        Object.defineProperty(
            this, "cfg", {
                value: Object.freeze( cfg ),
                writable: false,
                enumerable: true,
                configurable: false
            }
        );
    }

    list( args: ListArgs ): Tx
    {
        return getListTx(
            this.cfg.txBuilder,
            {
                ...args,
                marketplaceAddr: this.cfg.marketplace.address
            }
        )
    }

    update( args: UpdateArgs ): Tx
    {
        return getUpdateListingTx(
            this.cfg.txBuilder,
            {
                ...args,
                marketplaceSourceRefUtxo: this.cfg.marketplace.refUtxoSource,
                marketplaceAddr: this.cfg.marketplace.address,
            }
        );
    }

    buy( args: BuyArgs ): Tx
    {
        return getBuyTx(
            this.cfg.txBuilder,
            {
                ...args,
                deployedMarketplaceUTxO: this.cfg.marketplace.refUtxoSource,
                oracleUtxo: this.cfg.feeOracleRefUtxo,
                paymentTokenPolicy: this.cfg.paymentAsset.policy,
                paymentTokenName: this.cfg.paymentAsset.name,
                protocolOwnerAddress: this.cfg.protocolOwnerAddress,
            }
        )
    }

    cancel( args: CancelArgs ): Tx
    {
        return getCancelListingTx(
            this.cfg.txBuilder,
            {
                ...args,
                marketplaceSourceRefUtxo: this.cfg.marketplace.refUtxoSource
            }
        )
    }

}