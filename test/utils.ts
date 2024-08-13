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

export interface ListedNftInitiationOutcome {
  listersAddress: Address; // For update test update and cancel test
  listingUTxO: UTxO, // For cancel test
  marketplaceAddress: Address; // For update test 
  marketplaceSource: UTxO; // For update test update and cancel test
  listedNftUTxO: UTxO // For update test 
}

export async function initiateFeeOracle(
  emulator: Emulator,
  lucid: Lucid,
  signerSeedPhrase: string, //users.owner
  produceUnauthenticUTxO: boolean
): Promise<FeeOracleInitiationOutcome> {

  // Select the signer wallet
  lucid.selectWalletFromSeed(signerSeedPhrase); //users.owner
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

  // Wait for the transaction
  emulator.awaitBlock(50);

  // It has been converted into plu-ts format from Lucid utilizing conversion functions
  const lutxosAfterMint = await lucid.wallet.getUtxos();
  const utxosAfterMint = lutxosAfterMint.map(lutxoToUTxO);
  const beaconUTxO = utxosAfterMint.find(
    // Assuming multiple UTxOs are present, we find the one with the NFT
    (u) => u.resolved.value.get(feeOracleNftPolicyHash, tokenName) === 1n
  )!;

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
  // This has to be present in the transaction as a reference

  emulator.awaitBlock(50);

  // Get the final state of the Fee Oracle UTxOs
  const feeOracleLUTxOs = await lucid.utxosAt(feeOracleAddr.toString());
  const feeOracleUTxOs = feeOracleLUTxOs.map(lutxoToUTxO);


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
  signerSeedPhrase: string //users.owner
): Promise<MarketplaceInitiationOutcome> {
  // Select the signer wallet
  lucid.selectWalletFromSeed(signerSeedPhrase); //users.owner that initiates fee oracle 

  const feeOracleInitiationOutcome: FeeOracleInitiationOutcome =
    await initiateFeeOracle(emulator, lucid, signerSeedPhrase, false); //users.owner
  const feeOracleNftPolicyHash =
    feeOracleInitiationOutcome.feeOracleNftPolicyHash;

  // Select again the owner's wallet who will be deploying the marketplace contract after initiating fee oracle
  lucid.selectWalletFromSeed(signerSeedPhrase); //users.owner
  const signerAddr = await lucid.wallet.address();

  // Retrieve the owners's UTxOs and convert a LUTxO ,suitable for deploying the marketplace, to a plu-ts UTxO format to be used for marketplace deployment
  const initialUTxOs = await lucid.wallet.getUtxos();
  const marketplaceRefLUTxO = initialUTxOs[0]; // ? how to choose the initial UTxO for the marketplace deployment?
  const marketplaceRefUTxO = lutxoToUTxO(marketplaceRefLUTxO);

  // Create the marketplace contract
  const marketplaceScript = makeMarketplace(
    PCurrencySymbol.from(""),
    PTokenName.from(""),
    PAddress.fromData(pData(Address.fromString(signerAddr).toData())), //owner of the marketplace
    PCurrencySymbol.from(feeOracleNftPolicyHash.toBuffer()), // oracleNFTSymbol
    PTokenName.from(tokenName) // oracleNFTname
  );

  // Generate the marketplace address
  const marketplaceAddr = new Address(
    "testnet",
    PaymentCredentials.script(marketplaceScript.hash)
  );

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

export async function initiateListedNft(
  emulator: Emulator,
  lucid: Lucid,
  signerSeedPhrase: string, // users.owner, who deploys the marketplace and thus fee oracle
  listerSeedPhrase: string  // user.lister, who lists the NFT on the marketplace
): Promise<ListedNftInitiationOutcome> {

  // Select users.owner as this user will be initiating the Fee Oracle and deploy the marketplace
  lucid.selectWalletFromSeed(signerSeedPhrase); // users.owner

  // Marketplace that already initiates the Fee Oracle, since the feeOracleNftPolicyHash is needed to deploy the marketplace the fee oracle must be initiated inside the marketplace initiation function
  const marketplaceInitiationOutcome: MarketplaceInitiationOutcome =
    await initiateMarketplace(emulator, lucid, signerSeedPhrase);
  const marketplaceAddress = marketplaceInitiationOutcome.marketplaceAddr;
  const marketplaceSource = marketplaceInitiationOutcome.marketplaceUTxOs[0];

  // Select the lister`s wallet
  lucid.selectWalletFromSeed(listerSeedPhrase); // users.lister

  // Get lister's UTxOs and convert the first one to a plu-ts UTxO format
  const listersInitialUTxOs = await lucid.wallet.getUtxos();
  const listerRefLUTxO = await listersInitialUTxOs[0];
  const listerRefUTxO = await lutxoToUTxO(listerRefLUTxO);

  // Create a transaction to mint a single NFT
  const mintListNftTx = await getMintOneShotTx(
    new TxBuilder(await getProtocolParams()),
    listerRefUTxO,
    listerRefUTxO.resolved.address
  );

  const listNftPolicyHash = mintListNftTx.nftPolicySource.hash;
  const listNftTokenName = unsafeHexToUint8Array("4D594E4654"); //Using the util function to declare a new tokenname for the NFT that will be listed and have a clear distinction between feeOracleNft and the listNft

  // Sign and submit the minting transaction
  const unsignedListNftMintTx = lucid.fromTx(
    mintListNftTx.tx.toCbor().toString()
  );
  const signedListNftMintTx = await unsignedListNftMintTx.sign().complete();
  const listNftMintTxHash = await signedListNftMintTx.submit();

  emulator.awaitBlock(50);

  // Find the UTxO containing the minted NFT to be listed, and convert it into plu-ts format
  const lutxosAfterListNftMint = await lucid.wallet.getUtxos();
  const utxosAfterListNftMint = lutxosAfterListNftMint.map(lutxoToUTxO);
  const listingUTxO = utxosAfterListNftMint.find(
    // Assuming multiple UTxOs are present, we find the one with the NFT
    (u) => u.resolved.value.get(listNftPolicyHash, listNftTokenName) === 1n
  )!;

  // Constants for listing transaction
  const listersAddress = listingUTxO.resolved.address;
  const changeAddress = listingUTxO.resolved.address; // change from the listing transaction will go to lister's address as well
  const initialListingPrice: number = 10_000; 
  const listNftPolicy = listNftPolicyHash.toBuffer(); // policy hash of the NFT to be listed in Uint8Array format

  // Build the listing transaction
  const nftListingTx = await getListNFTTx(
    changeAddress,
    listingUTxO, // UTxO containing the NFT to be listed
    marketplaceAddress,
    listNftTokenName,
    listNftPolicy,
    initialListingPrice,
    listersAddress
  );

  // Sign and submit the listing NFT onto the marketplace transaction
  const nftListingLTx = lucid.fromTx(nftListingTx.toCbor().toString());
  const signedNftListingLTx = await nftListingLTx.sign().complete();
  const nftListingTxHash = await signedNftListingLTx.submit();
  console.log("Listed NFT Tx Hash", nftListingTxHash);

  // Wait for transaction confirmation
  emulator.awaitBlock(50);

  // Find the UTxO of the listed NFT on the marketplace
  const marketplaceLUTxOs = await lucid.utxosAt(marketplaceAddress.toString());
  const marketplaceUTxO = await marketplaceLUTxOs.map(lutxoToUTxO);
  const listedNftUTxO = marketplaceUTxO.find(
    (u) => u.resolved.value.get(listNftPolicyHash, listNftTokenName) === 1n 
  )!;
  return {
    listingUTxO, // For cancel test
    marketplaceAddress, // For update test 
    listersAddress, // For update test update and cancel test
    marketplaceSource, // For update test update and cancel test
    listedNftUTxO // For update test 
  };
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
  listersAddress: Address,
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
    requiredSigners: [listersAddress.paymentCreds.hash],
    changeAddress: listersAddress,
  });
}

