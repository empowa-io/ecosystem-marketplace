import { Address, Hash28, PrivateKey, PublicKey } from "@harmoniclabs/plu-ts";

export interface MarketplaceSigner {
    skey: PrivateKey,
    vkey?: PublicKey,
    address: Address,
}

export interface MarketplaceConfig {
    envFolderPath: string,
    signer: MarketplaceSigner,
    ownerAddress: Address,
    paymentAsset: {
        policy: Hash28 | "",
        tokenName: Uint8Array
    },
    feeNumerator: number
};