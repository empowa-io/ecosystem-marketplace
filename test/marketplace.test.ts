import { Emulator, Lucid } from "@anastasia-labs/lucid-cardano-fork";
import { UTxOTolUtxo, generateAccountSeedPhrase, getUtxoWithAssets, lutxoToUTxO, lutxoToUTxOArray } from "../test/utils";
import { Address, Hash28, PAddress, PCurrencySymbol, PPubKeyHash, PTokenName, PTxOutRef, PaymentCredentials, PubKeyHash, TxBuilder, UTxO, defaultProtocolParameters, pData } from "@harmoniclabs/plu-ts";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { tokenName } from "../app/constants";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";
//import {test, describe} from 'vitest';
import { getDeployFeeOracleTx } from "../app/txns/feeOracle/getDeployFeeOracleTx.ts";
import { makeMarketplace } from "../src/contracts/marketplace";
import { cli } from "../app/providers/cli.ts";
import { getDeployMarketplaceTx } from "../app/txns/marketplace/getDeployMarketplaceTx.ts"
import { makeMarketplaceAndGetDeployTx } from "../app/txns/marketplace/makeMarketplaceAndGetDeployTx.ts"
import { readFile, writeFile } from "fs/promises";

   const signerAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
    
   const emulator = new Emulator([signerAddr]);

   const lucid = await Lucid.new(emulator);

   async function abstractTx() : Promise<{ policyhash : Hash28 , utxo : UTxO[]; }> {

      lucid.selectWalletFromSeed (signerAddr.seedPhrase);
      const initialUtxos = await lucid.wallet.getUtxos();
      const refParam = lutxoToUTxO(initialUtxos[0]);

      const oneShotMintTx = await getMintOneShotTx(new TxBuilder(defaultProtocolParameters),refParam,refParam.resolved.address);

      const policy = oneShotMintTx.nftPolicySource.hash;

      const tobeSignedTx = lucid.fromTx(oneShotMintTx.tx.toCbor().toString());
      const signedLucidTx = await tobeSignedTx.sign().complete();
      const nfttxHash = await signedLucidTx.submit();
      
      emulator.awaitBlock(50);

      console.log("Utxos after minting", await lucid.utxosAt(signerAddr.address));
      const lucidUtxosAfterMint = await lucid.utxosAt(signerAddr.address);

      const plutsUtxo = lutxoToUTxOArray(lucidUtxosAfterMint);
            
      return {
            policyhash : policy,
            utxo : plutsUtxo

      }
   }

  // test("Fee Oracle Contract - Valid case", async() =>{
  // try {

      const utxo = await abstractTx();
      const policy = utxo.policyhash;
      const utxoWithNft = utxo.utxo.find(u=> u.resolved.value.get(policy,tokenName) === 1n)!;

      //console.log("Utxos with nft", utxoWithNft);
      console.log("inout for feeoracle", UTxOTolUtxo (utxoWithNft!));
      const cfg = tryGetMarketplaceConfig();
      const env = cfg.envFolderPath;
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

      //console.log("utxos at address with oneshot mint", await lucid.utxosAt(signerAddr.address));

   
    const utxoAtSignerAddr = await lucid.utxosAt(signerAddr.address);
    console.log("utxos at signer addr", utxoAtSignerAddr);
    const plutsUtxo = lutxoToUTxOArray(utxoAtSignerAddr);
    const feeOracleUtxos = await lucid.utxosAt(feeOracleAddr.toString());
    const feeOraclePlutsUtxos =  lutxoToUTxOArray(feeOracleUtxos);
    const feeOracleNft = feeOraclePlutsUtxos.find(u => u.resolved.value.get(policy,tokenName) === 1n);
    const refParam = feeOracleNft?.utxoRef;

    console.log("FeeOracle NFt", feeOracleNft);
    console.log("Singer addres utxo",plutsUtxo);
    //const deployMarketplaceTx1 = await makeMarketplaceAndGetDeployTx(new TxBuilder(
    //                                await getProtocolParams()),plutsUtxo,plutsUtxo.resolved.address,feeOracleNft?.utxoRef!);

     const marketplace = makeMarketplace(
        PCurrencySymbol.from( cfg.paymentAsset.policy.toString() ),
        PTokenName.from( cfg.paymentAsset.tokenName ),
        PAddress.fromData( pData( plutsUtxo[0].resolved.address.toData() ) ),
        PCurrencySymbol.from( policy.toBuffer() ),
        PTokenName.from( tokenName )
    );

    const marketplaceAddr = new Address(
        cfg.network === "mainnet" ? "mainnet" : "testnet",
        PaymentCredentials.script( marketplace.hash )
    ); 
    

    const deployMarketplaceTx = await getDeployMarketplaceTx(new TxBuilder(
                                    await getProtocolParams()),plutsUtxo[0],plutsUtxo[0].resolved.address,marketplaceAddr,marketplace);

    const tobeSignedMarketplaceTx = offChainTxFeeOracle.toCbor();

    const lucidMarketplaceTx = lucid.fromTx(tobeSignedMarketplaceTx.toString());
                                                                                        
    const signedLucidMarketplaceTx = await lucidMarketplaceTx.sign().complete();
                                                                                        
    const txHashMarketplace = await signedLucidMarketplaceTx.submit();
                  
    emulator.awaitBlock(50);
              
    console.log("utxos at Marketplace addr", await lucid.utxosAt(marketplaceAddr.toString()));

 // }
  // catch(error){
      // console.log(error);
   //  }
   //},40_000); */