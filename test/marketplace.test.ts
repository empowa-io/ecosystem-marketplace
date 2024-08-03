import { tokenName } from "../app/constants";
import { testListNFT } from "./testListNFT.ts";
import { test, describe, beforeAll } from "vitest";
import { initialSetup, SetupResult } from "./utils";
import { makeMarketplace } from "../src/contracts/marketplace";
import {
  Address,
  PAddress,
  PCurrencySymbol,
  PTokenName,
  PaymentCredentials,
  pData,
} from "@harmoniclabs/plu-ts";
import { tokenName } from "../app/constants";
import { getProtocolParams } from "../app/utils/getProtocolParams";

// To-Do : Initalize marketplace via "initiateMarketplace" in test/utils.ts, how was it in test/makeMarketplaceAndGetDeployTest.ts?





// UNIT-Test 1: List NFT for sale
// Listing an NFT for sale on marketplace (this scenario is for off-chain testing and needs to be compliant with the smart contract)

// Select the wallet that holds the NFT
// find the UTXO containing the NFT (In Lucid: utxosAtWithUnit(addressOrCredential: Address | Credential, unit: Unit): Promise<UTxO[]>?)
// create the listing transaction
// sign and submit the transaction
// the NFT is now in the marketplace contract's UTXOs

const listingPrice = 10_000;
test("List NFT for sale", async () => {
  const listingPrice = 10_000n; // Use BigInt for price

  try {
    const listingTx = await testListNFT(
      setup.lucid,
      setup.signerAddr,
      marketplaceAddr,
      setup.policyhash,
      listingPrice,
      setup.utxoWithNft
    );

    // Convert the Tx to a Lucid compatible transaction
    const lucidTx = setup.lucid.fromTx(listingTx.toCbor().toString());

    // Sign and submit the transaction
    const signedTx = await lucidTx.sign().complete();
    await signedTx.submit();

    // Wait for transaction to be processed
    setup.emulator.awaitBlock(20);

    // Verify that the NFT is now in the marketplace contract's UTXOs
    const marketplaceUtxos = await setup.lucid.utxosAt(
      marketplaceAddr.toString()
    );
    const listedNft = marketplaceUtxos.find(
      (u) =>
        u.assets[
          `${setup.policyhash.toString()}${tokenName.toString("hex")}`
        ] === 1n
    );

    expect(listedNft).toBeDefined();
    // Add more assertions here to verify the listing
  } catch (error) {
    console.error("Error in listing NFT:", error);
    throw error;
  }
});

// UNIT-Test2 Buying a listed NFT from the marketplace

//  select the buyer's wallet
//  find the UTXO in the marketplace contract containing the listed NFT
//  ensure the buyer has enough funds to purchase the NFT
//  create the purchase transaction
//  inputs: UTXO from marketplace containing the NFT, UTXOs from buyer containing required funds

//  outputs: Send NFT to buyer's address, Send payment to seller's address

//   Use the correct redeemer for buying
//   sign and submit the transaction
//  Tests: 1) the NFT is no longer in the marketplace contract's UTXOs
//         2) the NFT is now in the buyer's wallet
//         3) the seller received the correct payment
//         4) the protocol treasury received the correct fee?

// Updating an NFT listing on the marketplace

// select the wallet that originally listed the NFT (seller)
// find the UTXO in the marketplace contract containing the listed NFT
// create the update transaction:

//    - input: UTXO from marketplace containing the NFT

//    - output: New UTXO in marketplace with updated listing details like new price

//    - Use the correct redeemer for updating
// sign and submit the transaction
// Tests: 1) old listing UTXO is no longer in the marketplace contract's UTXOs
//        2) new UTXO with the updated listing details is in the marketplace contract's UTXOs
//        3) NFT is still listed and owned by the marketplace contract

// Canceling an NFT listing on the marketplace

// select the wallet that originally listed the NFT (seller)
// find the UTXO in the marketplace contract containing the listed NFT
// create the cancellation transaction:
//    - Input: UTXO from marketplace containing the NFT

//    - Output: Send NFT back to seller's address
//    - Use the correct redeemer for cancellation
//  sign and submit the transaction
// Tests: 1) NFT is no longer in the marketplace contract's UTXOs
//        2) the NFT is back in the seller's wallet
