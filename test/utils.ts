import {
  assetsToValue,
  Script as LScript,
  ScriptType as LScriptType,
  UTxO as LUTxO,
  Assets as LAssets,
  generateSeedPhrase,
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
  punsafeConvertType,
  PTxOutRef,
  ProtocolParamters,
  CborPositiveRational,
  ExBudget,
} from "@harmoniclabs/plu-ts";

import { NFTSale, SaleAction } from "../src/contracts/marketplace.js";
import { tokenName } from "../app/constants";
import { makeFeeOracle } from "../src/contracts/feeOracle";
import { makeMarketplace } from "../src/contracts/marketplace";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy.js";
import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { BlockfrostPluts } from "@harmoniclabs/blockfrost-pluts";

export const TIMEOUT = 120_000;

export type LucidContext = {
  lucid: Lucid;
  users: any;
  emulator: Emulator;
};
export interface FeeOracleInitiationOutcome {
  feeOracleNftPolicyHash: Hash28;
  feeOracleUTxOs: UTxO[];
  feeOracleScript: Script<"PlutusScriptV2">;
  ownerPublicKeyHash: PubKeyHash;
  feeOracleAddr: Address;
}

export interface MarketplaceInitiationOutcome {
  marketplaceOwnerAddress: Address;
  marketplaceAddr: Address;
  marketplaceRefScriptUTxO: UTxO;
  marketplaceScript: Script<"PlutusScriptV2">;
  currencyPolicyId: Hash28 | "";
  currencyTokenName: Uint8Array;
}

export interface NftListingOutcome {
  sellerAddress: Address;
  listedNftUTxO: UTxO;
  listNftPolicy: Uint8Array;
  listNftTokenName: Uint8Array;
}

