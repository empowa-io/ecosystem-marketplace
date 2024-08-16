import { Emulator, Lucid, Tx as LTx } from "@anastasia-labs/lucid-cardano-fork";

import {
  LucidContext,
  initiateMarketplace,
  MarketplaceInitiationOutcome,
  generateAccountSeedPhrase,
  listNft,
  NftListingOutcome,
  lutxoToUTxO,
  getUpdateListingTx,
  getCancelListingTx,
  generate56CharHex,
  generateRandomTokenName,
  FeeOracleInitiationOutcome,
  initiateFeeOracle,
  getBuyListingTx,
} from "./utils.ts";

import { Hash28, Address } from "@harmoniclabs/plu-ts";
import { beforeEach, test, expect } from "vitest";

// Listing NFT constants
const listNftPolicyHash_01 = new Hash28(generate56CharHex());
const listNftTokenName_01 = generateRandomTokenName();
const unit_01 =
  listNftPolicyHash_01.toString() +
  Buffer.from(listNftTokenName_01).toString("hex");

// Listing NFT (additional double satisfaction) constants for buy test
const listNftPolicyHash_02 = new Hash28(generate56CharHex());
const listNftTokenName_02 = generateRandomTokenName();
const unit_02 =
  listNftPolicyHash_02.toString() +
  Buffer.from(listNftTokenName_02).toString("hex");

// Listing NFT (additional double satisfaction) constants for canceling list
const listNftPolicyHash_03 = new Hash28(generate56CharHex());
const listNftTokenName_03 = generateRandomTokenName();
const unit_03 =
  listNftPolicyHash_03.toString() +
  Buffer.from(listNftTokenName_03).toString("hex");

// Marketplace currency constants
const sampleCurrencyPolicyId = new Hash28(generate56CharHex());
const sampleCurrencyTokenName = generateRandomTokenName();
const sampleCurrencyUnit =
  sampleCurrencyPolicyId.toString() +
  Buffer.from(sampleCurrencyTokenName).toString("hex");

beforeEach<LucidContext>(async (context) => {
  const createUser = async () => {
    return await generateAccountSeedPhrase({ lovelace: BigInt(100_000_000) });
  };

  const sellerAssets = {
    lovelace: BigInt(100_000_000),
    [unit_01]: BigInt(1),
    [unit_02]: BigInt(1),
  };

  const adversaryAssets = {
    lovelace: BigInt(100_000_000),
    [unit_03]: BigInt(1),
  };
  const buyerAssets = {
    lovelace: BigInt(100_000_000),
    [sampleCurrencyUnit]: BigInt(100_000_000), // MarketplaceCurrency
  };

  context.users = {
    seller: await generateAccountSeedPhrase(sellerAssets), // User, who mints the NFT that will be listed on the Marketplace and lists it
    owner: await createUser(), // User, who mints and deploys the fee oracle and then the marketplace
    buyer: await generateAccountSeedPhrase(buyerAssets), // User, who buys the NFT from the Marketplace
    adversary: await createUser(), // Malicious user for invalid test paths
  };

  context.emulator = new Emulator([
    context.users.seller,
    context.users.owner,
    context.users.adversary,
    context.users.buyer,
  ]);

  context.lucid = await Lucid.new(context.emulator);
});

test<LucidContext>("Test - Valid {Update} Execution on Listed NFT", async ({
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
      sampleCurrencyPolicyId,
      sampleCurrencyTokenName,
      feeOracleInitiationOutcome
    );

  const initialPrice = 10_000;
  const nftListingOutcome: NftListingOutcome = await listNft(
    emulator,
    lucid,
    marketplaceInitiationOutcome,
    users.seller.seedPhrase,
    listNftPolicyHash_01,
    listNftTokenName_01,
    initialPrice
  );

  lucid.selectWalletFromSeed(users.seller.seedPhrase);

  // Get a collateral UTxO from the seller's wallet
  const collateralUTxOs = await lucid.wallet.getUtxos();
  const collateraUTxOs = collateralUTxOs.map(lutxoToUTxO);

  // Constants for update transaction
  const newPrice: bigint = 15_000n; // New price in lovelaces

  // Build the update listing transaction
  const updateListingTx = await getUpdateListingTx(
    marketplaceInitiationOutcome,
    nftListingOutcome,
    newPrice,
    collateraUTxOs[0]
  );

  // Sign and submit the update listing transaction from the sellers wallet
  const updateListingLTx = lucid.fromTx(updateListingTx.toCbor().toString());
  const signedUpdateListingLTx = await updateListingLTx.sign().complete();
  const updateListingTxHash = await signedUpdateListingLTx.submit();

  emulator.awaitBlock(50);
}, 60_000);

