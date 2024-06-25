import { Emulator, Lucid } from "@anastasia-labs/lucid-cardano-fork";
import { test, expect } from "vitest";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import {
  getUtxoWithAssets,
  lutxoToUTxO,
  generateAccountSeedPhrase,
} from "../test/utils";
import {
  defaultProtocolParameters,
  pData,
  PTxOutRef,
  TxBuilder,
} from "@harmoniclabs/plu-ts";
import { tokenName } from "../app/constants";

test("Test - Only one NFT minted", async () => {
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

  //console.log ("Tx hash",txhash);

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
  //console.log("Utxos with unit", utxoswithunit);

  //const plutusUtxosAfterTx = lutxoToUTxO(utxoswithunit);

  //console.log("plu-ts utxo", plutusUtxosAfterTx);

  //const utxo = utxos.find( u => u.resolved.value.get( nftPolicy, tokenName ) === 1n )

  expect(utxosWithUnitFromTx).toStrictEqual(utxosWithUnitFromAddr);
}, 40_000);
