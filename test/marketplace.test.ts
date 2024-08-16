import { Emulator, Lucid, Tx as LTx } from "@anastasia-labs/lucid-cardano-fork";

import {
  LucidContext,
  initiateMarketplace,
  MarketplaceInitiationOutcome,
  generateAccountSeedPhrase,
  listNft,
  NftListingOutcome,
  lutxoToUTxO,
  getListNFTTx,
  getUpdateListingTx,
  getCancelListingTx,
  generate56CharHex,
  generateRandomTokenName,
  FeeOracleInitiationOutcome,
  initiateFeeOracle,
  getBuyListingTx,
} from "./utils.ts";

import {
  DataConstr,
  Hash28,
  DataI,
  PubKeyHash,
  Address,
} from "@harmoniclabs/plu-ts";
import { beforeEach, test, expect } from "vitest";

import { tokenName } from "../app/constants";

// Listing NFT constants
const listNftPolicyHash_01 = new Hash28(generate56CharHex());
const listNftTokenName_01 = generateRandomTokenName();
const unit_01 =
  listNftPolicyHash_01.toString() +
  Buffer.from(listNftTokenName_01).toString("hex");
// const unit_01 = policyHash_01 + tokenName_01 ;

beforeEach<LucidContext>(async (context) => {
  const createUser = async () => {
    return await generateAccountSeedPhrase({ lovelace: BigInt(100_000_000) });
  };

  const sellerAssets = {
    lovelace: BigInt(100_000_000),
    [unit_01]: BigInt(1),
  };

  context.users = {
    seller: await generateAccountSeedPhrase(sellerAssets), // User, who mints the NFT that will be listed on the Marketplace and then lists it
    owner: await createUser(), // User, who mints and deploys the fee oracle and then the marketplace
    buyer: await createUser(), // User, who buys the NFT from the Marketplace
    adversary: await createUser(), // User for unhappy test paths
  };

  context.emulator = new Emulator([
    context.users.seller,
    context.users.owner,
    context.users.adversary,
    context.users.buyer,
  ]);

  context.lucid = await Lucid.new(context.emulator);
});

test<LucidContext>("Test - Valid NFT marketplace listing ", async ({
  lucid,
  users,
  emulator,
}) => {
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, users.owner.seedPhrase, false);

  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(
      emulator,
      lucid,
      users.owner.seedPhrase,
      "",
      "currencyTokenName",
      feeOracleInitiationOutcome
    );

  const marketplaceAddress = marketplaceInitiationOutcome.marketplaceAddr;
  
  // Select the sellers`s wallet
  lucid.selectWalletFromSeed(users.seller.seedPhrase);

  // Find the UTxO containing the NFT to be listed, and convert it into plu-ts format
  const sellerLUTxOs = await lucid.wallet.getUtxos();
  const sellerUTxOs = sellerLUTxOs.map(lutxoToUTxO);
  const nftUTxO = sellerUTxOs.find(
    // Assuming multiple UTxOs could be present, we find the one with the NFT
    (u) =>
      u.resolved.value.get(listNftPolicyHash_01, listNftTokenName_01) === 1n
  )!;

  // Constants for listing transaction
  const sellerAddress = nftUTxO.resolved.address;
  const changeAddress = nftUTxO.resolved.address;
  const listNftPolicy = listNftPolicyHash_01.toBuffer(); // in Uint8Array format required for getListNFTtx
  const initialListingPrice: bigint = 10_000n;

  console.log("sellerAddress", sellerAddress);
  
  // Build the listing transaction
  const nftListingTx = await getListNFTTx(
    changeAddress,
    nftUTxO,
    marketplaceAddress,
    listNftTokenName_01,
    listNftPolicy,
    initialListingPrice,
    sellerAddress
  );

  // Sign and submit the listing NFT onto the marketplace transaction
  const nftListingLTx = lucid.fromTx(nftListingTx.toCbor().toString());
  const signedNftListingLTx = await nftListingLTx.sign().complete();
  const nftListingTxHash = await signedNftListingLTx.submit();
  console.log("Listed NFT Tx Hash", nftListingTxHash);

  emulator.awaitBlock(50);

  console.log("Test completed successfully");
}, 60_000);