// export function getBuyListingTx( // TODO
//   spendingUtxo: UTxO,
//   deployedMarketplaceUTxO: UTxO,
//   collateral: UTxO,
//   returnAddress: Address,
//   oracleUtxo: UTxO,
//   buyer: PubKeyHash | PublicKey | Address,
//   nftPolicy: Uint8Array,
//   nftName: Uint8Array,
//   paymentTokenPolicy: Uint8Array,
//   paymentTokenName: Uint8Array,
//   protocolFeeAmt: number | bigint,
//   protocolOwnerAddress: Address,
//   finalPrice: number | bigint
// ): Tx
// {
//   let buyerPkh: PubKeyHash = undefined as any;
    
//   const buyListingTxBuilder = new TxBuilder(await getProtocolParams());
//   return buyListingTxBuilder.buildSync({
//       inputs: [{
//           utxo: spendingUtxo,
//           referenceScriptV2: {
//               refUtxo: deployedMarketplaceUTxO,
//               redeemer: SaleAction.Buy({}),
//               datum: "inline"
//           }
//       }, { utxo: collateral }],
//       collaterals: [ collateral ],
//       collateralReturn: {
//           address: returnAddress,
//           value: Value.sub(
//               collateral.resolved.value,
//               Value.lovelaces( 15_000_000 )
//           )
//       },
//       readonlyRefInputs: [ oracleUtxo ],
//       requiredSigners: [ new PubKeyHash( buyerPkh ) ],
//       outputs: [
//           // nft to buyer
//           {
//               address: returnAddress,
//               value: new Value([
//                   Value.lovelaceEntry( 2_000_000 ),
//                   Value.singleAssetEntry(
//                       new Hash28( nftPolicy ),
//                       nftName,
//                       1
//                   )
//               ])
//           },
//           // paid protocol treasurery
//           {
//               address: protocolOwnerAddress,
//               value: new Value([
//                   Value.lovelaceEntry( 2_000_000 ),
//                   Value.singleAssetEntry(
//                       new Hash28( paymentTokenPolicy ),
//                       paymentTokenName,
//                       protocolFeeAmt
//                   )
//               ])
//           },
//           // paid seller
//           {
//               address: returnAddress,
//               value: new Value([
//                   Value.lovelaceEntry( 2_000_000 ),
//                   Value.singleAssetEntry(
//                       new Hash28( paymentTokenPolicy ),
//                       paymentTokenName,
//                       finalPrice
//                   )
//               ])
//           },
//       ],
//       changeAddress: returnAddress
//   })
// }

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
