import {
  assetsToValue,
  Script as LScript,
  ScriptType as LScriptType,
  UTxO as LUTxO,
  Assets as LAssets,
  generateSeedPhrase,
  Data,
  Emulator,
  Lucid,
} from "@anastasia-labs/lucid-cardano-fork";
import {
  Address,
  Hash28,
  dataFromCbor,
  Hash32,
  IUTxO,
  Script,
  ScriptType,
  LitteralScriptType,
  UTxO,
  Value,
  DataI,
  DataB,
  pData,
  pDataB,
  pDataI,
  Tx,
  PAddress,
  PCurrencySymbol,
  PPubKeyHash,
  PTokenName,
  PaymentCredentials,
  PubKeyHash,
  TxBuilder,
  DataConstr,
} from "@harmoniclabs/plu-ts";

import { NFTSale } from "../src/contracts/marketplace.ts";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { tokenName } from "../app/constants";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { makeMarketplace } from "../src/contracts/marketplace";
import { getProtocolParams } from "../app/utils/getProtocolParams";

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

export interface MarketplaceInitiationOutcome {
  marketplaceAddr: Address;
  marketplaceUTxOs: UTxO[];
  marketplaceScript: Script<"PlutusScriptV2">;
}

export interface ListedNftInitiationOutcome{
 // Populate this interface with the relevant information
}

export async function initiateFeeOracle(
  emulator: Emulator,
  lucid: Lucid,
  signerSeedPhrase: string,
  produceUnauthenticUTxO: boolean
): Promise<FeeOracleInitiationOutcome> {
  // Select the signer wallet
  lucid.selectWalletFromSeed(signerSeedPhrase);
  const signerAddr = await lucid.wallet.address();

  // Retrieve the signer's UTxOs and convert the first one to a plu-ts UTxO format
  const initialUTxOs = await lucid.wallet.getUtxos();
  const refLUTxO = initialUTxOs[0];
  const refUTxO = lutxoToUTxO(refLUTxO);

  // Create a transaction to mint a single NFT (one-shot minting)
  const oneShotMintTx = await getMintOneShotTx(
    new TxBuilder(await getProtocolParams()),
    refUTxO,
    refUTxO.resolved.address
  );
  const feeOracleNftPolicyHash = oneShotMintTx.nftPolicySource.hash;

  // Sign and submit the minting transaction
  const unsignedOneShotMintTx = lucid.fromTx(
    oneShotMintTx.tx.toCbor().toString()
  );
  const signedOneShotMintTx = await unsignedOneShotMintTx.sign().complete();
  const oneShotMintTxHash = await signedOneShotMintTx.submit();
  //console.log("NFT Tx Hash", oneShotMintTxHash);

  // Wait for the transaction
  emulator.awaitBlock(50);

  //console.log("Utxos at signer addr Utxos after minting", await lucid.utxosAt(signerAddr.address)); // Minted nft is present in the UTxO

  // Find the UTxO containing the minted NFT
  // It has been converted into plu-ts format from Lucid utilizing conversion functions
  const lutxosAfterMint = await lucid.wallet.getUtxos();
  const utxosAfterMint = lutxosAfterMint.map(lutxoToUTxO);
  const beaconUTxO = utxosAfterMint.find(
    // Assuming multiple UTxOs are present, we find the one with the NFT
    (u) => u.resolved.value.get(feeOracleNftPolicyHash, tokenName) === 1n
  )!;
  //console.log("UTxO with NFT", beaconUTxO);
  // Use this beaconUTxO, which contains the minted NFT to be able to set the marketplace fee.

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
    PaymentCredentials.script(feeOracleScript.hash)
  );

  // Index[0] -> UTxO with Reference Script
  // Index[1] -> Beacon UTxO
  // Index[2] -> Unauthentic UTxO, seen on produceUnauthenticUTxO
  const initialDeploymentTxOutputs = [
    {
      address: feeOracleAddr,
      value: Value.lovelaces(10_000_000),
      datum: new DataB(""), // invalid datum for the contract; always fails an empty byte string
      refScript: feeOracleScript,
    },
    {
      address: feeOracleAddr,
      value: new Value([
        Value.singleAssetEntry(feeOracleNftPolicyHash, tokenName, 1),
        Value.lovelaceEntry(2_000_000),
      ]),
      datum: new DataI(25_000), // 2,5% fee
    },
  ];

  // Optionally add an unauthentic UTxO to the initial deployment transaction that tries to set the marketplace fee to 0%
  const deploymentTxOutputs = produceUnauthenticUTxO
    ? [
        ...initialDeploymentTxOutputs,
        {
          address: feeOracleAddr,
          value: new Value([Value.lovelaceEntry(2_000_000)]),
          datum: new DataI(0), // An adversary trying to set the marketplace fee to 0%?
        },
      ]
    : initialDeploymentTxOutputs;
  // Example on how "..." is used to copy the initialDeploymentTxOutputs and add the new output
  // const tempList = initialDeploymentTxOutputs
  // const tempList2 = [...initialDeploymentTxOutputs]
  // Ternary operator "?" is used to check if the produceUnauthenticUTxO is true or false. If true then we add an additional
  // output to the transaction, which would be a case for an adversary setting marketplace fee to 0%

  // Build the Fee Oracle deployment transaction
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

  // Sign and submit the Fee Oracle deployment transaction
  const feeOracleDeploymentTxCBOR = feeOracleDeploymentTx.toCbor();
  const unsignedFeeOracleDeploymentTx = lucid.fromTx(
    feeOracleDeploymentTxCBOR.toString()
  );
  const signedFeeOracleDeploymentTx = await unsignedFeeOracleDeploymentTx
    .sign()
    .complete();
  const feeOracleDeploymentTxHash = await signedFeeOracleDeploymentTx.submit();
  //console.log("Fee Oracle Deployment Tx Hash", feeOracleDeploymentTxHash);
  // This has to be present in the transaction as a reference

  emulator.awaitBlock(50);

  //console.log("utxos at signer addr initialSetup", await lucid.wallet.getUtxos());

  // Get the final state of the Fee Oracle UTxOs
  const feeOracleLUTxOs = await lucid.utxosAt(feeOracleAddr.toString());
  const feeOracleUTxOs = feeOracleLUTxOs.map(lutxoToUTxO);
  //console.log("Fee oracle addr with one more tx", await lucid.getUtxos());
  //console.log("utxos at feeOracle addr", await lucid.utxosAt(feeOracleAddr.toString()));

  return {
    feeOracleNftPolicyHash,
    feeOracleUTxOs,
    feeOracleScript, // UTxO [0] is the UTxO with the reference script
    ownerPublicKeyHash,
    feeOracleAddr,
  };
}

