import { Emulator, Lucid } from "@anastasia-labs/lucid-cardano-fork";
import { test, expect } from "vitest";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import {
  getMintOneShotTx,
  getUtxoWithAssets,
  lutxoToUTxO,
  generateAccountSeedPhrase,
  generateRandomTokenName,
  TIMEOUT
} from "./utils";
import {
  DataI,
  defaultProtocolParameters,
  pData,
  PTxOutRef,
  TxBuilder,
  Value,
  Tx,
} from "@harmoniclabs/plu-ts";
import { tokenName } from "../app/constants";

test("Test - Valid Mint", async () => {
  const userAddress1 = await generateAccountSeedPhrase({
    lovelace: 20_000_000n,
  });

  const emulator = new Emulator([userAddress1]);
  const lucid = await Lucid.new(emulator);
  lucid.selectWalletFromSeed(userAddress1.seedPhrase);

  const tx = await lucid
    .newTx()
    .payToAddress(userAddress1.address, { lovelace: 10_000_000n })
    .complete();

  const signedTx = await tx.sign().complete();
  const tx1Hash = await signedTx.submit();

  emulator.awaitBlock(500);

  const utxos = await lucid.utxosAt(userAddress1.address);
  const plutusUtxos = lutxoToUTxO(utxos[0]);
  const ref = plutusUtxos.utxoRef;

  const offChainTx = await getMintOneShotTx(
    new TxBuilder(defaultProtocolParameters),
    plutusUtxos,
    plutusUtxos.resolved.address
  );

  const toBeSignedTx = lucid.fromTx(offChainTx.tx.toCbor().toString());
  const signedLucidTx = await toBeSignedTx.sign().complete();
  const tx2Hash = await signedLucidTx.submit();

  const feeOracleNftPolicy = makeFeeOracleNftPolicy(
    PTxOutRef.fromData(pData(ref.toData()))
  );

  const policy = feeOracleNftPolicy.hash.toString();
  const unit = policy + tokenName.toString();

  emulator.awaitBlock(50);

  const lucidUtxosAfterTx = await lucid.utxosAt(userAddress1.address);
  const utxosWithUnitFromTx = getUtxoWithAssets(lucidUtxosAfterTx, {
    [unit]: 1n,
  });

  const utxosWithUnitFromAddr = await lucid.utxosAtWithUnit(
    userAddress1.address,
    unit
  );

  expect(utxosWithUnitFromTx).toStrictEqual(utxosWithUnitFromAddr);
}, TIMEOUT);

test("Test - Invalid Mint (Mint with Quantity 3)", async () => {
  expect(async () => {
    const userAddress1 = await generateAccountSeedPhrase({
      lovelace: 20_000_000n,
    });

    const emulator = new Emulator([userAddress1]);

    const lucid = await Lucid.new(emulator);

    lucid.selectWalletFromSeed(userAddress1.seedPhrase);

    const tx = await lucid
      .newTx()
      .payToAddress(userAddress1.address, { lovelace: 10_000_000n })
      .complete();

    const signedTx = await tx.sign().complete();
    const tx1Hash = await signedTx.submit();

    emulator.awaitBlock(500);

    const utxos = await lucid.utxosAt(userAddress1.address);

    const plutsUtxos = lutxoToUTxO(utxos[0]);

    const utxo = plutsUtxos;
    const addr = plutsUtxos.resolved.address;

    const ref = plutsUtxos.utxoRef;

    const feeOracleNftPolicy = makeFeeOracleNftPolicy(
      PTxOutRef.fromData(pData(ref.toData()))
    );

    const policy = feeOracleNftPolicy.hash;

    const mintedValue = new Value([
      Value.singleAssetEntry(policy, tokenName, 3), // Quantity 3
    ]);

    const txBuilder = new TxBuilder(defaultProtocolParameters);
    const offChainTx: Tx = txBuilder.buildSync({
      inputs: [{ utxo }],
      collaterals: [utxo],
      collateralReturn: {
        address: addr,
        value: Value.sub(plutsUtxos.resolved.value, Value.lovelaces(5_000_000)),
      },
      mints: [
        {
          value: mintedValue,
          script: {
            inline: feeOracleNftPolicy,
            policyId: policy,
            redeemer: new DataI(0),
          },
        },
      ],
      changeAddress: plutsUtxos.resolved.address,
    });
  })
    .rejects.toThrow
    // Fail case: Limited to single Fee Oracle NFT
    ();
}, TIMEOUT);

test("Test - Invalid Mint (Mint Multiple NFTs)", async () => {
  expect(async () => {
    const userAddress1 = await generateAccountSeedPhrase({
      lovelace: 20_000_000n,
    });

    const emulator = new Emulator([userAddress1]);

    const lucid = await Lucid.new(emulator);

    lucid.selectWalletFromSeed(userAddress1.seedPhrase);

    const tx = await lucid
      .newTx()
      .payToAddress(userAddress1.address, { lovelace: 10_000_000n })
      .complete();

    const signedTx = await tx.sign().complete();
    const tx1Hash = await signedTx.submit();

    emulator.awaitBlock(500);

    const utxos = await lucid.utxosAt(userAddress1.address);

    const plutsUtxos = lutxoToUTxO(utxos[0]);

    const utxo = plutsUtxos;
    const addr = plutsUtxos.resolved.address;

    const ref = plutsUtxos.utxoRef;

    const feeOracleNftPolicy = makeFeeOracleNftPolicy(
      PTxOutRef.fromData(pData(ref.toData()))
    );

    const policy = feeOracleNftPolicy.hash;

    const mintedValue = new Value([
      Value.singleAssetEntry(policy, tokenName, 1),
      Value.singleAssetEntry(policy, generateRandomTokenName(), 1),
      Value.singleAssetEntry(policy, generateRandomTokenName(), 1),
    ]); // Mint Multiple NFTs

    const txBuilder = new TxBuilder(defaultProtocolParameters);
    const offChainTx: Tx = txBuilder.buildSync({
      inputs: [{ utxo }],
      collaterals: [utxo],
      collateralReturn: {
        address: addr,
        value: Value.sub(plutsUtxos.resolved.value, Value.lovelaces(5_000_000)),
      },
      mints: [
        {
          value: mintedValue,
          script: {
            inline: feeOracleNftPolicy,
            policyId: policy,
            redeemer: new DataI(0),
          },
        },
      ],
      changeAddress: plutsUtxos.resolved.address,
    });
  }).rejects.toThrow();
}, TIMEOUT);
