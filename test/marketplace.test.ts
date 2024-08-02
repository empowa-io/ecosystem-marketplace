import { Data, Emulator, Lucid, OutputData, Tx } from "@anastasia-labs/lucid-cardano-fork";
import { UTxOTolUtxo, generateAccountSeedPhrase, lutxoToUTxO, lutxoToUTxOArray } from "../test/utils";
import { Address, DataI, Hash28, PAddress, PCurrencySymbol, PPubKeyHash, PTokenName, PTxOutRef, PaymentCredentials, PubKeyHash, Script, TxBuilder, UTxO, defaultProtocolParameters, pData } from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { tokenName } from "../app/constants";
import { feeOracle, makeFeeOracle } from "../src/contracts/feeOracle";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";
import { test, describe} from 'vitest';
import { getDeployFeeOracleTestTx } from "../test/getDeployFeeOracleTest.ts";
import { getFeeUpdateTxTest } from "./updateFeeOracleTest.ts"
import { getFeeUpdateTx } from "../app/updateFeeOracle.ts"
import { getMintOneShotTestTx } from "../test/getMintOneShotTest.ts" ;
import { makeFeeOracleAndGetDeployTestTx} from "../test/makeFeeOracleAndGetDeployTest.ts"
import { makeMarketplaceAndGetDeployTestTx } from "./makeMarketplaceAndGetDeployTest.ts";
import { makeMarketplace } from "../src/contracts/marketplace.ts";
import { getDeployMarketplaceTestTx } from "./getDeployMarketplaceTest.ts";
import { testListNFT } from "./testListNFT.ts";

const signerAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
const ownerAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
const adversaryAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
const emulator = new Emulator([signerAddr,ownerAddr,adversaryAddr]);

const lucid = await Lucid.new(emulator);

// initialSetup is an abstract function to reuse for later
export async function initialSetup(nonbeaconUtxo : boolean) : Promise<{
  policyhash : Hash28 ,
  utxo : UTxO[],
  script : Script<"PlutusScriptV2">,
  ownpkh :PubKeyHash;
  feeOracleAddr : Address,
  utxoWithNft: UTxO  // to return utxoWithNft
}> 
{ 
    // Select the signer wallet
   lucid.selectWalletFromSeed (signerAddr.seedPhrase);
   
   // Get initial utxos and prepare for minting
   const initialUtxos = await lucid.wallet.getUtxos();
   const refl = initialUtxos[0];
   const ref = lutxoToUTxO(refl);

   // Mint the oneshot NFT
   const oneShotMintTx = await getMintOneShotTx(new TxBuilder(await getProtocolParams()),ref,ref.resolved.address);
   const policy = oneShotMintTx.nftPolicySource.hash; // change type of policy to Hash28 so it can be used in the listNFT test
   // Sign and submit the minting transaction
   const tobeSignedTx = lucid.fromTx(oneShotMintTx.tx.toCbor().toString());
   const signedLucidTx = await tobeSignedTx.sign().complete();
   const nfttxHash = await signedLucidTx.submit();
   // Wait for the transaction
   emulator.awaitBlock(50);
   
   //console.log("Utxos after minting", await lucid.utxosAt(signerAddr.address));

   // Find the UTxO containing the minted NFT
   const lucidUtxosAfterMint = await lucid.utxosAt(signerAddr.address);
   const plutsUtxos = lutxoToUTxOArray(lucidUtxosAfterMint); 
   const utxoWithNft = plutsUtxos.find(u => u.resolved.value.get(policy,tokenName) === 1n)!; // I need to use this utxoWithNFT to use on Listing action since it has has the NFT and it has been converted into pluts format from Lucid format
   console.log("Utxo with NFT",utxoWithNft);

   // Prepare for Fee Oracle deployment
   //const cfg = tryGetMarketplaceConfig(); // not needed as we can take inputs from our own emulator. Its a setup tool
   const paymentCred = lucid.utils.paymentCredentialOf(signerAddr.address); //owner address
   const publicKeyHash = new PubKeyHash (paymentCred.hash);

   // Create the Fee Oracle Contract
   const feeOracle = makeFeeOracle(
      PCurrencySymbol.from( policy.toBuffer() ),
      PTokenName.from( tokenName ),
      PPubKeyHash.from( publicKeyHash.toBuffer() )
   );

   // Generate the Fee Oracle address
   const feeOracleAddr = new Address(
      "testnet",
      //cfg.network === "mainnet" ? "mainnet" : "testnet", // the config file is not needed as we can take inputs from our own emulator. Its a setup
      PaymentCredentials.script( feeOracle.hash )
   );

  // Sign and submit the Fee Oracle deployment transaction //has to be present in the transaction as a reference 
   const offChainTxFeeOracle = await getDeployFeeOracleTestTx(new TxBuilder(await getProtocolParams()),
                                     utxoWithNft,utxoWithNft.resolved.address,feeOracleAddr,feeOracle,policy);
   const tobeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();
   const lucidFeeOracleTx = lucid.fromTx(tobeSignedFeeOracleTx.toString());
   const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
   const txHashFeeOracle = await signedLucidFeeOracleTx.submit();

   // Wait for the Fee Oracle deployment to be processed

   emulator.awaitBlock(50);
   //console.log("utxos at signer addr initialSetup", await lucid.utxosAtWithUnit(signerAddr.address, "lovelace"));
   //console.log("utxos at feeOracle addr", await lucid.utxosAt(feeOracleAddr.toString()));

   // Optionally create an additional UTxO at the Fee Oracle address allowed the creation of a UTxO that did not contain the NFT 
   // construct a datum in lucid -> for new DataI( 25_000 )
   if (nonbeaconUtxo) {
      const feeOracleDatumSchema = Data.Integer();
      type feeOracleDatum = Data.Static<typeof feeOracleDatumSchema>;
      const feeOracleDatum = feeOracleDatumSchema as unknown as feeOracleDatum;
      const datum: feeOracleDatum = 0n// 40_000n; //0 // // Initial datum value
      //const newDatum = Data.to(datum, feeOracleDatum);
      const newDatum: OutputData = {inline: Data.to(datum, feeOracleDatum)};
      const tx = await lucid.newTx().payToContract(feeOracleAddr.toString(),newDatum,{lovelace : 2_000_000n}).complete();
      const txsigned = await tx.sign().complete();
      const txsubmit = await txsigned.submit();
      emulator.awaitBlock(50);
   };
   // Get the final state of the Fee Oracle UTxOs
   const feeOracleUtxos = await lucid.utxosAt(feeOracleAddr.toString());
   const feeOraclePlutsUtxos =lutxoToUTxOArray(feeOracleUtxos);
   //console.log("Fee oracle addr with one more tx", await lucid.utxosAt(feeOracleAddr.toString()));
   return {
         policyhash : policy,
         utxo : feeOraclePlutsUtxos,
         script : feeOracle,
         feeOracleAddr : feeOracleAddr,
         ownpkh : publicKeyHash,
         utxoWithNft: utxoWithNft  // Return the utxoWithNft
       }
  emulator.awaitBlock(30);
 
}

