import { Emulator, Lucid } from "@anastasia-labs/lucid-cardano-fork";
import { generateAccountSeedPhrase, getUtxoWithAssets, lutxoToUTxO } from "../test/utils";
import { Address, PCurrencySymbol, PPubKeyHash, PTokenName, PTxOutRef, PaymentCredentials, TxBuilder, defaultProtocolParameters, pData } from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { tokenName } from "../app/constants";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";
import {test, describe} from 'vitest';
import { getDeployFeeOracleTx } from "../app/txns/feeOracle/getDeployFeeOracleTx.ts";


 test("Fee Oracle Contract - Valid case", async() =>{
    try {
    const userAddress = await generateAccountSeedPhrase({lovelace: 100_000_000n});
    const ownerAddress = await generateAccountSeedPhrase({lovelace:20_000_000n});
    const emulator = new Emulator([userAddress,ownerAddress]);

    const lucid = await Lucid.new(emulator);

    lucid.selectWalletFromSeed (userAddress.seedPhrase);

    const tx = await lucid.newTx()
                .payToAddress(userAddress.address,{lovelace : 80_000_000n})
                .complete();

    const signedTx = await tx.sign().complete();

    const tx1Hash = await signedTx.submit();

    emulator.awaitBlock(50);

    const utxos = await lucid.wallet.getUtxos();

    const refParam = lutxoToUTxO(utxos[0]);
    
    const ref = refParam.utxoRef;

    const offChainTx = await getMintOneShotTx(new TxBuilder(defaultProtocolParameters),refParam,refParam.resolved.address);

    const tobeSignedTx = lucid.fromTx(offChainTx.tx.toCbor().toString());

    const signedLucidTx = await tobeSignedTx.sign().complete();

    const nfttxHash = await signedLucidTx.submit();

    //console.log(nfttxHash);

    emulator.awaitBlock(50);

    const feeOracleNftPolicy = makeFeeOracleNftPolicy( PTxOutRef.fromData( pData( ref.toData() ) ) );
       
    const policy = feeOracleNftPolicy.hash;

    const unit = policy.toString()+tokenName.toString();

    //console.log(unit);

    const lucidUtxosAfterMint = await lucid.utxosAt(userAddress.address);
    
    const utxoWithNft = getUtxoWithAssets(lucidUtxosAfterMint,{[unit]:1n});
    
    const plutsUtxoWithNft = lutxoToUTxO(utxoWithNft[0]);
    
    //console.log("Utxos with NFT", utxoWithNft); 
     
    const cfg = tryGetMarketplaceConfig();
      const publicKey = cfg.signer.vkey;

    const feeOracle = makeFeeOracle(
         PCurrencySymbol.from( policy.toBuffer() ),
         PTokenName.from( tokenName ),
         PPubKeyHash.from( publicKey.hash.toBuffer() )
     );
 
     const feeOracleAddr = new Address(
         cfg.network === "mainnet" ? "mainnet" : "testnet",
         PaymentCredentials.script( feeOracle.hash )
     );

    const offChainTxFeeOracle = await getDeployFeeOracleTx(new TxBuilder(
          await getProtocolParams()),
          plutsUtxoWithNft,plutsUtxoWithNft.resolved.address,feeOracleAddr,feeOracle,policy); 
  
    const tobeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();
  
    const lucidFeeOracleTx = lucid.fromTx(tobeSignedFeeOracleTx.toString());
                                                                              
    const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
                                                                              
    const txHashFeeOracle = await signedLucidFeeOracleTx.submit();
        
    emulator.awaitBlock(50);

    //console.log("utxos at fee oracle addr", await lucid.utxosAt(feeOracleAddr.toString()));

    //console.log("utxos at address with oneshot mint", await lucid.utxosAt(userAddress.address));

     }
     catch(error){
        console.log(error);
     }
    },40_000); 

describe('The contract will not execute if OneShotMintNFT is not referenced.', () => {
  test("Fee Oracle Contract - Failure case", async() =>{
      try {
      const userAddress = await generateAccountSeedPhrase({lovelace: 100_000_000n});
      const ownerAddress = await generateAccountSeedPhrase({lovelace:20_000_000n});
      const emulator = new Emulator([userAddress,ownerAddress]);
  
      const lucid = await Lucid.new(emulator);
  
      lucid.selectWalletFromSeed (userAddress.seedPhrase);
  
      const tx = await lucid.newTx()
                  .payToAddress(userAddress.address,{lovelace : 80_000_000n})
                  .complete();
  
      const signedTx = await tx.sign().complete();
  
      const tx1Hash = await signedTx.submit();
  
      emulator.awaitBlock(50);
  
      const utxos = await lucid.wallet.getUtxos();
  
      const refparam = lutxoToUTxO(utxos[0]);
      
      const ref = refparam.utxoRef;
  
      const offChainTx = await getMintOneShotTx(new TxBuilder(defaultProtocolParameters),refparam,refparam.resolved.address);
  
      const toBeSignedTx = lucid.fromTx(offChainTx.tx.toCbor().toString());
  
      const signedLucidTx = await toBeSignedTx.sign().complete();
  
      const nfttxHash = await signedLucidTx.submit();
  
      //console.log(nfttxHash);
  
      emulator.awaitBlock(50);
  
      const feeOracleNftPolicy = makeFeeOracleNftPolicy( PTxOutRef.fromData( pData( ref.toData() ) ) );
         
      const policy = feeOracleNftPolicy.hash;
  
      //const unit = policy.toString()+tokenName.toString();
  
      //console.log(unit);
  
      const lucidUtxosAfterMint = await lucid.utxosAt(userAddress.address);

      //console.log("utxos after minting",lucidUtxosAfterMint);
      
      const utxoWithoutNft = lucidUtxosAfterMint[0];
  
      //console.log("Utxos with NFT", utxoWithoutNft); 
  
      const plutsUtxoWithNft = lutxoToUTxO(utxoWithoutNft);
  
      //console.log(plutsUtxoWithNft.resolved.value.lovelaces);
  
      const cfg = tryGetMarketplaceConfig();
      const publicKey = cfg.signer.vkey;

      const feeOracle = makeFeeOracle(
         PCurrencySymbol.from( policy.toBuffer() ),
         PTokenName.from( tokenName ),
         PPubKeyHash.from( publicKey.hash.toBuffer() )
     );
 
     const feeOracleAddr = new Address(
         cfg.network === "mainnet" ? "mainnet" : "testnet",
         PaymentCredentials.script( feeOracle.hash )
     );
  
       const offChainTxFeeOracle = await getDeployFeeOracleTx(new TxBuilder(
          await getProtocolParams()),
          plutsUtxoWithNft,plutsUtxoWithNft.resolved.address,feeOracleAddr,feeOracle,policy); 
  
       const toBeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();
  
       const lucidFeeOracleTx = lucid.fromTx(toBeSignedFeeOracleTx.toString());
                                                                              
       const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
                                                                              
       const txHashFeeOracle = await signedLucidFeeOracleTx.submit();
        
       emulator.awaitBlock(50);

       //console.log("utxos at fee oracle addr", await lucid.utxosAt(feeOracleAddr.toString()));

       //console.log("utxos at address with oneshot mint", await lucid.utxosAt(userAddress.address));
       }
       catch(error){
          console.log(error);
       }
      },40_000)
   });  