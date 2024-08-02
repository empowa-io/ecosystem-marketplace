import {
  Data,
  Emulator,
  Lucid,
  OutputData,
  Tx as LTx,
} from "@anastasia-labs/lucid-cardano-fork";

import {
  Address,
  DataI,
  DataB,
  Hash28,
  PCurrencySymbol,
  PPubKeyHash,
  PTokenName,
  PTxOutRef,
  PaymentCredentials,
  PubKeyHash,
  Script,
  TxBuilder,
  Tx,
  UTxO,
  defaultProtocolParameters,
  pData,
} from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { tokenName } from "../app/constants";
import { feeOracle, makeFeeOracle } from "../src/contracts/feeOracle";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";
import { beforeEach, test, describe } from "vitest";
import { getDeployFeeOracleTestTx } from "./getDeployFeeOracleTest.ts";
import { getFeeUpdateTxTest } from "./updateFeeOracleTest.ts";
import { getFeeUpdateTx } from "../app/updateFeeOracle.ts";
import { getMintOneShotTestTx } from "../test/getMintOneShotTest.ts";
import { makeFeeOracleAndGetDeployTestTx } from "../test/makeFeeOracleAndGetDeployTest.ts";
import { beforeEach, expect, test } from "vitest";
import {
  LucidContext,
  initiateFeeOracle,
  FeeOracleInitiationOutcome,
  generateAccountSeedPhrase,
  UTxOTolUtxo,
  lutxoToUTxO,
  lutxoToUTxOArray,
} from "./utils.ts";

// valid input and datum
async function getFeeUpdateTx(
  // lucid: Lucid,
  newFee: number,
  //ownerPkh: Hash28,
  collateral: UTxO,
  feeOracleInput: UTxO,
  feeOracleSource: UTxO,
  provideTxFee: boolean,
  badDatum: boolean
  // feeOracleAddr : Address
): Promise<Tx> {
  const txBuilder = new TxBuilder(await getProtocolParams());
  const updatedDatum = badDatum ? new DataB(`${newFee}`) : new DataI(newFee);

  const initialInputs = [
    {
      utxo: feeOracleInput,
      referenceScriptV2: {
        refUtxo: feeOracleSource,
        datum: "inline",
        redeemer: updatedDatum,
      },
    },
  ];

  const inputs = provideTxFee
    ? [...initialInputs, { utxo: collateral }]
    : initialInputs;

  return txBuilder.buildSync({
    inputs,
    collaterals: [collateral],
    outputs: [
      {
        address: feeOracleInput.resolved.address, //feeOracleAddr,
        value: feeOracleInput.resolved.value,
        datum: updatedDatum,
      },
    ],
    changeAddress: collateral.resolved.address,
  });
}

//NOTE: INITIALIZE EMULATOR + ACCOUNTS
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
    context.users.adversary,
  ]);

  context.lucid = await Lucid.new(context.emulator);
});

test<LucidContext>("Test - Valid Update Fee Oracle"),
  async ({ lucid, users, emulator }) => {
    // Select the signer wallet
    lucid.selectWalletFromSeed(users.owner);

    // Get initial utxos and prepare for minting
    const ownerUTxOs = await lucid.wallet.getUtxos();
    const ownersFirstLUTxO = ownerUTxOs[0];
    const ownersFirstUTxO = lutxoToUTxO(ownersFirstLUTxO);

    const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
      await initiateFeeOracle(emulator, lucid, users.owner, false);

    const feeOracleScriptUTxO = feeOracleInitiationOutcome.feeOracleUTxOs[0];
    const beaconUTxO = feeOracleInitiationOutcome.feeOracleUTxOs[1];

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