test<LucidContext>("Test - Valid {Update} execution on Listed NFT", async ({
  lucid,
  users,
  emulator,
}) => {
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, users.owner.seedPhrase, false);

  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(
      emulator,
      lucid,
      users.owner.seedPhrase,
      "",
      "currencyTokenName",
      feeOracleInitiationOutcome
    );

  const marketplaceSource =
    marketplaceInitiationOutcome.marketplaceRefScriptUTxO;
  const marketplaceAddress = marketplaceInitiationOutcome.marketplaceAddr;
  console.log("Marketplace Address", marketplaceAddress);

  const nftListingOutcome: NftListingOutcome = await listNft(
    emulator,
    lucid,
    marketplaceInitiationOutcome,
    users.seller.seedPhrase,
    listNftPolicyHash_01,
    listNftTokenName_01
  );

  const sellerAddress = nftListingOutcome.sellerAddress;
  const listedNftUTxO = nftListingOutcome.listedNftUTxO;

  lucid.selectWalletFromSeed(users.seller.seedPhrase);

  // Get a collateral UTxO from the seller's wallet
  const collateralUTxOs = await lucid.wallet.getUtxos();
  const collateralUTxO = lutxoToUTxO(collateralUTxOs[0]); // Assuming the first UTxO can be used as collateral

  // Constants for update transaction
  const newPrice: bigint = 15_000n; // New price in lovelaces

  // Build the update listing transaction
  const updateListingTx = await getUpdateListingTx(
    newPrice,
    listedNftUTxO,
    collateralUTxO,
    sellerAddress,
    marketplaceSource,
    marketplaceAddress
  );

  // Sign and submit the update listing transaction from the sellers wallet
  const updateListingLTx = lucid.fromTx(updateListingTx.toCbor().toString());
  const signedUpdateListingLTx = await updateListingLTx.sign().complete();
  const updateListingTxHash = await signedUpdateListingLTx.submit();
  console.log("Update Listing Tx Hash", updateListingTxHash);
  emulator.awaitBlock(50);
}, 60_000);

test<LucidContext>("Test - Invalid {Update} execution on Listed NFT (Fail Case: Updated Datum)", async ({
  lucid,
  users,
  emulator,
}) => {
  expect(async () => {
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, users.owner.seedPhrase, false);

  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(
      emulator,
      lucid,
      users.owner.seedPhrase,
      "",
      "currencyTokenName",
      feeOracleInitiationOutcome
    );

  const marketplaceSource =
    marketplaceInitiationOutcome.marketplaceRefScriptUTxO;
  const marketplaceAddress = marketplaceInitiationOutcome.marketplaceAddr;
  
  const nftListingOutcome: NftListingOutcome = await listNft(
    emulator,
    lucid,
    marketplaceInitiationOutcome,
    users.seller.seedPhrase,
    listNftPolicyHash_01,
    listNftTokenName_01
  );

  const sellerAddress = nftListingOutcome.sellerAddress;
  const listedNftUTxO = nftListingOutcome.listedNftUTxO;
  
  // Constants for update transaction
  const newPrice: number = 15_000; // Price field in the NFT datum that will get overrided by `badPrice`provided by adversary

  lucid.selectWalletFromSeed(users.adversary.seedPhrase);
  const adversaryAddress = Address.fromString(users.adversary.address);
  const badPrice : number = 0;
  const badPolicyHash = new Hash28(generate56CharHex());
  // const badPolicy = badPolicyHash.toBuffer();
  // const badTokenName = generateRandomTokenName();

  // Get a collateral UTxO from the adversary's wallet
  const collateralUTxOsAdversary = await lucid.wallet.getUtxos();
  const collateralUTxOAdversary = lutxoToUTxO(collateralUTxOsAdversary[0]);
  const badUpdateListingTx = await getUpdateListingTx(
    newPrice,
    listedNftUTxO,
    collateralUTxOAdversary,
    sellerAddress,
    marketplaceSource,
    marketplaceAddress,
    badPrice, // Price field that overrides newPrice field in the NFT datum
    adversaryAddress // Adversary Address that is not the owner of the listed NFT from users.seller
  );

  // Sign and submit the update listing transaction from the sellers wallet
  const badUpdateListingLTx = lucid.fromTx(
    badUpdateListingTx.toCbor().toString()
  );
  const signedBadUpdateListingLTx = await badUpdateListingLTx.sign().complete();
  const badUpdateListingTxHash = await signedBadUpdateListingLTx.submit();

  emulator.awaitBlock(50);
}).rejects.toThrow(
  "script consumed with Spend redemer and index '1'" // Expected error message from the emulator due to invalid Datum
);
});