export async function getFeeUpdateTx(
  newFee: number,
  collateral: UTxO,
  feeOracleInput: UTxO,
  feeOracleSource: UTxO,
  provideTxFee: boolean,
  badDatum: boolean
): Promise<Tx> {
  const txBuilder = new TxBuilder(await getProtocolParams());
  const updatedDatum = badDatum ? new DataB(`${newFee}`) : new DataI(newFee);

  const initialInputs = [
    {
      utxo: feeOracleInput, // beacon UTxO with NFT that is being spent
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
    inputs, // beacon UTxO that is being spent
    collaterals: [collateral],
    outputs: [
      {
        address: feeOracleInput.resolved.address, //UTxO sitting at the feeOracleAddr try to get this to adversary wallet
        value: feeOracleInput.resolved.value,
        datum: updatedDatum,
      },
    ],
    changeAddress: collateral.resolved.address,
  });
}

export async function initiateMarketplace(
  emulator: Emulator,
  lucid: Lucid,
  signerSeedPhrase: string
): Promise<MarketplaceInitiationOutcome> {
  // To-Do: Define the MarketplaceInitiationOutcome interface according to the needs

  // Select the signer's wallet who will be deploying the marketplace contract
  lucid.selectWalletFromSeed(signerSeedPhrase);
  const signerAddr = await lucid.wallet.address();

  // Retrieve the signer's UTxOs and convert the first one to a plu-ts UTxO format to be used for marketplace deployment
  const initialUTxOs = await lucid.wallet.getUtxos();
  const marketplaceRefLUTxO = initialUTxOs[0];
  const marketplaceRefUTxO = lutxoToUTxO(marketplaceRefLUTxO);

  // Get the feeOracleNFTPolicyHash from the Fee Oracle initiation outcome to be used as PCurrencySymbol in the marketplace contract
  //FeeOracleInitiationOutcome.feeOracleNftPolicyHash

  // Create the marketplace contract
  const marketplaceScript = makeMarketplace(
    // Define this contract via src/contracts/marketplace.ts, app/txns/marketplace/makeMarketplaceAndGetDeployTx.ts, app/txns/marketplace/getDeployMarketplaceTx.ts
    PCurrencySymbol.from(""), //in plu-ts its "PCurrencySymbol.from( cfg.paymentAsset.policy.toString() )""
    PTokenName.from(""), //in plu-ts PTokenName.from( cfg.paymentAsset.tokenName ),
    PAddress.fromData(pData(Address.fromString(signerAddr).toData())), //owner of the marketplace
    PCurrencySymbol.from(feeOracleNftPolicyHash.toBuffer()), // oracleNFTSymbol
    PTokenName.from(tokenName) // oracleNFTname
  );

  // Generate the marketplace address
  const marketplaceAddr = new Address(
    "testnet",
    PaymentCredentials.script(marketplaceScript.hash)
  );
  //console.log("Marketplace Address",marketplaceAddr.toString());

  //Build the Marketplace deployment transaction
  // Index[0] -> UTxO with Reference Script
  const marketplaceDeploymentOutputs = [
    {
      address: marketplaceAddr,
      value: Value.lovelaces(10_000_000),
      datum: new DataB(""), // invalid datum for the contract; always fails an empty byte string
      refScript: marketplaceScript,
    },
  ];

  const marketplaceDeploymentTxBuilder = new TxBuilder(
    await getProtocolParams()
  );
  const marketplaceDeploymentTx = marketplaceDeploymentTxBuilder.buildSync({
    inputs: [{ utxo: marketplaceRefUTxO }],
    outputs: marketplaceDeploymentOutputs,
    changeAddress: Address.fromString(signerAddr),
  });

  const marketplaceDeploymentTxCBOR = marketplaceDeploymentTx.toCbor();
  const unsignedMarketplaceDeploymentTx = lucid.fromTx(
    marketplaceDeploymentTxCBOR.toString()
  );
  const signedmarketplaceTx = await unsignedMarketplaceDeploymentTx
    .sign()
    .complete();
  const marketplaceDeploymentTxHash = await signedmarketplaceTx.submit();

  emulator.awaitBlock(50);
  //console.log("Utxos at Marketplace Address", await lucid.utxosAt(marketplaceAddr.toString()));

  // Get the final state of the Marketplace UTxOs
  const marketplaceLUTxOs = await lucid.utxosAt(marketplaceAddr.toString());
  const marketplaceUTxOs = marketplaceLUTxOs.map(lutxoToUTxO);

  // Return the relevant information
  return {
    marketplaceAddr,
    marketplaceUTxOs,
    marketplaceScript,
  };
}

