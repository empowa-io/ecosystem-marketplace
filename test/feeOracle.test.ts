import { Emulator, Lucid, Tx as LTx } from "@anastasia-labs/lucid-cardano-fork";

import {
  LucidContext,
  initiateFeeOracle,
  FeeOracleInitiationOutcome,
  generateAccountSeedPhrase,
  lutxoToUTxO,
  getFeeUpdateTx,
} from "./utils.ts";

import { beforeEach, test } from "vitest";

beforeEach<LucidContext>(async (context) => {
  const createUser = async () => {
    return await generateAccountSeedPhrase({ lovelace: BigInt(100_000_000) });
  };
  context.users = {
    owner: await createUser(),
    adversary: await createUser(),
  };

  context.emulator = new Emulator([
    context.users.owner,
    context.users.adversary, //use this user profile for the unhappy test path, adversary setting marketplace fee to 0% without having the Beacon UTxO
  ]);

  context.lucid = await Lucid.new(context.emulator);
});

test<LucidContext>("Test - Valid Update Fee Oracle"),
  async ({ lucid, users, emulator }) => {
    // Select the signer wallet
    lucid.selectWalletFromSeed(users.owner);

    const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
      await initiateFeeOracle(emulator, lucid, users.owner, false);

    const feeOracleScriptUTxO = feeOracleInitiationOutcome.feeOracleUTxOs[0];
    const beaconUTxO = feeOracleInitiationOutcome.feeOracleUTxOs[1];

    const ownerUTxOs = await lucid.wallet.getUtxos();
    const ownersFirstLUTxO = ownerUTxOs[0];
    const ownersFirstUTxO = lutxoToUTxO(ownersFirstLUTxO);

    const feeUpdateTx = await getFeeUpdateTx(
      30_000,
      ownersFirstUTxO,
      beaconUTxO,
      feeOracleScriptUTxO,
      true,
      false
    );

    // Sign and submit the fee update transaction
    const feeUpdateLTx = lucid.fromTx(feeUpdateTx.toCbor().toString());
    const signedFeeUpdateLTx = await feeUpdateLTx.sign().complete();
    const feeUpdateTxHash = await signedFeeUpdateLTx.submit();
    console.log("NFT Tx Hash", feeUpdateTxHash);

    // Wait for the transaction
    emulator.awaitBlock(50);
  };

// test<LucidContext>("Test - Invalid Update Fee Oracle"),
// spend fee oracle UTxo that should not be spendable, return it to adversary wallet take
// the reproduced UTxO at the fee oracle address and try to spend it with inputting the wrong datum
// output field of FeeOracle UTxO should be the adversary wallet for attack
// take this as an argument for getFeeUpdateTx
// add an argument to getFeeUpdateTx called destination Address for customizability of the function (so that we can customize
// it for our sad path test)
