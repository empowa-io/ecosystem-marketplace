import { Emulator, Lucid, Tx } from "@anastasia-labs/lucid-cardano-fork";
import { UTxOTolUtxo, generateAccountSeedPhrase, getUtxoWithAssets, lutxoToUTxO, lutxoToUTxOArray } from "../test/utils";
import { Address, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PTxOutRef, PaymentCredentials, PubKeyHash, TxBuilder, UTxO, defaultProtocolParameters, pData } from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { tokenName } from "../app/constants";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";
import {test, describe} from 'vitest';
import { getDeployFeeOracleTx } from "../app/txns/feeOracle/getDeployFeeOracleTx.ts";


   

   const signerAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
    
   const emulator = new Emulator([signerAddr]);

   const lucid = await Lucid.new(emulator);

   async function abstractTx() : Promise<{ policyhash : Hash28 , utxo : UTxO[]; }> {

      lucid.selectWalletFromSeed (signerAddr.seedPhrase);
      const initialUtxos = await lucid.wallet.getUtxos();

      const tx = lucid.newTx().payToAddress(signerAddr.address,{lovelace :10_000_000n}).complete();
      const signedTx = (await tx).sign().complete();
      const submitTx = (await signedTx).submit();
      
      emulator.awaitBlock(50);

      const refParam = lutxoToUTxO((await lucid.wallet.getUtxos()).at[0]);
      const oneShotMintTx = await getMintOneShotTx(new TxBuilder(defaultProtocolParameters),refParam,refParam.resolved.address);
      const policy = oneShotMintTx.nftPolicySource.hash;

      const tobeSignedTx = lucid.fromTx(oneShotMintTx.tx.toCbor().toString());
      const signedLucidTx = await tobeSignedTx.sign().complete();
      const nfttxHash = await signedLucidTx.submit();
      
      emulator.awaitBlock(50);

      
     // console.log("Utxos after minting", await lucid.utxosAt(signerAddr.address));
      const lucidUtxosAfterMint = await lucid.utxosAt(signerAddr.address);

      const plutsUtxo = lutxoToUTxOArray(lucidUtxosAfterMint);
            
      return {
            policyhash : policy,
            utxo : plutsUtxo

      }
   }

   test("Fee Oracle Contract - Valid case", async() =>{
   try {

      const utxo = await abstractTx();
      const policy = utxo.policyhash;
      const utxoWithNft = utxo.utxo.find(u => u.resolved.value.get(policy,tokenName) === 1n)!;

     
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
   const utxo = await abstractTx();
   const policy = utxo.policyhash;
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
 
   emulator.awaitBlock(50);

   //console.log("utxos at fee oracle addr", await lucid.utxosAt(feeOracleAddr.toString()));

   //console.log("utxos at address with oneshot mint", await lucid.utxosAt(signerAddr.address));
}
  catch(error){
    console.log(error);
  }
})
},40_000); 