import { Data, Emulator, Lucid, Tx } from "@anastasia-labs/lucid-cardano-fork";
import { UTxOTolUtxo, generateAccountSeedPhrase, getUtxoWithAssets, lutxoToUTxO, lutxoToUTxOArray } from "../test/utils";
import { Address, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PTxOutRef, PaymentCredentials, PubKeyHash, TxBuilder, UTxO, defaultProtocolParameters, pData } from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { tokenName } from "../app/constants";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";
import {test, describe} from 'vitest';
import { getDeployFeeOracleTest } from "../test/getDeployFeeOracleTest";


   const signerAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
    
   const emulator = new Emulator([signerAddr]);

   const lucid = await Lucid.new(emulator);


   //async function abstractTx(nonbeaconUtxo : boolean) : Promise<{ policyhash : Hash28 , utxo : UTxO[]; }> { 

      lucid.selectWalletFromSeed (signerAddr.seedPhrase);
      const initialUtxos = await lucid.wallet.getUtxos();
      const refl = initialUtxos[0];
      const ref = lutxoToUTxO(refl);
      const oneShotMintTx = await getMintOneShotTx(new TxBuilder(defaultProtocolParameters),ref,ref.resolved.address);

      const policy = oneShotMintTx.nftPolicySource.hash;

      const tobeSignedTx = lucid.fromTx(oneShotMintTx.tx.toCbor().toString());

      const signedLucidTx = await tobeSignedTx.sign().complete();
      const nfttxHash = await signedLucidTx.submit();
      
      emulator.awaitBlock(50);

    /*  const tx = lucid.newTx().payToAddress(signerAddr.address,{lovelace :10_000_000n}).complete();
      const signedTx = (await tx).sign().complete();
      const submitTx = (await signedTx).submit();
      
      emulator.awaitBlock(50);*/
      
      console.log("Utxos after minting", await lucid.utxosAt(signerAddr.address));
      const lucidUtxosAfterMint = await lucid.utxosAt(signerAddr.address);

      const plutsUtxo = lutxoToUTxOArray(lucidUtxosAfterMint);
      // inlcude getdeployfeeoracle 
      const utxoWithNft = plutsUtxo.find(u => u.resolved.value.get(policy,tokenName) === 1n)!;

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

      const offChainTxFeeOracle = await getDeployFeeOracleTest(new TxBuilder(await getProtocolParams()),
                                        utxoWithNft,utxoWithNft.resolved.address,feeOracleAddr,feeOracle,policy,1);

      const tobeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();
      const lucidFeeOracleTx = lucid.fromTx(tobeSignedFeeOracleTx.toString());
      const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
      const txHashFeeOracle = await signedLucidFeeOracleTx.submit();

      emulator.awaitBlock(50);
      /*return {
        policyhash : policy,
        utxo : plutsUtxo

       } */
    //}