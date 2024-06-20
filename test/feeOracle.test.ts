import { Data, Emulator, Lucid, Tx } from "@anastasia-labs/lucid-cardano-fork";
import { UTxOTolUtxo, generateAccountSeedPhrase, getUtxoWithAssets, lutxoToUTxO, lutxoToUTxOArray } from "../test/utils";
import { Address, DataI, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PTxOutRef, PaymentCredentials, PubKeyHash, Script, TxBuilder, UTxO, defaultProtocolParameters, pData } from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { tokenName } from "../app/constants";
import { feeOracle, makeFeeOracle } from "../src/contracts/feeOracle";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";
import {test, describe} from 'vitest';
import { getDeployFeeOracleTx } from "../app/txns/feeOracle/getDeployFeeOracleTx.ts";
import { getFeeUpdateTxTest } from "./updateFeeOracleTest.ts"


   const signerAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
   const ownerAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
   const adversaryAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
   const emulator = new Emulator([signerAddr,ownerAddr,adversaryAddr]);

   const lucid = await Lucid.new(emulator);

   async function abstractTx(nonbeaconUtxo : boolean) : Promise<{ policyhash : Hash28 , utxo : UTxO[], script : Script<"PlutusScriptV2">; }> { 
      lucid.selectWalletFromSeed (signerAddr.seedPhrase);
      const initialUtxos = await lucid.wallet.getUtxos();
      const refl = initialUtxos[0];
      const ref = lutxoToUTxO(refl);
      //const refParam = lutxoToUTxO((await lucid.wallet.getUtxos()).at[0]);
      //const oneShotMintTx = await getMintOneShotTx(new TxBuilder(defaultProtocolParameters),refParam,refParam.resolved.address);
      const oneShotMintTx = await getMintOneShotTx(new TxBuilder(defaultProtocolParameters),ref,ref.resolved.address);

      const policy = oneShotMintTx.nftPolicySource.hash;

      const tobeSignedTx = lucid.fromTx(oneShotMintTx.tx.toCbor().toString());

      const signedLucidTx = await tobeSignedTx.sign().complete();
      const nfttxHash = await signedLucidTx.submit();
      
      emulator.awaitBlock(50);
      
      console.log("Utxos after minting", await lucid.utxosAt(signerAddr.address));

      const lucidUtxosAfterMint = await lucid.utxosAt(signerAddr.address);

      const plutsUtxo = lutxoToUTxOArray(lucidUtxosAfterMint);
      // inlcude getdeployfeeoracle 
      const utxoWithNft = plutsUtxo.find(u => u.resolved.value.get(policy,tokenName) === 1n)!;
      //const cfg = tryGetMarketplaceConfig();
      const paymentCred = lucid.utils.paymentCredentialOf(ownerAddr.address); //owner address
      const publicKeyHash = new PubKeyHash (paymentCred.hash);

      const feeOracle = makeFeeOracle(
         PCurrencySymbol.from( policy.toBuffer() ),
         PTokenName.from( tokenName ),
         PPubKeyHash.from( publicKeyHash.toBuffer() )
      );

      const feeOracleAddr = new Address(
         "testnet",
         //cfg.network === "mainnet" ? "mainnet" : "testnet",
         PaymentCredentials.script( feeOracle.hash )
      );

      const offChainTxFeeOracle = await getDeployFeeOracleTx(new TxBuilder(await getProtocolParams()),
                                        utxoWithNft,utxoWithNft.resolved.address,feeOracleAddr,feeOracle,policy);

      const tobeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();
      const lucidFeeOracleTx = lucid.fromTx(tobeSignedFeeOracleTx.toString());
      const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
      const txHashFeeOracle = await signedLucidFeeOracleTx.submit();

      emulator.awaitBlock(50);

      console.log("utxos at sgner addr", await lucid.utxosAt(signerAddr.address));
      console.log("utxos at feeOracle addr", await lucid.utxosAt(feeOracleAddr.toString()));
 
      // construct a datum in lucid -> for new DataI( 25_000 )
      if (nonbeaconUtxo) {

         const feeOracleDatumSchema = Data.Integer();
         type feeOracleDatum = Data.Static<typeof feeOracleDatumSchema>;
         const feeOracleDatum = feeOracleDatumSchema as unknown as feeOracleDatum;
         const datum: feeOracleDatum = 0n// 40_000n; //0
         const newDatum = Data.to(datum, feeOracleDatum);

         const tx = await lucid.newTx().payToContract(feeOracleAddr.toString(),newDatum,{lovelace : 2_000_000n}).complete();
         const txsigned = await tx.sign().complete();
         const txsubmit = await txsigned.submit();

         emulator.awaitBlock(50);
         
      };

      const feeOracleUtxos = await lucid.utxosAt(feeOracleAddr.toString());
      const feeOraclePlutsUtxos =lutxoToUTxOArray(feeOracleUtxos);
      console.log("Fee oracle addr with one more tx", await lucid.utxosAt(feeOracleAddr.toString()));
      return {
            policyhash : policy,
            utxo : feeOraclePlutsUtxos,
            script : feeOracle

      }
      //includes get deplyfeeoracle
      //
   }
