import { Data, Emulator, Lucid, Tx } from "@anastasia-labs/lucid-cardano-fork";
import {
  UTxOTolUtxo,
  generateAccountSeedPhrase,
  getUtxoWithAssets,
  lutxoToUTxO,
  lutxoToUTxOArray,
} from "../test/utils";
import {
  Address,
  Hash28,
  PCurrencySymbol,
  PPubKeyHash,
  PTokenName,
  PTxOutRef,
  PaymentCredentials,
  PubKeyHash,
  TxBuilder,
  UTxO,
  defaultProtocolParameters,
  pData,
} from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { getMintOneShotTestTx } from "../test/getMintOneShotTest";
import { tokenName } from "../app/constants";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";
import { test, describe } from "vitest";
import { getDeployFeeOracleTestTx } from "../test/getDeployFeeOracleTest";
import { getFeeUpdateTxTest } from "../test/updateFeeOracleTest.ts";

const signerAddr = await generateAccountSeedPhrase({ lovelace: 100_000_000n });

const emulator = new Emulator([signerAddr]);

const lucid = await Lucid.new(emulator);

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
});

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
      const lucidUtxosAfterMint = await lucid.utxosAt(signerAddr.address);

      const plutsUtxo = lutxoToUTxOArray(lucidUtxosAfterMint);

      const utxoWithoutNft = plutsUtxo.find(
        (u) => u.resolved.value.get(policy, tokenName) !== 1n
      )!;
      const lutxo = UTxOTolUtxo(utxoWithoutNft);
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
});
