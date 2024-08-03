import { Emulator, Lucid } from "@anastasia-labs/lucid-cardano-fork";
import {
  UTxOTolUtxo,
  generateAccountSeedPhrase,
  lutxoToUTxO,
  lutxoToUTxOArray,
} from "./utils.ts";
import {
  Address,
  PCurrencySymbol,
  PPubKeyHash,
  PTokenName,
  PaymentCredentials,
  PubKeyHash,
  TxBuilder,
  defaultProtocolParameters,
} from "@harmoniclabs/plu-ts";
import { getMintOneShotTestTx } from "./getMintOneShotTest.ts";
import { tokenName } from "../app/constants.ts";
import { makeFeeOracle } from "../src/contracts/feeOracle.ts";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";
import { test, describe } from "vitest";
import { getDeployFeeOracleTestTx } from "../test/getDeployFeeOracleTest";
import { getDeployFeeOracleWrongOutput } from "./getDeployFeeOracleWrongOutput.ts";
import { getFeeUpdateTxTest } from "./updateFeeOracleTest.ts";
import { getDeployFeeOracleValidTx } from "./getDeployFeeOracleValidInput.ts";
import { getFeeUpdateValidTx } from "./updateFeeOracleValidInput.ts";


//async function abstractTx(nonbeaconUtxo : boolean) : Promise<{ policyhash : Hash28 , utxo : UTxO[]; }> {
test("Fee Oracle - supplying UTxO with NFT", async () => {
  try {
    const signerAddr = await generateAccountSeedPhrase({
      lovelace: 100_000_000n,
    });

    const emulator = new Emulator([signerAddr]);

    const lucid = await Lucid.new(emulator);
    lucid.selectWalletFromSeed(signerAddr.seedPhrase);
    const initialUtxos = await lucid.wallet.getUtxos();
    const refl = initialUtxos[0];
    const ref = lutxoToUTxO(refl);
    const oneShotMintTx = await getMintOneShotTestTx(
      new TxBuilder(defaultProtocolParameters),
      ref,
      ref.resolved.address
    );

    const policy = oneShotMintTx.nftPolicySource.hash;

    const tobeSignedTx = lucid.fromTx(oneShotMintTx.tx.toCbor().toString());

    const signedLucidTx = await tobeSignedTx.sign().complete();
    const nfttxHash = await signedLucidTx.submit();

    emulator.awaitBlock(50);

    console.log("Utxos after minting", await lucid.utxosAt(signerAddr.address));
    const lucidUtxosAfterMint = await lucid.utxosAt(signerAddr.address);

    const plutsUtxo = lutxoToUTxOArray(lucidUtxosAfterMint);

    const utxoWithNft = plutsUtxo.find(
      (u) => u.resolved.value.get(policy, tokenName) === 1n
    )!;

    console.log("utxo with nft", utxoWithNft);
    const paymentCred = lucid.utils.paymentCredentialOf(signerAddr.address);
    const publicKeyHash = new PubKeyHash(paymentCred.hash);

    const feeOracle = makeFeeOracle(
      PCurrencySymbol.from(policy.toBuffer()),
      PTokenName.from(tokenName),
      PPubKeyHash.from(publicKeyHash.toBuffer())
    );

    const feeOracleAddr = new Address(
      "testnet",
      PaymentCredentials.script(feeOracle.hash)
    );

    const offChainTxFeeOracle = await getDeployFeeOracleTestTx(
      new TxBuilder(await getProtocolParams()),
      utxoWithNft,
      utxoWithNft.resolved.address,
      feeOracleAddr,
      feeOracle,
      policy
    );

    const tobeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();
    const lucidFeeOracleTx = lucid.fromTx(tobeSignedFeeOracleTx.toString());
    const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
    const txHashFeeOracle = await signedLucidFeeOracleTx.submit();

    emulator.awaitBlock(50);

    //const feeoracleutxos = await lucid.utxosAt(feeOracleAddr.toString());
    //const feeoraclepluts = lutxoToUTxOArray(feeoracleutxos);
    //console.log("FeeORacle Address", await lucid.utxosAt(feeOracleAddr.toString()));
  } catch (error) {
    console.log(error);
  }
},40_000);


