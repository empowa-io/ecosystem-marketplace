import {
  Address,
  PAddress,
  PCurrencySymbol,
  PTokenName,
  PaymentCredentials,
  pData,
} from "@harmoniclabs/plu-ts";
import { testListNFT } from "./testListNFT.ts";
import { test, describe, beforeAll } from "vitest";
import { makeMarketplace } from "../src/contracts/marketplace";
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
