import { Emulator, Lucid, Tx as LTx } from "@anastasia-labs/lucid-cardano-fork";

import {
  LucidContext,
  initiateMarketplace,
  MarketplaceInitiationOutcome,
  generateAccountSeedPhrase,
  initiateListedNft,
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

import { DataConstr, Hash28, DataI, PubKeyHash } from "@harmoniclabs/plu-ts";
import { beforeEach, test } from "vitest";

// // Listing NFT constants
// const policyHash_01 = generate56CharHex();
// const tokenName_01 = generateRandomTokenName();
// const unit_01 = policyHash_01 + tokenName_01 ;

// Listing NFT constants
const listNftPolicyHash_01 = new Hash28(generate56CharHex());
const listNftTokenName_01 = generateRandomTokenName();
const unit_01 =
  listNftPolicyHash_01.toString() +
  Buffer.from(listNftTokenName_01).toString("hex");

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
  ]);

  context.lucid = await Lucid.new(context.emulator);
});

test<LucidContext>("Off-Chain Test - Succesfully List NFT on Marketplace", async ({
  lucid,
  users,
  emulator,
}) => {
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, users.owner, false);

  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(
      emulator,
      lucid,
      users.owner,
      "",
      "currencyTokenName",
      feeOracleInitiationOutcome
    );

  const marketplaceAddress = marketplaceInitiationOutcome.marketplaceAddr;

  // Select the sellers`s wallet
  lucid.selectWalletFromSeed(users.seller);

  // Find the UTxO containing the NFT to be listed, and convert it into plu-ts format
  const sellerLUTxOs = await lucid.wallet.getUtxos();
  const sellerUTxOs = sellerLUTxOs.map(lutxoToUTxO);
  const listingUTxO = sellerUTxOs.find(
    // Assuming multiple UTxOs could be present, we find the one with the NFT
    (u) =>
      u.resolved.value.get(listNftPolicyHash_01, listNftTokenName_01) === 1n
  )!;

  // Constants for listing transaction
  const sellerAddress = listingUTxO.resolved.address;
  const changeAddress = listingUTxO.resolved.address;
  const listNftPolicy = listNftPolicyHash_01.toBuffer(); // in Uint8Array format required for getListNFTtx
  const initialListingPrice: number = 10_000;

  // Build the listing transaction
  const nftListingTx = await getListNFTTx(
    changeAddress,
    listingUTxO,
    marketplaceAddress,
    listNftTokenName_01, // Uint8Array
    listNftPolicy, // Uint8Array
    initialListingPrice,
    sellerAddress
  );

  // Sign and submit the listing NFT onto the marketplace transaction
  const nftListingLTx = lucid.fromTx(nftListingTx.toCbor().toString());
  const signedNftListingLTx = await nftListingLTx.sign().complete();
  const nftListingTxHash = await signedNftListingLTx.submit();
  console.log("Listed NFT Tx Hash", nftListingTxHash);

  emulator.awaitBlock(50);
});

test<LucidContext>("Test - Update the Listed NFT", async ({
  lucid,
  users,
  emulator,
}) => {
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, users.owner, false);

  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(
      emulator,
      lucid,
      users.owner,
      "",
      "currencyTokenName",
      feeOracleInitiationOutcome
    );

  const nftListingOutcome: NftListingOutcome = await initiateListedNft(
    emulator,
    lucid,
    marketplaceInitiationOutcome,
    users.seller
  );

  const sellerAddress = nftListingOutcome.sellerAddress;
  const listedNftUTxO = nftListingOutcome.listedNftUTxO;
  const marketplaceSource = nftListingOutcome.marketplaceSource;
  const marketplaceAddress = nftListingOutcome.marketplaceAddress;

  lucid.selectWalletFromSeed(users.seller);

  // Get a collateral UTxO from the seller's wallet
  const collateralUTxOs = await lucid.wallet.getUtxos();
  const collateralUTxO = lutxoToUTxO(collateralUTxOs[0]); // Assuming the first UTxO can be used as collateral

  // Constants for update transaction
  const newPrice: number = 15_000; // New price in lovelaces

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

  emulator.awaitBlock(50);
});

test<LucidContext>("Test - Cancel the NFT Listing", async ({
  lucid,
  users,
  emulator,
}) => {
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, users.owner, false);

  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(
      emulator,
      lucid,
      users.owner,
      "",
      "currencyTokenName",
      feeOracleInitiationOutcome
    );

  const nftListingOutcome: NftListingOutcome = await initiateListedNft(
    emulator,
    lucid,
    marketplaceInitiationOutcome,
    users.seller
  );
  const listingUTxO = nftListingOutcome.listedNftUTxO;
  const marketplaceSource = nftListingOutcome.marketplaceSource;
  const sellerAddress = nftListingOutcome.sellerAddress;

  lucid.selectWalletFromSeed(users.seller);

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

test<LucidContext>("Test - Buy the NFT Listing", async ({
  lucid,
  users,
  emulator,
}) => {
  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, users.owner, false);

  const feeOracleUTxO = feeOracleInitiationOutcome.feeOracleUTxOs[0]; // UTxO[0] with Fee Oracle NFT

  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(
      emulator,
      lucid,
      users.owner,
      "",
      "currencyTokenName",
      feeOracleInitiationOutcome
    );
  const marketplaceOwnerAddress =
    marketplaceInitiationOutcome.marketplaceOwnerAddress;

  const currencyPolicyId = marketplaceInitiationOutcome.currencyPolicyId; // Should be transformed to Uint8Array
  const currencyTokenName = marketplaceInitiationOutcome.currencyTokenName; // Should be transformed to Uint8Array

  const nftListingOutcome: NftListingOutcome = await initiateListedNft(
    emulator,
    lucid,
    marketplaceInitiationOutcome,
    users.seller
  );
  const listNftPolicyHash_01 = nftListingOutcome.listNftPolicyHash_01;
  const listNftTokenName_01 = nftListingOutcome.listNftTokenName_01;
  const listedNftUTxO = nftListingOutcome.listedNftUTxO;
  const marketplaceSource = nftListingOutcome.marketplaceSource;

  // Setup users.buyer
  lucid.selectWalletFromSeed(users.buyer);
  const buyerAddress = await lucid.wallet.address();
  const buyerPaymentCredential = lucid.utils.paymentCredentialOf(users.buyer);
  const buyerPublicKeyHash = new PubKeyHash(buyerPaymentCredential.hash);
  const returnAddress = buyerAddress;

  // Fee Operations
  const nftSaleDatum = listedNftUTxO.resolved.datum as DataConstr; // as DataI ?
  const feeNumeratorDatum = feeOracleUTxO.resolved.datum as DataI; 
  const feeNumerator = feeNumeratorDatum.int;
  const saleFields = nftSaleDatum.fields;
  const fullPrice = saleFields[0].int;
  const protocolFeeAmt = (fullPrice * feeNumerator) / 1_000_000n;
  const finalPrice = fullPrice - protocolFeeAmt;

  const listNftPolicy = listNftPolicyHash_01.toBuffer(); // Conversion to Uint8Array

  // Build buy transaction
  const buyListingTx = await getBuyListingTx(
    listedNftUTxO,
    marketplaceSource,
    collateralUTxO,
    returnAddress, // Buyer Address
    feeOracleUTxO, // UTxO[0] with Fee Oracle NFT
    buyer, //  Buyers PubKeyHash | PublicKey | Address,
    listNftPolicy,
    listNftTokenName_01,
    currencyPolicyId,
    currencyTokenName,
    protocolFeeAmt,
    marketplaceOwnerAddress,
    finalPrice
  );
});
