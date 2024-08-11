import { Emulator, Lucid, Tx as LTx } from "@anastasia-labs/lucid-cardano-fork";

import {
  Address,
  Hash28,
  Tx,
  TxBuilder,
  UTxO,
  Value,
  pData,
  pDataB,
  pDataI,
} from "@harmoniclabs/plu-ts";
import { NFTSale } from "../src/contracts/marketplace";
import {
  LucidContext,
  initiateFeeOracle,
  FeeOracleInitiationOutcome,
  initiateMarketplace,
  MarketplaceInitiationOutcome,
  generateAccountSeedPhrase,
  lutxoToUTxO,
} from "./utils.ts";

import { beforeEach, test } from "vitest";

import { getProtocolParams } from "../app/utils/getProtocolParams";


async function getListNFTTx(
  changeAddress: Address,
  listingUTxO: UTxO,
  marketplaceAddress: Address,
  nftName: Uint8Array, //minted NFTs tokenName
  nftPolicy: Uint8Array, //minted NFTs policy
  listingPrice: number | bigint,
  listersAddress: Address
): Promise<Tx> {
  const listingTxBuilder = new TxBuilder(await getProtocolParams());

  return listingTxBuilder.buildSync({
    inputs: [{ utxo: listingUTxO }],
    collaterals: [listingUTxO],
    collateralReturn: {
      address: changeAddress,
      value: Value.sub(listingUTxO.resolved.value, Value.lovelaces(5_000_000)),
    },
    outputs: [
      {
        address: marketplaceAddress,
        value: new Value([
          Value.lovelaceEntry(2_000_000),
          Value.singleAssetEntry(new Hash28(nftPolicy), nftName, 1),
        ]),
        datum: NFTSale.NFTSale({
          policy: pDataB(nftPolicy),
          price: pDataI(listingPrice),
          seller: pData(listersAddress.toData()),
          tokenName: pDataB(nftName),
        }),
      },
    ],
    changeAddress: changeAddress,
  });
}


beforeEach<LucidContext>(async (context) => {
  const createUser = async () => {
    return await generateAccountSeedPhrase({ lovelace: BigInt(100_000_000) });
  };
  context.users = {
    lister: await createUser(), //user who lists their NFT
    owner: await createUser(), //user who mints and deploys the fee oracle and the marketplace
    adversary: await createUser(),
  };

  context.emulator = new Emulator([
    context.users.lister,
    context.users.owner,
    context.users.adversary, //use this user profile for the unhappy test path, adversary setting marketplace fee to 0% without having the Beacon UTxO
  ]);

  context.lucid = await Lucid.new(context.emulator);
});

test<LucidContext>("Test - List NFT on Marketplace", async ({
  lucid,
  users,
  emulator,
}) => {

  // Setup Fee Oracle
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
      await initiateFeeOracle(emulator, lucid, users.owner, false);
  
  // Setup Marketplace
  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome = 
      await initiateMarketplace(emulator, lucid, users.owner);

  const marketplaceAddress = marketplaceInitiationOutcome.marketplaceAddr;
  
  // Select the signer wallet (the user that lists the NFT)
  lucid.selectWalletFromSeed(users.lister);

  // Get lister's UTxOs and convert the first one to a plu-ts UTxO format
  const listersInitialUTxOs = await lucid.wallet.getUtxos();
  const listerRefLUTxO = await listersInitialUTxOs[0];
  const listerRefUTxO = await lutxoToUTxO(listerRefLUTxO);

  // Mint an NFT for the seller via refUTxO (Need to implement this function, should return a ListNftPolicyHash, ListNftTokenName,tx etc.)
  // const listNftTx = await mintListNft();
  // ...
  // const listNftPolicyHash = listNftTx.nftPolicySource.hash;

  // Sign and submit the minting transaction
  const unsignedListNftMintTx = lucid.fromTx(
    mintListNft.tx.toCbor().toString()
  );
  const signedListNftMintTx = await unsignedListNftMintTx.sign().complete();
  const listNftMintTxHash = await signedListNftMintTx.submit();

  // Wait for the transaction
  emulator.awaitBlock(50);

  // Find the UTxO containing the minted NFT to be listed, and convert it into plu-ts format
  const lutxosAfterListNftMint = await lucid.wallet.getUtxos();
  const utxosAfterListNftMint = lutxosAfterListNftMint.map(lutxoToUTxO);
  const listingUTxO = utxosAfterListNftMint.find(
    // Assuming multiple UTxOs are present, we find the one with the NFT
    (u) => u.resolved.value.get(ListNftPolicyHash, ListNftTokenName) === 1n
  )!;

  // Constants for listing transaction
  const listersAddress = listingUTxO.resolved.address;
  const changeAddress = listingUTxO.resolved.address;
  const listingPrice : number = 10_000;

  // Build the listing transaction
  const nftListingTx = await getListNFTTx(
    changeAddress,
    listingUTxO, //UTxO containing the NFT to be listed
    marketplaceAddress,
    // nftName
    // nftPolicy
    listingPrice,
    listersAddress
  );

  // Sign and submit the listing NFT onto the marketplace transaction
  const nftListingLTx = lucid.fromTx(nftListingTx.toCbor().toString());
  const signedNftListingLTx = await nftListingLTx.sign().complete();
  const nftListingTxHash = await signedNftListingLTx.submit();
  console.log("Listed NFT Tx Hash", nftListingTxHash);

  // Wait for transaction confirmation
  emulator.awaitBlock(50);
});