test<LucidContext>("Test - (Invalid) {Update} Execution on Listed NFT (Fail Case: Updated Datum)", async ({
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
        sampleCurrencyPolicyId,
        sampleCurrencyTokenName,
        feeOracleInitiationOutcome
      );

    const marketplaceSource =
      marketplaceInitiationOutcome.marketplaceRefScriptUTxO;
    const marketplaceAddress = marketplaceInitiationOutcome.marketplaceAddr;
    const initialPrice = 10_000;
    const nftListingOutcome: NftListingOutcome = await listNft(
      emulator,
      lucid,
      marketplaceInitiationOutcome,
      users.seller.seedPhrase,
      listNftPolicyHash_01,
      listNftTokenName_01,
      initialPrice
    );

    const sellerAddress = nftListingOutcome.sellerAddress;
    const listedNftUTxO = nftListingOutcome.listedNftUTxO;

    // Constants for update transaction
    const newPrice: number = 15_000; // Price field in the NFT datum that will get overrided by `badPrice` provided by adversary

    lucid.selectWalletFromSeed(users.adversary.seedPhrase);
    const adversaryAddress = Address.fromString(users.adversary.address);
    const badPrice: number = 0;
    const badPolicyHash = new Hash28(generate56CharHex());
    // const badPolicy = badPolicyHash.toBuffer();
    // const badTokenName = generateRandomTokenName();

    // Get a collateral UTxO from the adversary's wallet
    const collateralUTxOsAdversary = await lucid.wallet.getUtxos();
    const collateralUTxOAdversary = lutxoToUTxO(collateralUTxOsAdversary[0]);

    const badUpdateListingTx = await getUpdateListingTx(
      marketplaceInitiationOutcome,
      nftListingOutcome,
      newPrice,
      collateralUTxOAdversary,
      badPrice, // Price field that overrides newPrice field in the NFT datum
      adversaryAddress // Adversary Address that is not the owner of the listed NFT from users.seller
    );

    // Sign and submit the update listing transaction from the sellers wallet
    const badUpdateListingLTx = lucid.fromTx(
      badUpdateListingTx.toCbor().toString()
    );
    const signedBadUpdateListingLTx = await badUpdateListingLTx
      .sign()
      .complete();
    const badUpdateListingTxHash = await signedBadUpdateListingLTx.submit();

    emulator.awaitBlock(50);
  })
    .rejects.toThrow
    // Expected error message from the emulator due to fail case
    ();
});

test<LucidContext>("Test - Valid {Cancel} Execution on Listed NFT", async ({
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
      sampleCurrencyPolicyId,
      sampleCurrencyTokenName,
      feeOracleInitiationOutcome
    );
  const listPrice = 10_000;

  const nftListingOutcome: NftListingOutcome = await listNft(
    emulator,
    lucid,
    marketplaceInitiationOutcome,
    users.seller.seedPhrase,
    listNftPolicyHash_01,
    listNftTokenName_01,
    listPrice
  );

  lucid.selectWalletFromSeed(users.seller.seedPhrase);

  // Get a collateral UTxO from the seller's wallet
  const collateralUTxOs = await lucid.wallet.getUtxos();
  const collateraUTxOs = collateralUTxOs.map(lutxoToUTxO); // Assuming the first UTxO can be used as collateral

  const cancelListingTx = await getCancelListingTx(
    marketplaceInitiationOutcome,
    nftListingOutcome,
    collateraUTxOs[0]
  );

  // Sign and submit the update listing transaction from the seller`s wallet
  const cancelListingLTx = lucid.fromTx(cancelListingTx.toCbor().toString());
  const signedCancelListingLTx = await cancelListingLTx.sign().complete();
  const updateCancelListingTxHash = await signedCancelListingLTx.submit();
  emulator.awaitBlock(50);
}, 60_000);

