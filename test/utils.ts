import {
  assetsToValue,
  Script as LScript,
  ScriptType as LScriptType,
  UTxO as LUTxO,
  Assets as LAssets,
  valueToAssets,
  generateSeedPhrase,
  Lucid,
} from "@anastasia-labs/lucid-cardano-fork";
import {
  Address,
  dataFromCbor,
  Hash32,
  IUTxO,
  Script,
  ScriptType,
  LitteralScriptType,
  UTxO,
  Value,
  Hash28,
  IValue,
  DataI,
  DataB,
  Tx,
} from "@harmoniclabs/plu-ts";

import {
  assetsToValue,
  Script as LScript,
  ScriptType as LScriptType,
  UTxO as LUTxO,
  Assets as LAssets,
  valueToAssets,
  generateSeedPhrase,
  Lucid,
} from "@anastasia-labs/lucid-cardano-fork";

import {
  Data,
  Emulator,
  Lucid,
  OutputData,
} from "@anastasia-labs/lucid-cardano-fork";
import {
  Address,
  Hash28,
  PAddress,
  PCurrencySymbol,
  PPubKeyHash,
  PTokenName,
  PaymentCredentials,
  PubKeyHash,
  Script,
  TxBuilder,
  UTxO,
  ITxBuildInput,
} from "@harmoniclabs/plu-ts";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { tokenName } from "../app/constants";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { getProtocolParams } from "../app/utils/getProtocolParams";
import { getDeployFeeOracleTestTx } from "./-OLD-getDeployFeeOracleTest";
import { UTxOTolUtxo } from "./utils";

export type LucidContext = {
  lucid: Lucid;
  users: any;
  emulator: Emulator;
};

export const FeeOracleDatumSchema = Data.Integer();
export type FeeOracleDatum = Data.Static<typeof FeeOracleDatumSchema>;
export const FeeOracleDatum = FeeOracleDatumSchema as unknown as FeeOracleDatum;

export interface FeeOracleInitiationOutcome {
  feeOracleNftPolicyHash: Hash28;
  feeOracleUTxOs: UTxO[];
  feeOracleScript: Script<"PlutusScriptV2">;
  ownerPublicKeyHash: PubKeyHash;
  feeOracleAddr: Address;
}