describe("FeeOracle - supplying a UTXo without NFT", () => {
  test("Fee Oracle - supplying UTxO without NFT", async () => {
    try {
      const signerAddr = await generateAccountSeedPhrase({
        lovelace: 100_000_000n,
      });

      const emulator = new Emulator([signerAddr]);

      const lucid = await Lucid.new(emulator);
      lucid.selectWalletFromSeed(signerAddr.seedPhrase);
      const initialUtxos = await lucid.wallet.getUtxos();
      const refl = initialUtxos[0];
      const ref = lutxoToUTxO(refl);
      const oneShotMintTx = await getMintOneShotTestTx(
        new TxBuilder(defaultProtocolParameters),
        ref,
        ref.resolved.address
      );

      const policy = oneShotMintTx.nftPolicySource.hash;

      const tobeSignedTx = lucid.fromTx(oneShotMintTx.tx.toCbor().toString());

      const signedLucidTx = await tobeSignedTx.sign().complete();
      const nfttxHash = await signedLucidTx.submit();

      emulator.awaitBlock(20);

      console.log(
        "Utxos after minting",
        await lucid.utxosAt(signerAddr.address)
      );

      const lucidUtxosAfterMint = await lucid.wallet.getUtxos();

      const plutsUtxos = lutxoToUTxOArray(lucidUtxosAfterMint);

      const utxosWithoutNft = plutsUtxos.filter(
        (u) => u.resolved.value.get(policy, tokenName) !== 1n
      )!;

      const lutxo = UTxOTolUtxo(utxosWithoutNft[0]);
      console.log("utxo without nft", lutxo);

      const paymentCred = lucid.utils.paymentCredentialOf(signerAddr.address);
      const publicKeyHash = new PubKeyHash(paymentCred.hash);

      const feeOracle = makeFeeOracle(
        PCurrencySymbol.from(policy.toBuffer()),
        PTokenName.from(tokenName),
        PPubKeyHash.from(publicKeyHash.toBuffer())
      );

      const feeOracleAddr = new Address(
        "testnet",
        PaymentCredentials.script(feeOracle.hash)
      );

      const offChainTxFeeOracle = await getDeployFeeOracleTestTx(
        new TxBuilder(await getProtocolParams()),
        utxoWithoutNft,
        utxoWithoutNft.resolved.address,
        feeOracleAddr,
        feeOracle,
        policy
      );

      const tobeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();
      const lucidFeeOracleTx = lucid.fromTx(tobeSignedFeeOracleTx.toString());
      const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
      const txHashFeeOracle = await signedLucidFeeOracleTx.submit();

      emulator.awaitBlock(50);

      //const feeoracleutxos = await lucid.utxosAt(feeOracleAddr.toString());
      //const feeoraclepluts = lutxoToUTxOArray(feeoracleutxos);
      //console.log("FeeORacle Address", await lucid.utxosAt(feeOracleAddr.toString()));
    } catch (error) {
      console.log(error);
    }
  });
},40_000);