test<LucidContext>("Test - (Invalid) {Cancel} Execution on Listed NFT (Fail Case: Double Satisfaction)", async ({
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
        sampleCurrencyPolicyId,
        sampleCurrencyTokenName,
        feeOracleInitiationOutcome
      );

    const listPrice = 10_000;
    const sellerListingOutcome: NftListingOutcome = await listNft(
      emulator,
      lucid,
      marketplaceInitiationOutcome,
      users.seller.seedPhrase,
      listNftPolicyHash_01,
      listNftTokenName_01,
      listPrice
    );

    lucid.selectWalletFromSeed(users.adversary.seedPhrase);

    const adversaryListingOutcome: NftListingOutcome = await listNft(
      emulator,
      lucid,
      marketplaceInitiationOutcome,
      users.adversary.seedPhrase,
      listNftPolicyHash_03,
      listNftTokenName_03,
      listPrice
    );

    const targetListingUTxO = sellerListingOutcome.listedNftUTxO;

    // Get a collateral UTxO from the adversary's wallet
    const adversaryLUTxOs = await lucid.wallet.getUtxos();
    const adversaryUTxOs = adversaryLUTxOs.map(lutxoToUTxO);

    const badCancelListingTx = await getCancelListingTx(
      marketplaceInitiationOutcome,
      adversaryListingOutcome,
      adversaryUTxOs[0],
      targetListingUTxO
    );

    // Sign and submit the update listing transaction from the seller`s wallet
    const badCancelListingLTx = lucid.fromTx(
      badCancelListingTx.toCbor().toString()
    );
    const badSignedCancelListingLTx = await badCancelListingLTx
      .sign()
      .complete();
    const badUpdateCancelListingTxHash =
      await badSignedCancelListingLTx.submit();

    emulator.awaitBlock(50);
  }).rejects.toThrow();
});

test<LucidContext>("Test - Valid {Buy} Execution on Listed NFT", async ({
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
      sampleCurrencyPolicyId,
      sampleCurrencyTokenName,
      feeOracleInitiationOutcome
    );

  const nftListingOutcome: NftListingOutcome = await listNft(
    emulator,
    lucid,
    marketplaceInitiationOutcome,
    users.seller.seedPhrase,
    listNftPolicyHash_01,
    listNftTokenName_01,
    10_000
  );

  // Setup users.buyer
  lucid.selectWalletFromSeed(users.buyer.seedPhrase);
  const buyerAddress = Address.fromString(users.buyer.address);

  // Get a collateral UTxO from the buyer's wallet
  const buyerlUTxOs = await lucid.wallet.getUtxos();
  const buyerUTxOs = buyerlUTxOs.map(lutxoToUTxO); // Assuming the first UTxO can be used as collateral

  // Build buy transaction
  const buyListingTx = await getBuyListingTx(
    feeOracleInitiationOutcome,
    marketplaceInitiationOutcome,
    nftListingOutcome,
    buyerUTxOs,
    buyerAddress
  );

  // Sign and submit the update listing transaction from the seller`s wallet
  const buyListingLTx = lucid.fromTx(buyListingTx.toCbor().toString());
  const signedBuyListingLTx = await buyListingLTx.sign().complete();
  const BuyListingTxHash = await signedBuyListingLTx.submit();
  emulator.awaitBlock(50);
});

test<LucidContext>("Test - Invalid {Buy} Execution on Listed NFT (Fail Case: Double Satisfaction)", async ({
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
        sampleCurrencyPolicyId,
        sampleCurrencyTokenName,
        feeOracleInitiationOutcome
      );

    const nftListingOutcome: NftListingOutcome = await listNft(
      emulator,
      lucid,
      marketplaceInitiationOutcome,
      users.seller.seedPhrase,
      listNftPolicyHash_01,
      listNftTokenName_01,
      10_000
    );

    const nftListingOutcome2: NftListingOutcome = await listNft(
      emulator,
      lucid,
      marketplaceInitiationOutcome,
      users.seller.seedPhrase,
      listNftPolicyHash_02,
      listNftTokenName_02,
      10_000
    );

    // Setup users.buyer
    lucid.selectWalletFromSeed(users.buyer.seedPhrase);
    const buyerAddress = Address.fromString(users.buyer.address);

    // Get a collateral UTxO from the buyer's wallet
    const buyerlUTxOs = await lucid.wallet.getUtxos();
    const buyerUTxOs = buyerlUTxOs.map(lutxoToUTxO); // Assuming the first UTxO can be used as collateral

    // Build buy transaction
    const buyListingTx = await getBuyListingTx(
      feeOracleInitiationOutcome,
      marketplaceInitiationOutcome,
      nftListingOutcome,
      buyerUTxOs,
      buyerAddress,
      nftListingOutcome2.listedNftUTxO
    );

    // Sign and submit the update listing transaction from the seller`s wallet
    const buyListingLTx = lucid.fromTx(buyListingTx.toCbor().toString());
    const signedBuyListingLTx = await buyListingLTx.sign().complete();
    const BuyListingTxHash = await signedBuyListingLTx.submit();
    emulator.awaitBlock(50);
  }).rejects.toThrow();
});