export async function getMintOneShotTx(
  txBuilder: TxBuilder,
  utxoToSpend: UTxO,
  returnAddress: Address
): Promise<{
  nftPolicySource: Script<"PlutusScriptV2">;
  tx: Tx;
}> {
  const utxo = utxoToSpend;
  const addr = returnAddress;
  const ref = utxo.utxoRef;
  const feeOracleNftPolicy = makeFeeOracleNftPolicy(
    PTxOutRef.fromData(pData(ref.toData()))
  );
  const policy = feeOracleNftPolicy.hash;
  const mintedValue = new Value([Value.singleAssetEntry(policy, tokenName, 1)]);
  return {
    tx: txBuilder.buildSync({
      inputs: [{ utxo }],
      collaterals: [utxo],
      collateralReturn: {
        address: addr,
        value: Value.sub(utxo.resolved.value, Value.lovelaces(5_000_000)),
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
      changeAddress: addr,
    }),
    nftPolicySource: feeOracleNftPolicy,
  };
}

export async function initiateFeeOracle(
  emulator: Emulator,
  lucid: Lucid,
  ownerSeedPhrase: string, //users.owner
  produceUnauthenticUTxO: boolean
): Promise<FeeOracleInitiationOutcome> {
  // Select the signer wallet
  lucid.selectWalletFromSeed(ownerSeedPhrase); //users.owner
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

  emulator.awaitBlock(50);

  // UTxO has been converted into plu-ts format from Lucid utilizing conversion functions
  const lutxosAfterMint = await lucid.wallet.getUtxos();
  const utxosAfterMint = lutxosAfterMint.map(lutxoToUTxO);
  const beaconUTxO = utxosAfterMint.find(
    // Assuming multiple UTxOs are present, we find the one with the NFT
    (u) => u.resolved.value.get(feeOracleNftPolicyHash, tokenName) === BigInt(1)
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
  badDatum: boolean,
  destinationAddress?: Address
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

  const outputs = destinationAddress
    ? [
        {
          address: destinationAddress, // UTxO sitting at the adversary wallet
          value: feeOracleInput.resolved.value,
          datum: updatedDatum,
        },
      ]
    : [
        {
          address: feeOracleInput.resolved.address, // UTxO sitting at the feeOracleAddr
          value: feeOracleInput.resolved.value,
          datum: updatedDatum,
        },
      ];

  return txBuilder.buildSync({
    inputs,
    collaterals: [collateral],
    requiredSigners:
      destinationAddress && !provideTxFee
        ? [destinationAddress.paymentCreds.hash]
        : [collateral.resolved.address.paymentCreds.hash], // requiredSigners field is not present in the provided off-chain code but is found necessary through tracing the contract and locating failures
    outputs,
    changeAddress: collateral.resolved.address,
  });
}

export async function initiateMarketplace(
  emulator: Emulator,
  lucid: Lucid,
  ownerSeedPhrase: string, // users.owner
  currencyPolicyId: Hash28 | "", // "" for ADA
  currencyTokenName: Uint8Array, // "" for ADA
  feeOracleInitiationOutcome: FeeOracleInitiationOutcome
): Promise<MarketplaceInitiationOutcome> {
  const feeOracleNftPolicyHash =
    feeOracleInitiationOutcome.feeOracleNftPolicyHash;

  // Select the owner's wallet who will be deploying the marketplace contract after initiating fee oracle
  lucid.selectWalletFromSeed(ownerSeedPhrase);
  const ownerAddr = await lucid.wallet.address();

  // Retrieve the owners's UTxOs and convert a LUTxO ,suitable for deploying the marketplace, to a plu-ts UTxO format to be used for marketplace deployment
  const initialUTxOs = await lucid.wallet.getUtxos();
  const [marketplaceRefLUTxO] = initialUTxOs;
  const marketplaceRefUTxO = lutxoToUTxO(marketplaceRefLUTxO);

  const isAda = currencyPolicyId === "";

  // Create the marketplace contract
  // If we're using ADA, use an empty string for the currency symbol. Otherwise, use the buffer representation of the provided policy ID.
  // If we're using ADA, use an empty string for the token name. Otherwise, use the provided token name
  const marketplaceScript = makeMarketplace(
    PCurrencySymbol.from(isAda ? "" : currencyPolicyId.toBuffer()),
    PTokenName.from(isAda ? new Uint8Array([]) : currencyTokenName),
    PAddress.fromData(pData(Address.fromString(ownerAddr).toData())), // owner of the marketplace
    PCurrencySymbol.from(feeOracleNftPolicyHash.toBuffer()), // oracleNFTSymbol
    PTokenName.from(tokenName) // oracleNFTname
  );

  // Generate the marketplace address
  const marketplaceAddr = new Address(
    "testnet",
    PaymentCredentials.script(marketplaceScript.hash)
  );

  // Build the Marketplace deployment transaction
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
    changeAddress: Address.fromString(ownerAddr),
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
  const [marketplaceRefScriptUTxO] = marketplaceLUTxOs.map(lutxoToUTxO);
  const marketplaceOwnerAddress = Address.fromString(ownerAddr);

  return {
    marketplaceOwnerAddress,
    marketplaceAddr,
    marketplaceRefScriptUTxO,
    marketplaceScript,
    currencyPolicyId,
    currencyTokenName,
  };
}

export async function getListNFTTx(
  changeAddress: Address,
  nftUTxO: UTxO,
  marketplaceAddress: Address,
  listNftPolicy: Uint8Array,
  listNftTokenName: Uint8Array,
  initialListingPrice: number | bigint,
  sellerAddress: Address
): Promise<Tx> {
  const listingTxBuilder = new TxBuilder(await getProtocolParams());
  const nftSaleDatum = NFTSale.NFTSale({
    policy: pDataB(listNftPolicy),
    price: pDataI(initialListingPrice),
    seller: punsafeConvertType(
      pData(sellerAddress.toData()),
      PAddress.type
    ) as any,
    tokenName: pDataB(listNftTokenName),
  });
  return listingTxBuilder.buildSync({
    inputs: [{ utxo: nftUTxO }],
    collaterals: [nftUTxO],
    collateralReturn: {
      address: changeAddress,
      value: Value.sub(nftUTxO.resolved.value, Value.lovelaces(5_000_000)),
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
        datum: nftSaleDatum,
      },
    ],
    changeAddress: changeAddress,
  });
}

export async function listNft(
  emulator: Emulator,
  lucid: Lucid,
  marketplaceInitiationOutcome: MarketplaceInitiationOutcome,
  sellerSeedPhrase: string, // users.seller, who lists the NFT on the marketplace
  listNftPolicyHash: Hash28,
  listNftTokenName: Uint8Array,
  initialListingPrice: number | bigint
): Promise<NftListingOutcome> {
  const marketplaceAddress = marketplaceInitiationOutcome.marketplaceAddr;

  lucid.selectWalletFromSeed(sellerSeedPhrase);

  // Find the UTxO containing the minted NFT to be listed, and convert it into plu-ts format
  const sellerLUTxOs = await lucid.wallet.getUtxos();
  const sellerUTxOs = sellerLUTxOs.map(lutxoToUTxO);
  const listingUTxO = sellerUTxOs.find(
    // Assuming multiple UTxOs could be present, we find the one with the NFT
    (u) =>
      u.resolved.value.get(listNftPolicyHash, listNftTokenName) === BigInt(1)
  )!;

  // Constants for listing transaction
  const sellerAddress = listingUTxO.resolved.address;
  const changeAddress = listingUTxO.resolved.address;
  const listNftPolicy = listNftPolicyHash.toBuffer();

  // Build the listing transaction
  const nftListingTx = await getListNFTTx(
    changeAddress,
    listingUTxO, // UTxO containing the NFT to be listed
    marketplaceAddress,
    listNftPolicy,
    listNftTokenName,
    initialListingPrice,
    sellerAddress
  );

  // Sign and submit the listing NFT onto the marketplace transaction
  const nftListingLTx = lucid.fromTx(nftListingTx.toCbor().toString());
  const signedNftListingLTx = await nftListingLTx.sign().complete();
  const nftListingTxHash = await signedNftListingLTx.submit();

  // Wait for transaction confirmation
  emulator.awaitBlock(50);

  // Find the UTxO of the listed NFT on the marketplace
  const marketplaceLUTxOs = await lucid.utxosAt(marketplaceAddress.toString());
  const marketplaceUTxO = marketplaceLUTxOs.map(lutxoToUTxO);
  const listedNftUTxO = marketplaceUTxO.find(
    (u) => u.resolved.value.get(listNftPolicy, listNftTokenName) === BigInt(1)
  )!;

  return {
    listedNftUTxO, // For update test
    sellerAddress, // For update test, cancel test
    listNftPolicy, // For buy test
    listNftTokenName, // For buy test
  };
}

export async function getUpdateListingTx(
  marketplace: MarketplaceInitiationOutcome,
  listing: NftListingOutcome,
  newPrice: number | bigint,
  collateral: UTxO,
  badPrice?: number | bigint, // Can be set to 0 for a malicious attempt
  adversaryAddress?: Address, // users.adversary can be used to create a failed update of the listing
  badPolicy?: Uint8Array, // A random NFT policy can be provided to create a failed update of the listing
  badTokenName?: Uint8Array
): Promise<Tx> {
  const initialDatum = listing.listedNftUTxO.resolved.datum;
  if (!(initialDatum instanceof DataConstr))
    throw new Error("listing utxo datum is not inline");
  const initialDatumFields = initialDatum.fields;

  // For testing purposes we can create a Datum with a bad price, policy, or token name when the optional arguments badPrice, adversaryAddress, badPolicy, or badTokenName are provided
  const updatedDatumPrice = new DataI(badPrice ?? newPrice);
  const updatedDatumSeller = adversaryAddress
    ? adversaryAddress.toData()
    : initialDatumFields[1];
  const updatedDatumPolicy = badPolicy
    ? new DataB(badPolicy)
    : initialDatumFields[2];
  const updatedDatumTokenName = badTokenName
    ? new DataB(badTokenName)
    : initialDatumFields[3];

  const updatedDatum = new DataConstr(0, [
    // in src/contracts/marketplace.ts it can be observed under the NFTSale data type, that index 0 refers to the NFTSale constructor and its individual fields
    updatedDatumPrice,
    updatedDatumSeller,
    updatedDatumPolicy,
    updatedDatumTokenName,
  ]);

  const updateListingTxBuilder = new TxBuilder(await getProtocolParams());
  return await updateListingTxBuilder.build({
    inputs: [
      {
        utxo: listing.listedNftUTxO,
        referenceScriptV2: {
          refUtxo: marketplace.marketplaceRefScriptUTxO,
          datum: "inline",
          redeemer: new DataConstr(2, [new DataI(newPrice)]), // in src/contracts/marketplace.ts it can be observed under the SaleAction redeemer, that index 2 is the Update action ( index 0 -> Buy, index 1 -> Close, index 2 -> Update)
        },
      },
      { utxo: collateral },
    ],
    outputs: [
      {
        address: marketplace.marketplaceAddr,
        value: listing.listedNftUTxO.resolved.value,
        datum: updatedDatum,
      },
    ],
    collaterals: [collateral],
    collateralReturn: {
      address: listing.sellerAddress,
      value: Value.sub(collateral.resolved.value, Value.lovelaces(15_000_000)),
    },
    requiredSigners: [listing.sellerAddress.paymentCreds.hash],
    changeAddress: listing.sellerAddress,
  });
}

export async function getCancelListingTx(
  marketplace: MarketplaceInitiationOutcome,
  listing: NftListingOutcome,
  collateral: UTxO,
  targetListingUTxO?: UTxO
): Promise<Tx> {
  const initialInputs = [
    {
      utxo: listing.listedNftUTxO,
      referenceScriptV2: {
        refUtxo: marketplace.marketplaceRefScriptUTxO,
        datum: "inline",
        redeemer: new DataConstr(1, []),
      },
    },
    { utxo: collateral },
  ];

  const finalInputs = targetListingUTxO
    ? [
        ...initialInputs,
        {
          utxo: targetListingUTxO,
          referenceScriptV2: {
            refUtxo: marketplace.marketplaceRefScriptUTxO,
            datum: "inline",
            redeemer: new DataConstr(1, []),
          },
        },
      ]
    : initialInputs;

  const cancelListingTxBuilder = new TxBuilder(await getProtocolParams());
  return await cancelListingTxBuilder.build({
    inputs: finalInputs,
    collaterals: [collateral],
    collateralReturn: {
      address: listing.sellerAddress,
      value: Value.sub(collateral.resolved.value, Value.lovelaces(15_000_000)),
    },
    requiredSigners: [listing.sellerAddress.paymentCreds.hash],
    changeAddress: listing.sellerAddress,
  });
}

export async function getBuyListingTx(
  feeOracle: FeeOracleInitiationOutcome,
  marketplace: MarketplaceInitiationOutcome,
  listing: NftListingOutcome,
  buyerUTxOs: UTxO[],
  buyerAddress: Address,
  additionalListedNftUTxO?: UTxO
): Promise<Tx> {
  const buyerPkh = buyerAddress.paymentCreds.hash;

  // Price / Fee Operations
  const nftSaleDatum = listing.listedNftUTxO.resolved.datum;
  const feeNumeratorDatum = feeOracle.feeOracleUTxOs[1].resolved.datum;

  if (
    !(nftSaleDatum instanceof DataConstr && feeNumeratorDatum instanceof DataI)
  )
    throw "watermelons";

  const feeNumerator = feeNumeratorDatum.int;

  const saleFields = nftSaleDatum.fields;
  if (!(saleFields[0] instanceof DataI)) throw "cherrys";

  const fullPrice = saleFields[0].int;
  const protocolFeeAmt = (fullPrice * feeNumerator) / 1_000_000n;

  const finalPrice = fullPrice - protocolFeeAmt;

  const createPaymentAssetEntry = (amount: number | bigint) =>
    marketplace.currencyPolicyId === ""
      ? Value.lovelaceEntry(amount)
      : Value.singleAssetEntry(
          marketplace.currencyPolicyId, // Hash28 for CNTs
          marketplace.currencyTokenName, // Uint8Array for CNTs
          amount // field for protocolFeeAmt and finalPrice
        );

  const buyersInitialInputs = buyerUTxOs.map((utxo) => ({ utxo }));

  const initialInputs = [
    ...buyersInitialInputs,
    {
      utxo: listing.listedNftUTxO,
      referenceScriptV2: {
        refUtxo: marketplace.marketplaceRefScriptUTxO,
        redeemer: SaleAction.Buy({}),
        datum: "inline",
      },
    },
  ];

  const finalInputs = additionalListedNftUTxO
    ? [...initialInputs, { utxo: additionalListedNftUTxO }]
    : initialInputs;

  const initialOutputs = [
    // Buyer receives the NFT
    {
      address: buyerAddress,
      value: new Value([
        Value.lovelaceEntry(2_000_000),
        Value.singleAssetEntry(
          new Hash28(listing.listNftPolicy),
          listing.listNftTokenName,
          1
        ),
      ]),
    },
    // Marketplace Owner receives the protocol fee
    {
      address: marketplace.marketplaceOwnerAddress,
      value: new Value([
        Value.lovelaceEntry(2_000_000),
        createPaymentAssetEntry(protocolFeeAmt),
      ]),
    },
    // Seller gets paid the final price (owner of the listing)
    {
      address: listing.sellerAddress,
      value: new Value([
        Value.lovelaceEntry(2_000_000),
        createPaymentAssetEntry(finalPrice),
      ]),
    },
  ];

  const buyListingTxBuilder = new TxBuilder(await getProtocolParams());
  return buyListingTxBuilder.buildSync({
    inputs: finalInputs,
    collaterals: [buyerUTxOs[0]],
    collateralReturn: {
      address: buyerAddress,
      value: Value.sub(
        buyerUTxOs[0].resolved.value,
        Value.lovelaces(15_000_000)
      ),
    },
    readonlyRefInputs: [feeOracle.feeOracleUTxOs[1]],
    requiredSigners: [new PubKeyHash(buyerPkh)],
    outputs: initialOutputs,
    changeAddress: buyerAddress,
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

export function generate56CharHex(): string {
  const bytes: number = 28; // 28 bytes * 2 hex chars per byte = 56 characters
  const result: string[] = [];

  for (let i = 0; i < bytes; i++) {
    // Generate a random number between 0 and 255 (1 byte)
    const randomByte: number = Math.floor(Math.random() * 256);
    // Convert to hexadecimal and pad with zero if necessary
    result.push(randomByte.toString(16).padStart(2, "0"));
  }

  return result.join("");
}

export function generateRandomTokenName(): Uint8Array {
  const bytes: number = Math.floor(Math.random() * 32);
  const result = new Uint8Array(bytes);

  for (let i = 0; i < bytes; i++) {
    result[i] = Math.floor(Math.random() * 256);
  }

  return result;
}

let _pps: ProtocolParamters | undefined = undefined;
const ppPath = `./test/protocol_params.json`;

async function getProtocolParams(): Promise<ProtocolParamters> {
  const ppsFromJsonString = (jsonStr: string): ProtocolParamters => {
    // {{{
    const json = JSON.parse(jsonStr, (k, v) => {
      if (typeof v === "string") {
        try {
          return BigInt(v);
        } finally {
          return v;
        }
      }
      return v;
    });
    const pps = {} as ProtocolParamters;
    pps.txFeePerByte = BigInt(json.txFeePerByte);
    pps.txFeeFixed = BigInt(json.txFeeFixed);
    pps.maxBlockBodySize = BigInt(json.maxBlockBodySize);
    pps.maxTxSize = BigInt(json.maxTxSize);
    pps.maxBlockHeaderSize = BigInt(json.maxBlockHeaderSize);
    pps.stakeAddressDeposit = BigInt(json.stakeAddressDeposit);
    pps.stakePoolDeposit = BigInt(json.stakePoolDeposit);
    pps.poolRetireMaxEpoch = BigInt(json.poolRetireMaxEpoch);
    pps.stakePoolTargetNum = BigInt(json.stakePoolTargetNum);
    pps.poolPledgeInfluence = CborPositiveRational.fromNumber(
      json.poolPledgeInfluence
    );
    pps.monetaryExpansion = CborPositiveRational.fromNumber(
      json.monetaryExpansion
    );
    pps.treasuryCut = CborPositiveRational.fromNumber(json.treasuryCut);
    pps.protocolVersion = json.protocolVerision;
    pps.minPoolCost = BigInt(json.minPoolCost);
    pps.utxoCostPerByte = BigInt(json.utxoCostPerByte);
    pps.costModels = {};
    if (typeof json.costModels.PlutusScriptV1 === "object") {
      pps.costModels.PlutusScriptV1 = {} as any;
      for (const k in json.costModels.PlutusScriptV1) {
        (pps.costModels.PlutusScriptV1 as any)[k] = BigInt(
          json.costModels.PlutusScriptV1[k]
        );
      }
    }
    if (typeof json.costModels.PlutusScriptV2 === "object") {
      pps.costModels.PlutusScriptV2 = {} as any;
      for (const k in json.costModels.PlutusScriptV2) {
        (pps.costModels.PlutusScriptV2 as any)[k] = BigInt(
          json.costModels.PlutusScriptV2[k]
        );
      }
    }
    pps.executionUnitPrices = json.executionUnitPrices;
    pps.maxTxExecutionUnits = new ExBudget({
      mem: BigInt(json.maxTxExecutionUnits.memory),
      cpu: BigInt(json.maxTxExecutionUnits.steps),
    });
    pps.maxBlockExecutionUnits = new ExBudget({
      mem: BigInt(json.maxBlockExecutionUnits.memory),
      cpu: BigInt(json.maxBlockExecutionUnits.steps),
    });
    pps.maxValueSize = BigInt(json.maxValueSize);
    pps.collateralPercentage = BigInt(json.collateralPercentage);
    pps.maxCollateralInputs = BigInt(json.maxCollateralInputs);
    return pps;
    // }}}
  };
  if (_pps) return _pps;
  if (existsSync(ppPath)) {
    try {
      return ppsFromJsonString(await readFile(ppPath, { encoding: "utf-8" }));
    } catch(e) {
      throw e;
    }
  } else {
    throw new Error("Protocol parameters file missing.");
  }
}