// Create the marketplace address
const utxo = (await lucid.utxosAt(signerAddr.address))[0];
const inputUtxo = lutxoToUTxO(utxo)
//console.log("Input utxo",inputUtxo);
//const refUtxo = await initialSetup(true);
//console.log("Output of abstract tx",UTxOTolUtxo(refUtxo.utxo[1]));
//const marketplaceTx = makeMarketplaceAndGetDeployTestTx
//                      (new TxBuilder (await getProtocolParams()), inputUtxo, inputUtxo.resolved.address,inputUtxo.utxoRef);

const addr = Address.fromString(ownerAddr.address);

// Create the marketplace contract
const marketplace = makeMarketplace(
 PCurrencySymbol.from( "" ),
 PTokenName.from( "" ),
 PAddress.fromData( pData( addr.toData() )) ,
 PCurrencySymbol.from( refUtxo.policyhash.toBuffer() ),
 PTokenName.from( tokenName )
);

// Generate the marketplace address
const marketplaceAddr = new Address(
 "testnet",
 PaymentCredentials.script( marketplace.hash )
);

//console.log("Marketplace Address",marketplaceAddr.toString());

// Switch to the owner's wallet
lucid.selectWalletFromSeed (ownerAddr.seedPhrase);
const ownerUtxos = await lucid.wallet.getUtxos();
const ownerUtxo = ownerUtxos[0];

// Sign and submit the marketplace deployment transaction
const deployMarketplaceTx = await getDeployMarketplaceTestTx(new TxBuilder(await getProtocolParams()),lutxoToUTxO(ownerUtxo),addr,marketplaceAddr,marketplace)
const tobeSignedMarketplaceTx = deployMarketplaceTx.toCbor();
const marketplaceTx = lucid.fromTx(tobeSignedMarketplaceTx.toString());
const signedmarketplaceTx = await marketplaceTx.sign().complete();
const txHashMarketplace = await signedmarketplaceTx.submit();

emulator.awaitBlock(20);

//console.log("Utxos at Marketplace Address", await lucid.utxosAt(marketplaceAddr.toString()));






// UNIT TESTS
// Listing an NFT for sale on marketplace (this scenario is for off-chain testing and needs to be compliant with the smart contract)

// Select the wallet that holds the NFT
// find the UTXO containing the NFT (In Lucid: utxosAtWithUnit(addressOrCredential: Address | Credential, unit: Unit): Promise<UTxO[]>?)
// create the listing transaction
// sign and submit the transaction
// the NFT is now in the marketplace contract's UTXOs

test("List NFT for sale", async () => {
  //const utxoWithNft = {refUtxo.utxoWithNft};  // Use the utxoWithNft as a reference to the fee numerator
  //const nftPolicy = refUtxo.policyhash; // This is a Hash28 object
  const listingPrice = 10_000;
  //console.log("NFT Policy of the NFT used for Listing",nftPolicy);
  //console.log("Utxos at signer addr", (await lucid.utxosAt(signerAddr.address))[0]);
  //console.log("Plu-ts compatible utxos at signer addr", utxoWithNft);
  try {
      const listingTx = await testListNFT(
        lucid,
        signerAddr,
        marketplaceAddr,
        nftPolicy, 
        listingPrice,
        utxoWithNft  // Pass the utxoWithNft to testListNFT
      );

      // Convert the Tx to a Lucid compatible transaction
      const lucidTx = lucid.fromTx(listingTx.toCbor().toString());
      
      // Sign and submit the transaction
      const signedTx = await lucidTx.sign().complete();
      await signedTx.submit();

      // Wait for transaction to be processed
      emulator.awaitBlock(20);

      // TO-DO Verify that the NFT is now in the marketplace contract's UTXOs
      const marketplaceUtxos = await lucid.utxosAt(marketplaceAddr.toString());
      const listedNft = marketplaceUtxos.find(u => u.assets[nftPolicy.toString()] === 1n);
      // how to verify? (maybe NFT policy id in marketplace utxo = NFT policy id that was minted?)

      
  } catch (error) {
      console.error("Error in listing NFT:", error);
      throw error;
  }
});


// Buying a listed NFT from the marketplace

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