//1.another addr not allowed to spend the utxo
//2. none of the utxo should be spendable

  // test("Fee Oracle Contract - Valid case", async() =>{
  // try {
      // to find a UTXo with NFt
      const utxo = await abstractTx(true);
      //const policy = utxo.policyhash;
      const utxoWithNft = utxo.utxo.find(u => u.resolved.value.get(utxo.policyhash,tokenName) === 1n)!;
      const lucidUtxo = UTxOTolUtxo(utxoWithNft);
      console.log("Utxos with NFt", lucidUtxo);

      const feeOracleSource = utxo.utxo.find( u => u.resolved.refScript !== undefined)!;
      const lucidFeeOracleSrc = UTxOTolUtxo(feeOracleSource);
      console.log("utxo with soure",lucidFeeOracleSrc);

      // Transaction is passed to updateFeeOracleTest with a valid input and datum
      /*
      const newFee = 25_000;
      const collateralUtxos = await lucid.utxosAt(signerAddr.address);
      const collateral = lutxoToUTxO(collateralUtxos[0]);
      const updateTx =await getFeeUpdateTxTest(lucid,new TxBuilder(await getProtocolParams()),newFee,collateral,utxoWithNft,feeOracleSource);
      */

      // UpdateFeeOracleTest with a no ouputs
      const newFee = 300_000_000;
      const collateralUtxos = await lucid.utxosAt(signerAddr.address);
      const collateral = lutxoToUTxO(collateralUtxos[0]);
      const updateTx =await getFeeUpdateTxTest(lucid,new TxBuilder(await getProtocolParams()),newFee,collateral,utxoWithNft,feeOracleSource);
      


      // to find a Utxo without NFT

     // const utxoWithoutNft = (utxo.utxo.find((u => u.resolved.value.get(utxo.policyhash,tokenName) != 1n)
                 //                   &&(u => u.resolved.refScript? != utxo.script )))!;
                              //&& (utxo.utxo.find(u => u.resolved.refScript != utxo.script )))!;
     // const lucidUtxWithoutNft = UTxOTolUtxo(utxoWithoutNft);
    //  console.log("Utxos without NFt", lucidUtxWithoutNft);

/*
     
      const cfg = tryGetMarketplaceConfig();
      const paymentCred = lucid.utils.paymentCredentialOf(signerAddr.address);
      const publicKeyHash = new PubKeyHash (paymentCred.hash);

      const feeOracle = makeFeeOracle(
         PCurrencySymbol.from( policy.toBuffer() ),
         PTokenName.from( tokenName ),
         PPubKeyHash.from( publicKeyHash.toBuffer() )
      );

      const feeOracleAddr = new Address(
         cfg.network === "mainnet" ? "mainnet" : "testnet",
         PaymentCredentials.script( feeOracle.hash )
      );

      const offChainTxFeeOracle = await getDeployFeeOracleTx(new TxBuilder(await getProtocolParams()),
                                        utxoWithNft,utxoWithNft.resolved.address,feeOracleAddr,feeOracle,policy); 

      // one more tx at feee oracle addr without nft
      // this 3rd utxo can be referenced to the marketplace contract

      const tobeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();

      const lucidFeeOracleTx = lucid.fromTx(tobeSignedFeeOracleTx.toString());
                                                                          
      const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
                                                                          
      const txHashFeeOracle = await signedLucidFeeOracleTx.submit();
    
      emulator.awaitBlock(50);

      console.log("utxos at fee oracle addr", await lucid.utxosAt(feeOracleAddr.toString()));

      console.log("utxos at address with oneshot mint", await lucid.utxosAt(signerAddr.address));

  }
   catch(error){
       console.log(error);
     }
   },40_000); 


describe('The contract will not execute if OneShotMintNFT is not referenced.', () => {
  test("Fee Oracle Contract - Failure case", async() =>{
  try{
   const utxo = await abstractTx(true);
   /*const policy = utxo.policyhash;
   const utxoWithoutNft = utxo.utxo.filter(u => u.resolved.value.get(policy,tokenName) != 1n)!;

   console.log("Utxos without nft", utxoWithoutNft);

   const cfg = tryGetMarketplaceConfig();
   const paymentCred = lucid.utils.paymentCredentialOf(signerAddr.address);
   const publicKeyHash = new PubKeyHash (paymentCred.hash);

   const feeOracle = makeFeeOracle(
      PCurrencySymbol.from( policy.toBuffer() ),
      PTokenName.from( tokenName ),
      PPubKeyHash.from( publicKeyHash.toBuffer() )
   );

   const feeOracleAddr = new Address(
      cfg.network === "mainnet" ? "mainnet" : "testnet",
      PaymentCredentials.script( feeOracle.hash )
   );

   const offChainTxFeeOracle = await getDeployFeeOracleTx(new TxBuilder(await getProtocolParams()),
            utxoWithoutNft[0],utxoWithoutNft[0].resolved.address,feeOracleAddr,feeOracle,policy); 

   const tobeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();

   const lucidFeeOracleTx = lucid.fromTx(tobeSignedFeeOracleTx.toString());
                                                                       
   const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
                                                                       
   const txHashFeeOracle = await signedLucidFeeOracleTx.submit();
 
   emulator.awaitBlock(50); */

   //console.log("utxos at fee oracle addr", await lucid.utxosAt(feeOracleAddr.toString()));

   //console.log("utxos at address with oneshot mint", await lucid.utxosAt(signerAddr.address));
//}
//  catch(error){
//    console.log(error);
//  }
//})
//},40_000); 