async function getUpdateListingTx(
  newPrice: number | bigint,
  listedNftUTxO: UTxO,
  collateral: UTxO,
  ownerAddress: Address, //Owner of the listing
  marketplaceSource: UTxO,
  marketplaceAddress: Address
): Promise<Tx> {
  
  const initialDatum = listedNftUTxO.resolved.datum;
  const initialDatumFields = initialDatum.fields;

  const updateListingTxBuilder = new TxBuilder(await getProtocolParams());
  return await updateListingTxBuilder.build({
    inputs: [
      {
        utxo: listedNftUTxO,
        referenceScriptV2: {
          refUtxo: marketplaceSource,
          datum: "inline",
          /**
           * close redeemer can also be used to update a listed asset (and is more efficient than `Update`)
           *
           * however the contract will not check that the asset is sent back to the contract
           * (which it does if using the `SaleAction.Update({ newPrice })`, or  `new DataConstr(2, [ new DataI( newPrice ) ] )` redeemer)
           **/
          redeemer: new DataConstr(1, []), // SaleAction.Close({})
        },
      },
      { utxo: collateral },
    ],
    outputs: [
      {
        address: marketplaceAddress,
        value: listedNftUTxO.resolved.value,
        datum: new DataConstr(0, [
          new DataI(newPrice), // price
          initialDatumFields[1], // seller
          initialDatumFields[2], // policy
          initialDatumFields[3], // tokenName
        ]),
      },
    ],
    collaterals: [collateral],
    requiredSigners: [ownerAddress.paymentCreds.hash],
    changeAddress: ownerAddress,
  });
}

test<LucidContext>("Test - Update NFT Listing", async ({
  lucid,
  users,
  emulator,
}) => {
  // Setup Fee Oracle
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
      await initiateFeeOracle(emulator, lucid, users.owner, false);
  
  // Setup Marketplace
  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome = 
      await initiateMarketplace(emulator, lucid, users.owner);
  const marketplaceAddress = marketplaceInitiationOutcome.marketplaceAddr;
  const marketplaceSource = marketplaceInitiationOutcome.marketplaceUTxOs[0];
 
  // Select the lister's wallet
  lucid.selectWalletFromSeed(users.lister);

  // Mint and list an NFT (reuse code from the listing test)
  // ... (code to mint and list an NFT)

  // Find the UTxO of the listed NFT on the marketplace
  const marketplaceLUTxOs = await lucid.utxosAt(marketplaceAddress.toString());
  const marketplaceUTxO = await marketplaceLUTxOs.map(lutxoToUTxO);
  const listedNftUTxO = marketplaceUTxO.find(
    (u) => u.resolved.value.get(ListNftPolicyHash, ListNftTokenName) === 1n
  )!;

  // Get a collateral UTxO from the lister's wallet
  const collateralUTxOs = await lucid.wallet.getUtxos();
  const collateralUTxO = lutxoToUTxO(collateralUTxOs[0]); // Assuming the first UTxO can be used as collateral

  // Constants for update transaction
  const newPrice: number = 15_000; // New price in lovelaces

  // Build the update listing transaction
  const updateListingTx = await getUpdateListingTx(
    newPrice,
    listedNftUTxO,
    collateralUTxO,
    listersAddress,
    marketplaceSource,
    marketplaceAddress
  );

  // Sign and submit the update listing transaction from the owners wallet (of the listed NFT)
  const updateListingLTx = lucid.fromTx(updateListingTx.toCbor().toString());
  const signedUpdateListingLTx = await updateListingLTx.sign().complete();
  const updateListingTxHash = await signedUpdateListingLTx.submit();
  console.log("Update Listing Tx Hash", updateListingTxHash);

  emulator.awaitBlock(50);
});

// UNIT-Test 3: Canceling an NFT listing on the marketplace

// select the wallet that originally listed the NFT (seller)
// find the UTXO in the marketplace contract containing the listed NFT
// create the cancellation transaction:
//    - Input: UTXO from marketplace containing the NFT

//    - Output: Send NFT back to seller's address
//    - Use the correct redeemer for cancellation
//  sign and submit the transaction

// UNIT-Test 4: Buying a listed NFT from the marketplace
test<LucidContext>("Test - Canceling NFT Listing", async ({
  lucid,
  users,
  emulator,
}) => {



  
});