// Cardano ledger rules enforce the presence of a reference script for script execution
// If a transaction attempts to execute a script without providing the necessary reference script,
// It will fail at the ledger level before reaching the script's logic
// Rather than specific Fee Oracle logic it still can be used to verify the off-chain code, if it is correctly including the reference script in the transaction
describe("FeeOracle - Trying to update the fee without providing reference script", () => { 
  test("Fee Oracle - supplying feeoracle input UTxo intead of feeoracle reference script", async () => {
    try {
      const signerAddr = await generateAccountSeedPhrase({
        lovelace: 100_000_000n,
      });

      const emulator = new Emulator([signerAddr]);

      const lucid = await Lucid.new(emulator);
      lucid.selectWalletFromSeed(signerAddr.seedPhrase);
      const initialUtxos = await lucid.wallet.getUtxos();
      const refl = initialUtxos[0];
      const ref = lutxoToUTxO(refl);
      const oneShotMintTx = await getMintOneShotTestTx(
        new TxBuilder(defaultProtocolParameters),
        ref,
        ref.resolved.address
      );

      const policy = oneShotMintTx.nftPolicySource.hash;

      const tobeSignedTx = lucid.fromTx(oneShotMintTx.tx.toCbor().toString());

      const signedLucidTx = await tobeSignedTx.sign().complete();
      const nfttxHash = await signedLucidTx.submit();

      emulator.awaitBlock(20);

      console.log(
        "Utxos after minting",
        await lucid.utxosAt(signerAddr.address)
      );
      const lucidUtxosAfterMint = await lucid.utxosAt(signerAddr.address);

      const plutsUtxo = lutxoToUTxOArray(lucidUtxosAfterMint);

      const utxoWithNft = plutsUtxo.find(
        (u) => u.resolved.value.get(policy, tokenName) === 1n
      )!;
      const lutxo = UTxOTolUtxo(utxoWithNft);
      console.log("utxo with nft", lutxo);
      const paymentCred = lucid.utils.paymentCredentialOf(signerAddr.address);
      const publicKeyHash = new PubKeyHash(paymentCred.hash);

      const feeOracle = makeFeeOracle(
        PCurrencySymbol.from(policy.toBuffer()),
        PTokenName.from(tokenName),
        PPubKeyHash.from(publicKeyHash.toBuffer())
      );

      const feeOracleAddr = new Address(
        "testnet",
        PaymentCredentials.script(feeOracle.hash)
      );

      const offChainTxFeeOracle = await getDeployFeeOracleWrongOutput(
        new TxBuilder(await getProtocolParams()),
        utxoWithNft,
        utxoWithNft.resolved.address,
        feeOracleAddr,
        feeOracle,
        policy
      );

      const tobeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();
      const lucidFeeOracleTx = lucid.fromTx(tobeSignedFeeOracleTx.toString());
      const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
      const txHashFeeOracle = await signedLucidFeeOracleTx.submit();

      emulator.awaitBlock(50);

      const feeoracleutxos = await lucid.utxosAt(feeOracleAddr.toString());
      const feeoraclepluts = lutxoToUTxOArray(feeoracleutxos);
      console.log("FeeORacle Address", await lucid.utxosAt(feeOracleAddr.toString()));

      const collateral = await lucid.utxosAt(signerAddr.address);
      const plutscollateral = lutxoToUTxO(collateral[0]);
      console.log("collateral for update tx",plutscollateral);
      
     
      const feeOracleInput = feeoraclepluts.find(u=> u.resolved.value.get(policy,tokenName) === 1n )!;
      console.log("Fee ORacle input",feeOracleInput);
      const feeOracleSource = feeoraclepluts.find( u => u.resolved.refScript !== undefined )!;
      const updateTx = await getFeeUpdateTxTest(new TxBuilder(await getProtocolParams()),30000,plutscollateral,feeOracleInput,feeOracleSource);
      const tobeSignedUpdateTx = lucid.fromTx(updateTx.toCbor().toString());
    

    } catch (error) {
      console.log(error);
    }
  });
});


  test("Fee Oracle - valid input", async () => {
    try {
      const signerAddr = await generateAccountSeedPhrase({
        lovelace: 100_000_000n,
      });

      const emulator = new Emulator([signerAddr]);

      const lucid = await Lucid.new(emulator);
      lucid.selectWalletFromSeed(signerAddr.seedPhrase);
      const initialUtxos = await lucid.wallet.getUtxos();
      const refl = initialUtxos[0];
      const ref = lutxoToUTxO(refl);
      const oneShotMintTx = await getMintOneShotTestTx(
        new TxBuilder(defaultProtocolParameters),
        ref,
        ref.resolved.address
      );

      const policy = oneShotMintTx.nftPolicySource.hash;

      const tobeSignedTx = lucid.fromTx(oneShotMintTx.tx.toCbor().toString());

      const signedLucidTx = await tobeSignedTx.sign().complete();
      const nfttxHash = await signedLucidTx.submit();

      emulator.awaitBlock(20);

      console.log(
        "Utxos after minting",
        await lucid.utxosAt(signerAddr.address)
      );
      const lucidUtxosAfterMint = await lucid.utxosAt(signerAddr.address);

      const plutsUtxo = lutxoToUTxOArray(lucidUtxosAfterMint);

      const utxoWithNft = plutsUtxo.find(
        (u) => u.resolved.value.get(policy, tokenName) === 1n
      )!;
      const lutxo = UTxOTolUtxo(utxoWithNft);
      console.log("utxo with nft", lutxo);
      const paymentCred = lucid.utils.paymentCredentialOf(signerAddr.address);
      const publicKeyHash = new PubKeyHash(paymentCred.hash);

      const feeOracle = makeFeeOracle(
        PCurrencySymbol.from(policy.toBuffer()),
        PTokenName.from(tokenName),
        PPubKeyHash.from(publicKeyHash.toBuffer())
      );

      const feeOracleAddr = new Address(
        "testnet",
        PaymentCredentials.script(feeOracle.hash)
      );

      const offChainTxFeeOracle = await getDeployFeeOracleValidTx(
        new TxBuilder(await getProtocolParams()),
        utxoWithNft,
        utxoWithNft.resolved.address,
        feeOracleAddr,
        feeOracle,
        policy
      );

      const tobeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();
      const lucidFeeOracleTx = lucid.fromTx(tobeSignedFeeOracleTx.toString());
      const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
      const txHashFeeOracle = await signedLucidFeeOracleTx.submit();

      emulator.awaitBlock(50);

      const feeoracleutxos = await lucid.utxosAt(feeOracleAddr.toString());
      const feeoraclepluts = lutxoToUTxOArray(feeoracleutxos);
      console.log("FeeORacle Address", await lucid.utxosAt(feeOracleAddr.toString()));

      const collateral = await lucid.utxosAt(signerAddr.address);
      const plutscollateral = lutxoToUTxO(collateral[0]);
      console.log("collateral for update tx",plutscollateral);
      
     
      const feeOracleInput = feeoraclepluts.find(u=> u.resolved.value.get(policy,tokenName) === 1n )!;
      console.log("Fee Oracle input",feeOracleInput);
      const feeOracleSource = feeoraclepluts.find( u => u.resolved.refScript !== undefined )!;
      console.log("fee oracle source", feeOracleSource);
      //const updateTx = await getFeeUpdateTx(new TxBuilder(await getProtocolParams()),30000,policy,plutscollateral);
      const updateTx = await getFeeUpdateValidTx(new TxBuilder(await getProtocolParams()),30000,plutscollateral,feeOracleInput,feeOracleSource);
      const tobeSignedUpdateTx = lucid.fromTx(updateTx.toCbor().toString());
    

    } catch (error) {
      console.log(error);
    }
  });