// initialSetup is an abstract function to be used for setting up the initial state of the marketplace, deploying the fee oracle
// and minting the NFT to be able to use the UTxOs in our testing
export async function initiateFeeOracle(
  emulator: Emulator,
  lucid: Lucid,
  signerSeedPhrase: string,
  produceUnauthenticUTxO: boolean
): Promise<FeeOracleInitiationOutcome> {
  // Select the signer wallet
  lucid.selectWalletFromSeed(signerSeedPhrase);
  const signerAddr = await lucid.wallet.address();

  // Get initial utxos and prepare for minting
  const initialUTxOs = await lucid.wallet.getUtxos();
  const refLUTxO = initialUTxOs[0];
  const refUTxO = lutxoToUTxO(refLUTxO);

  // Mint the oneshot NFT
  const oneShotMintTx = await getMintOneShotTx(
    new TxBuilder(await getProtocolParams()),
    refUTxO,
    refUTxO.resolved.address
  );
  const feeOracleNftPolicyHash = oneShotMintTx.nftPolicySource.hash; // change type of policy to Hash28 so it can be used in the listNFT test

  // Sign and submit the minting transaction,sent back to Signer
  const unsignedOneShotMintTx = lucid.fromTx(
    oneShotMintTx.tx.toCbor().toString()
  );
  const signedOneShotMintTx = await unsignedOneShotMintTx.sign().complete();
  const oneShotMintTxHash = await signedOneShotMintTx.submit();
  console.log("NFT Tx Hash", oneShotMintTxHash);

  // Wait for the transaction
  emulator.awaitBlock(50);

  //console.log("Utxos after minting", await lucid.utxosAt(signerAddr.address));

  // Find the UTxO containing the minted NFT
  const lutxosAfterMint = await lucid.wallet.getUtxos();
  const utxosAfterMint = lutxosAfterMint.map(lutxoToUTxO);
  const beaconUTxO = utxosAfterMint.find(
    (u) => u.resolved.value.get(feeOracleNftPolicyHash, tokenName) === 1n
  )!; // I need to use this beaconUTxO to use on Listing action since it has has the NFT and it has been converted into pluts format from Lucid format
  console.log("UTxO with NFT", beaconUTxO);

  // Prepare for Fee Oracle deployment
  const ownerPaymentCredential = lucid.utils.paymentCredentialOf(signerAddr); //owner address
  const ownerPublicKeyHash = new PubKeyHash(ownerPaymentCredential.hash);

  // Create the Fee Oracle Contract
  const feeOracleScript = makeFeeOracle(
    PCurrencySymbol.from(feeOracleNftPolicyHash.toBuffer()),
    PTokenName.from(tokenName),
    PPubKeyHash.from(ownerPublicKeyHash.toBuffer())
  );

  // Generate the Fee Oracle address
  const feeOracleAddr = new Address(
    "testnet",
    //cfg.network === "mainnet" ? "mainnet" : "testnet", // the config file is not needed as we can take inputs from our own emulator. Its a setup
    PaymentCredentials.script(feeOracleScript.hash)
  );

  // Index[0] -> UTxO with Reference Script
  // Index[1] -> Beacon UTxO
  // Index[2] -> Unauthentic UTxO
  const initialDeploymentTxOutputs = [
    {
      address: feeOracleAddr,
      value: Value.lovelaces(10_000_000),
      datum: new DataB(""), // invalid datum for the contract; always fails
      refScript: feeOracleScript,
    },
    {
      address: feeOracleAddr,
      value: new Value([
        Value.singleAssetEntry(feeOracleNftPolicyHash, tokenName, 1),
        Value.lovelaceEntry(2_000_000),
      ]),
      datum: new DataI(25_000), // 2,5% fee //inlineDatum //
    },
  ];

  // const tempList = initialDeploymentTxOutputs
  // const tempList2 = [...initialDeploymentTxOutputs]
  // Ternary operator "?" is used to check if the produceUnauthenticUTxO is true or false if thats the case then we add an additional
  // output to the transaction which would be an adversary setting fee to 0%,  "..." is used to copy the initialDeploymentTxOutputs and add the new output
  const deploymentTxOutputs = produceUnauthenticUTxO
    ? [
        ...initialDeploymentTxOutputs,
        {
          address: feeOracleAddr,
          value: new Value([Value.lovelaceEntry(2_000_000)]),
          datum: new DataI(0),
        },
      ]
    : initialDeploymentTxOutputs;
  const initialDeploymentTx = new TxBuilder(await getProtocolParams());
  const feeOracleDeploymentTx = initialDeploymentTx.buildSync({
    inputs: [{ utxo: beaconUTxO }],
    collaterals: [beaconUTxO],
    collateralReturn: {
      address: Address.fromString(signerAddr),
      value: Value.sub(beaconUTxO.resolved.value, Value.lovelaces(5_000_000)),
    },
    outputs: deploymentTxOutputs,
    changeAddress: Address.fromString(signerAddr),
  });

  // Sign and submit the Fee Oracle deployment transaction //has to be present in the transaction as a reference
  const feeOracleDeploymentTxCBOR = feeOracleDeploymentTx.toCbor();
  const unsignedFeeOracleDeploymentTx = lucid.fromTx(
    feeOracleDeploymentTxCBOR.toString()
  );
  const signedFeeOracleDeploymentTx = await unsignedFeeOracleDeploymentTx
    .sign()
    .complete();
  const feeOracleDeploymentTxHash = await signedFeeOracleDeploymentTx.submit();
  console.log("Fee Oracle Deployment Tx Hash", feeOracleDeploymentTxHash);

  emulator.awaitBlock(50);
  //console.log("utxos at signer addr initialSetup", await lucid.utxosAtWithUnit(signerAddr.address, "lovelace"));
  //console.log("utxos at feeOracle addr", await lucid.utxosAt(feeOracleAddr.toString()));

  // Get the final state of the Fee Oracle UTxOs
  const feeOracleLUTxOs = await lucid.utxosAt(feeOracleAddr.toString());
  const feeOracleUTxOs = feeOracleLUTxOs.map(lutxoToUTxO);

  //console.log("Fee oracle addr with one more tx", await lucid.getUtxos());
  return {
    feeOracleNftPolicyHash,
    feeOracleUTxOs,
    feeOracleScript, // UTxO [0] is the UTxO with the reference script
    ownerPublicKeyHash,
    feeOracleAddr,
  };
}

const unsafeHexToUint8Array = (hex: string): Uint8Array => {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
};

