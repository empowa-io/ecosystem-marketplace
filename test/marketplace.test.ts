import { Emulator, Lucid, Tx as LTx } from "@anastasia-labs/lucid-cardano-fork";

import { TxBuilder } from "@harmoniclabs/plu-ts";

import {
  LucidContext,
  initiateFeeOracle,
  FeeOracleInitiationOutcome,
  initiateMarketplace,
  MarketplaceInitiationOutcome,
  generateAccountSeedPhrase,
  initiateListedNft,
  ListedNFTInitiationOutcome,
  lutxoToUTxO,
  unsafeHexToUint8Array,
  getListNFTTx,
  getCancelListingTx
} from "./utils.ts";

import { beforeEach, test } from "vitest";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";

beforeEach<LucidContext>(async (context) => {
  const createUser = async () => {
    return await generateAccountSeedPhrase({ lovelace: BigInt(100_000_000) });
  };
  context.users = {
    lister: await createUser(), // User, who mints the NFT that will be listed on the Marketplace and then lists it
    owner: await createUser(), // User, who mints and deploys the fee oracle and then the marketplace
    adversary: await createUser(), // User for unhappy test paths, for example setting marketplace fee to 0% without having the Beacon UTxO
  };

  context.emulator = new Emulator([
    context.users.lister,
    context.users.owner,
    context.users.adversary,
  ]);

  context.lucid = await Lucid.new(context.emulator);
});

test<LucidContext>("Test - List NFT on Marketplace", async ({
  lucid,
  users,
  emulator,
}) => {
  // Setup Fee Oracle feeOracleNftPolicyHash is needed from initiateFeeOracle so makeMarketplace can work for initateMarketplace
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, users.owner, false);

  // Setup Marketplace
  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(emulator, lucid, users.owner);

  const marketplaceAddress = marketplaceInitiationOutcome.marketplaceAddr;

  // Select the signer wallet (the user that mints then lists the NFT)
  lucid.selectWalletFromSeed(users.lister);

  // Get lister's UTxOs and convert the first one to a plu-ts UTxO format
  const listersInitialUTxOs = await lucid.wallet.getUtxos();
  const listerRefLUTxO = await listersInitialUTxOs[0];
  const listerRefUTxO = await lutxoToUTxO(listerRefLUTxO);

  // Create a transaction to mint a single NFT
  const mintListNftTx = await getMintOneShotTx(
    new TxBuilder(await getProtocolParams()),
    listerRefUTxO,
    listerRefUTxO.resolved.address
  );

  const listNftPolicyHash = mintListNftTx.nftPolicySource.hash;
  const listNftTokenName = unsafeHexToUint8Array("4D594E4654"); //Using the util function to declare a new tokenname for the NFT that will be listed and have a clear distinction between feeOracleNft and the listNft

  // Sign and submit the minting transaction
  const unsignedListNftMintTx = lucid.fromTx(
    mintListNftTx.tx.toCbor().toString()
  );
  const signedListNftMintTx = await unsignedListNftMintTx.sign().complete();
  const listNftMintTxHash = await signedListNftMintTx.submit();

  emulator.awaitBlock(50);

  // Find the UTxO containing the minted NFT to be listed, and convert it into plu-ts format
  const lutxosAfterListNftMint = await lucid.wallet.getUtxos();
  const utxosAfterListNftMint = lutxosAfterListNftMint.map(lutxoToUTxO);
  const listingUTxO = utxosAfterListNftMint.find(
    // Assuming multiple UTxOs are present, we find the one with the NFT
    (u) => u.resolved.value.get(listNftPolicyHash, listNftTokenName) === 1n
  )!;

  // Constants for listing transaction
  const listersAddress = listingUTxO.resolved.address;
  const changeAddress = listingUTxO.resolved.address;
  const initialListingPrice: number = 10_000;
  const listNftPolicy = listNftPolicyHash.toBuffer();

  // Build the listing transaction
  const nftListingTx = await getListNFTTx(
    changeAddress,
    listingUTxO, //UTxO containing the NFT to be listed
    marketplaceAddress,
    listNftTokenName,
    listNftPolicy,
    initialListingPrice,
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

test<LucidContext>("Test - Update the Listed NFT", async ({
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
    (u) => u.resolved.value.get(listNftPolicyHash, listNftTokenName) === 1n //return these from the listing test outcome
  )!;

  // Get a collateral UTxO from the lister's wallet
  const collateralUTxOs = await lucid.wallet.getUtxos();
  const collateralUTxO = lutxoToUTxO(collateralUTxOs[0]); // Assuming the first UTxO can be used as collateral

  // Constants for update transaction
  const newPrice: number = 15_000; // New price in lovelaces
  const listersAddress = listingUTxO.resolved.address; //return listingUTxO from the listing test outcome

  // Build the update listing transaction
  const updateListingTx = await getUpdateListingTx(
    newPrice,
    listedNftUTxO,
    collateralUTxO,
    listersAddress,
    marketplaceSource,
    marketplaceAddress
  );

  // Sign and submit the update listing transaction from the listers wallet
  const updateListingLTx = lucid.fromTx(updateListingTx.toCbor().toString());
  const signedUpdateListingLTx = await updateListingLTx.sign().complete();
  const updateListingTxHash = await signedUpdateListingLTx.submit();
  console.log("Update Listing Tx Hash", updateListingTxHash);

  emulator.awaitBlock(50);
});

test<LucidContext>("Test - Cancel the NFT Listing", async ({
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
const marketplaceSource = marketplaceInitiationOutcome.marketplaceUTxOs[0];

// Setup NFT Listing
const listedNftInitiationOutcome: ListedNftInitiationOutcome =
  await initiateListedNft(emulator, lucid, users.lister, users.owner);

const cancelListingTx = await getCancelListingTx(
  listingUTxO: UTxO,
  collateral: UTxO,
  ownerAddress: Address,
  marketplaceSource: UTxO
)

// Sign and submit the update listing transaction from the listers wallet
const cancelListingLTx = lucid.fromTx(cancelListingTx.toCbor().toString());
const signedCancelListingLTx = await cancelListingLTx.sign().complete();
const updateCancelListingTxHash = await signedCancelListingLTx.submit();
console.log("Update Listing Tx Hash", updateCancelListingTxHash);

emulator.awaitBlock(50);

});