export async function initiateListedNft(
  emulator: Emulator,
  lucid: Lucid,
  signerSeedPhrase: string
): Promise<ListedNFTInitiationOutcome> {
 // Move the code from the listing test to here
}

export async function getListNFTTx(
  changeAddress: Address,
  listingUTxO: UTxO,
  marketplaceAddress: Address,
  listNftTokenName: Uint8Array,
  listNftPolicy: Uint8Array,
  initialListingPrice: number | bigint,
  listersAddress: Address
): Promise<Tx> {
  const listingTxBuilder = new TxBuilder(await getProtocolParams());
  return listingTxBuilder.buildSync({
    inputs: [{ utxo: listingUTxO }],
    collaterals: [listingUTxO],
    collateralReturn: {
      address: changeAddress,
      value: Value.sub(listingUTxO.resolved.value, Value.lovelaces(5_000_000)),
    },
    outputs: [
      {
        address: marketplaceAddress,
        value: new Value([
          Value.lovelaceEntry(2_000_000),
          Value.singleAssetEntry(
            new Hash28(listNftPolicy),
            listNftTokenName,
            1
          ),
        ]),
        datum: NFTSale.NFTSale({
          policy: pDataB(listNftPolicy),
          price: pDataI(initialListingPrice),
          seller: pData(listersAddress.toData()),
          tokenName: pDataB(listNftTokenName),
        }),
      },
    ],
    changeAddress: changeAddress,
  });
}

export async function getUpdateListingTx(
  newPrice: number | bigint,
  listedNftUTxO: UTxO,
  collateral: UTxO,
  ownerAddress: Address, //Owner of the listing
  marketplaceSource: UTxO,
  marketplaceAddress: Address
): Promise<Tx> {
  const initialDatum = listedNftUTxO.resolved.datum;
  const initialDatumFields = initialDatum.fields;

  const updateListingTxBuilder = new TxBuilder(await getProtocolParams());
  return await updateListingTxBuilder.build({
    inputs: [
      {
        utxo: listedNftUTxO,
        referenceScriptV2: {
          refUtxo: marketplaceSource,
          datum: "inline",
          /**
           * close redeemer can also be used to update a listed asset (and is more efficient than `Update`)
           *
           * however the contract will not check that the asset is sent back to the contract
           * (which it does if using the `SaleAction.Update({ newPrice })`, or  `new DataConstr(2, [ new DataI( newPrice ) ] )` redeemer)
           **/
          redeemer: new DataConstr(1, []), // SaleAction.Close({})
        },
      },
      { utxo: collateral },
    ],
    outputs: [
      {
        address: marketplaceAddress,
        value: listedNftUTxO.resolved.value,
        datum: new DataConstr(0, [
          new DataI(newPrice), // price
          initialDatumFields[1], // seller
          initialDatumFields[2], // policy
          initialDatumFields[3], // tokenName
        ]),
      },
    ],
    collaterals: [collateral],
    requiredSigners: [ownerAddress.paymentCreds.hash],
    changeAddress: ownerAddress,
  });
}

export async function getCancelListingTx(
  listingUTxO: UTxO,
  collateral: UTxO,
  ownerAddress: Address,
  marketplaceSource: UTxO
): Promise<Tx> {
  const cancelListingTxBuilder = new TxBuilder(await getProtocolParams());
  return await cancelListingTxBuilder.build({
    inputs: [
      {
        utxo: listingUTxO,
        referenceScriptV2: {
          refUtxo: marketplaceSource,
          datum: "inline",
          redeemer: new DataConstr(1, []), // SaleAction.Close({})
        },
      },
      { utxo: collateral },
    ],
    collaterals: [collateral],
    requiredSigners: [ownerAddress.paymentCreds.hash],
    changeAddress: ownerAddress,
  });
}

export const unsafeHexToUint8Array = (hex: string): Uint8Array => {
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