const lscriptToScript = (s: LScript): Script => {
  const scriptType: LScriptType = s.type;
  const st: ScriptType =
    scriptType == "PlutusV2"
      ? ScriptType.PlutusV2
      : scriptType == "PlutusV1"
      ? ScriptType.PlutusV1
      : ScriptType.NativeScript;
  return new Script<LitteralScriptType>(st, unsafeHexToUint8Array(s.script));
};

export const lutxoToUTxO = (u: LUTxO): UTxO => {
  const datum = u.datum
    ? dataFromCbor(u.datum)
    : u.datumHash
    ? new Hash32(u.datumHash!)
    : undefined;
  const iutxo: IUTxO = {
    resolved: {
      address: Address.fromString(u.address),
      datum,
      refScript: u.scriptRef ? lscriptToScript(u.scriptRef) : undefined,
      value: Value.fromCbor(assetsToValue(u.assets).to_bytes()), // TODO
    },
    utxoRef: {
      id: u.txHash,
      index: u.outputIndex,
    },
  };

  return new UTxO(iutxo);
};

const assertNever = (value: never): never => {
  throw new Error(`Unexpected value: ${value}`);
};

const uint8ArrayToHex = (uint8Array: Uint8Array): string => {
  return Array.from(uint8Array)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const scriptToLScript = (s: Script): LScript => {
  const st: LScriptType =
    s.type == ScriptType.PlutusV1
      ? "PlutusV1"
      : s.type == ScriptType.PlutusV2
      ? "PlutusV2"
      : s.type == ScriptType.NativeScript
      ? "Native"
      : assertNever(s.type);
  return {
    type: st,
    script: uint8ArrayToHex(s.bytes),
  };
};

export const valueToLAssets = (v: Value): LAssets => {
  const units = v.toUnits();
  return units.reduce((acc, u) => {
    acc[u.unit] = u.quantity;
    return acc;
  }, {});
};

export const utxoToLUTxO = (u: UTxO): LUTxO => {
  const utxo: LUTxO = {
    txHash: u.utxoRef.id.toString(),
    outputIndex: u.utxoRef.index,
    assets: valueToLAssets(u.resolved.value), //Assets
    address: u.resolved.address.toString(),
    datumHash: u.resolved.datum?.toString(),
    datum: u.resolved.datum?.toString(),
    scriptRef: u.resolved.refScript
      ? scriptToLScript(u.resolved.refScript)
      : undefined,
  };

  return utxo;
};

export function getUtxoWithAssets(utxos: LUTxO[], minAssets: LAssets): LUTxO[] {
  const utxo = utxos.find((utxo) => {
    for (const [unit, value] of Object.entries(minAssets)) {
      if (!Object.hasOwn(utxo.assets, unit) || utxo.assets[unit] < value) {
        return false;
      }
    }
    return true;
  });

  if (!utxo) {
    throw new Error(
      "No UTxO found containing assets: " +
        JSON.stringify(minAssets, bigIntReplacer)
    );
  }
  return [utxo];
}

export function bigIntReplacer(_k: any, v: any) {
  return typeof v === "bigint" ? v.toString() : v;
}

export const generateAccountSeedPhrase = async (assets: LAssets) => {
  const seedPhrase = generateSeedPhrase();
  return {
    seedPhrase,
    address: await (await Lucid.new(undefined, "Custom"))
      .selectWalletFromSeed(seedPhrase)
      .wallet.address(),
    assets,
  };
};

// AbstractTx -> "initialSetup" function, will be used as a utility function under utils.ts and called during marketplace.test.ts
// we will deploy marketplace in first "abstract function" than deploy fee oracle seperately

// valid input and datum
export async function getFeeUpdateTx(
  newFee: number,
  collateralUTxO: UTxO,
  feeOracleInput: ITxBuildInput
  //feeOracleAddr : Address
): Promise<Tx> {
  const txBuilder = new TxBuilder(await getProtocolParams());
  const nextDatum = new DataI(newFee);
  return txBuilder.buildSync({
    inputs: [feeOracleInput],
    collaterals: [collateralUTxO],
    outputs: [
      {
        address: feeOracleUTxO.resolved.address, //feeOracleAddr,
        value: feeOracleUTxO.resolved.value,
        datum: nextDatum,
      },
    ],
    changeAddress: collateralUTxO.resolved.address,
  });
}