test<LucidContext>("Test - Valid {Cancel} execution on Listed NFT", async ({
  lucid,
  users,
  emulator,
}) => {
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, users.owner.seedPhrase, false);

  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(
      emulator,
      lucid,
      users.owner.seedPhrase,
      "",
      "currencyTokenName",
      feeOracleInitiationOutcome
    );

  const nftListingOutcome: NftListingOutcome = await listNft(
    emulator,
    lucid,
    marketplaceInitiationOutcome,
    users.seller.seedPhrase
  );
  const listingUTxO = nftListingOutcome.listedNftUTxO;
  const marketplaceSource =
    marketplaceInitiationOutcome.marketplaceRefScriptUTxO;
  const sellerAddress = nftListingOutcome.sellerAddress;

  lucid.selectWalletFromSeed(users.seller.seedPhrase);

  // Get a collateral UTxO from the seller's wallet
  const collateralUTxOs = await lucid.wallet.getUtxos();
  const collateralUTxO = lutxoToUTxO(collateralUTxOs[0]); // Assuming the first UTxO can be used as collateral

  const cancelListingTx = await getCancelListingTx(
    listingUTxO,
    collateralUTxO,
    sellerAddress,
    marketplaceSource
  );

  // Sign and submit the update listing transaction from the seller`s wallet
  const cancelListingLTx = lucid.fromTx(cancelListingTx.toCbor().toString());
  const signedCancelListingLTx = await cancelListingLTx.sign().complete();
  const updateCancelListingTxHash = await signedCancelListingLTx.submit();
  console.log("Update Listing Tx Hash", updateCancelListingTxHash);

  emulator.awaitBlock(50);
});

test<LucidContext>("Test - Invalid {Cancel} execution on Listed NFT (Fail Case: NFT return attempt to adversary wallet", async ({
  lucid,
  users,
  emulator,
}) => {
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, users.owner.seedPhrase, false);

  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(
      emulator,
      lucid,
      users.owner.seedPhrase,
      "",
      "currencyTokenName",
      feeOracleInitiationOutcome
    );
  const marketplaceSource =
    marketplaceInitiationOutcome.marketplaceRefScriptUTxO;

  const nftListingOutcome: NftListingOutcome = await listNft(
    emulator,
    lucid,
    marketplaceInitiationOutcome,
    users.seller.seedPhrase
  );
  const listingUTxO = nftListingOutcome.listedNftUTxO;

  lucid.selectWalletFromSeed(users.adversary.seedPhrase);
  const adversaryAddress = Address.fromString(users.adversary.address);

  // Get a collateral UTxO from the adversary's wallet
  const collateralUTxOsAdversary = await lucid.wallet.getUtxos();
  const collateralUTxOAdversary = lutxoToUTxO(collateralUTxOsAdversary[0]);

  const badCancelListingTx = await getCancelListingTx(
    listingUTxO, // listingUTxO thats contains NFT that belongs to users.seller
    collateralUTxOAdversary, // collateralUTxO from adversary
    adversaryAddress, // instead of sellerAddress -> adversaryAddress
    marketplaceSource
  );

  // Sign and submit the update listing transaction from the seller`s wallet
  const badCancelListingLTx = lucid.fromTx(
    badCancelListingTx.toCbor().toString()
  );
  const badSignedCancelListingLTx = await badCancelListingLTx.sign().complete();
  const badUpdateCancelListingTxHash = await badSignedCancelListingLTx.submit();
  console.log("Update Listing Tx Hash", badUpdateCancelListingTxHash);

  emulator.awaitBlock(50);
});

test<LucidContext>("Test - Valid {Buy} execution on Listed NFT", async ({
  lucid,
  users,
  emulator,
}) => {
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, users.owner.seedPhrase, false);

  const feeOracleUTxO = feeOracleInitiationOutcome.feeOracleUTxOs[0]; // UTxO[0] with Fee Oracle NFT

  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(
      emulator,
      lucid,
      users.owner.seedPhrase,
      "",
      "currencyTokenName",
      feeOracleInitiationOutcome
    );
  const marketplaceOwnerAddress =
    marketplaceInitiationOutcome.marketplaceOwnerAddress;

  const nftListingOutcome: NftListingOutcome = await listNft(
    emulator,
    lucid,
    marketplaceInitiationOutcome,
    users.seller.seedPhrase
  );
  const listNftPolicyHash_01 = nftListingOutcome.nftPolicyHash;
  const listNftTokenName_01 = nftListingOutcome.nftTokenName;
  const listedNftUTxO = nftListingOutcome.listedNftUTxO;
  const marketplaceSource =
    marketplaceInitiationOutcome.marketplaceRefScriptUTxO;

  // Setup users.buyer
  lucid.selectWalletFromSeed(users.buyer.seedPhrase);
  const buyerAddress = Address.fromString(users.buyer.address);
  const buyerPaymentCredential = lucid.utils.paymentCredentialOf(users.buyer.address);
  const buyerPublicKeyHash = new PubKeyHash(buyerPaymentCredential.hash);
  const returnAddress = buyerAddress;

  // Get a collateral UTxO from the buyer's wallet
  const collateralUTxOs = await lucid.wallet.getUtxos();
  const collateralUTxO = lutxoToUTxO(collateralUTxOs[0]); // Assuming the first UTxO can be used as collateral

  // Price / Fee Operations
  const nftSaleDatum = listedNftUTxO.resolved.datum;
  const feeNumeratorDatum = feeOracleUTxO.resolved.datum;
  if (
    !(nftSaleDatum instanceof DataConstr && feeNumeratorDatum instanceof DataI)
  )
    throw "watermelons";
  const feeNumerator = feeNumeratorDatum.int;
  const saleFields = nftSaleDatum.fields;
  if (!(saleFields[0] instanceof DataI)) throw "cherrys";
  const fullPrice = saleFields[0].int;
  const protocolFeeAmt = (fullPrice * feeNumerator) / 1_000_000n;
  const finalPrice = fullPrice - protocolFeeAmt;

  const listNftPolicy = listNftPolicyHash_01.toBuffer(); // Conversion to Uint8Array

  // Conversions for currencyPolicyId and currencyTokenName
  const currencyPolicyId = marketplaceInitiationOutcome.currencyPolicyId;
  const currencyTokenName = marketplaceInitiationOutcome.currencyTokenName;

  // const currencyPolicyIdHash28 = new Hash28(currencyPolicyId);
  // const currencyTokenNameUint8Array = ... ;

  // for currencyPolicyId, fake.policy under testnet can be used refer to app/buy.ts or use tokenName under app/constants.ts
  // for currencyTokenName, tokenName can be used under app/constants.ts

  // Build buy transaction
  const buyListingTx = await getBuyListingTx(
    listedNftUTxO,
    marketplaceSource,
    collateralUTxO,
    returnAddress, // Buyer Address
    feeOracleUTxO, // UTxO[0] with Fee Oracle NFT
    buyerPublicKeyHash, // Buyers PubKeyHash | PublicKey | Address, just use Address
    listNftPolicy,
    listNftTokenName_01,
    currencyPolicyId, // Conversion?
    currencyTokenName, // Conversion?
    protocolFeeAmt,
    marketplaceOwnerAddress,
    finalPrice
  );
});
