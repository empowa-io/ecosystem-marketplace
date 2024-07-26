import { Data, Emulator, Lucid, OutputData, Tx } from "@anastasia-labs/lucid-cardano-fork";
import { UTxOTolUtxo, generateAccountSeedPhrase, lutxoToUTxO, lutxoToUTxOArray } from "../test/utils";
import { Address, DataI, Hash28, PAddress, PCurrencySymbol, PPubKeyHash, PTokenName, PTxOutRef, PaymentCredentials, PubKeyHash, Script, TxBuilder, UTxO, defaultProtocolParameters, pData } from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { tokenName } from "../app/constants";
import { feeOracle, makeFeeOracle } from "../src/contracts/feeOracle";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";
import { test, describe} from 'vitest';
import { getDeployFeeOracleTestTx } from "../test/getDeployFeeOracleTest.ts";
import { getFeeUpdateTxTest } from "./updateFeeOracleTest.ts"
import { getFeeUpdateTx } from "../app/updateFeeOracle.ts"
import { getMintOneShotTestTx } from "../test/getMintOneShotTest.ts" ;
import { makeFeeOracleAndGetDeployTestTx} from "../test/makeFeeOracleAndGetDeployTest.ts"
import { makeMarketplaceAndGetDeployTestTx } from "./makeMarketplaceAndGetDeployTest.ts";
import { makeMarketplace } from "../src/contracts/marketplace.ts";
import { getDeployMarketplaceTestTx } from "./getDeployMarketplaceTest.ts";

  const signerAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
  const ownerAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
  const adversaryAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
  const emulator = new Emulator([signerAddr,ownerAddr,adversaryAddr]);

  const lucid = await Lucid.new(emulator);

    // abstractTx is an abstract function to resuse for later
  export async function abstractTx(nonbeaconUtxo : boolean) : 
  Promise<{policyhash : Hash28 , utxo : UTxO[], script : Script<"PlutusScriptV2">,ownpkh :PubKeyHash;feeOracleAddr : Address }> 
  { 
     lucid.selectWalletFromSeed (signerAddr.seedPhrase);
     const initialUtxos = await lucid.wallet.getUtxos();
     const refl = initialUtxos[0];
     const ref = lutxoToUTxO(refl);
     const oneShotMintTx = await getMintOneShotTx(new TxBuilder(await getProtocolParams()),ref,ref.resolved.address);

     const policy = oneShotMintTx.nftPolicySource.hash;

     const tobeSignedTx = lucid.fromTx(oneShotMintTx.tx.toCbor().toString());

     const signedLucidTx = await tobeSignedTx.sign().complete();
     const nfttxHash = await signedLucidTx.submit();
     
     emulator.awaitBlock(50);
     
     console.log("Utxos after minting", await lucid.utxosAt(signerAddr.address));

     const lucidUtxosAfterMint = await lucid.utxosAt(signerAddr.address);

     const plutsUtxo = lutxoToUTxOArray(lucidUtxosAfterMint); 
     const utxoWithNft = plutsUtxo.find(u => u.resolved.value.get(policy,tokenName) === 1n)!;
     //const cfg = tryGetMarketplaceConfig();
     const paymentCred = lucid.utils.paymentCredentialOf(signerAddr.address); //owner address
     const publicKeyHash = new PubKeyHash (paymentCred.hash);

     const feeOracle = makeFeeOracle(
        PCurrencySymbol.from( policy.toBuffer() ),
        PTokenName.from( tokenName ),
        PPubKeyHash.from( publicKeyHash.toBuffer() )
     );

     const feeOracleAddr = new Address(
        "testnet",
        //cfg.network === "mainnet" ? "mainnet" : "testnet",
        PaymentCredentials.script( feeOracle.hash )
     );

     const offChainTxFeeOracle = await getDeployFeeOracleTestTx(new TxBuilder(await getProtocolParams()),
                                       utxoWithNft,utxoWithNft.resolved.address,feeOracleAddr,feeOracle,policy);

     const tobeSignedFeeOracleTx = offChainTxFeeOracle.toCbor();
     const lucidFeeOracleTx = lucid.fromTx(tobeSignedFeeOracleTx.toString());
     const signedLucidFeeOracleTx = await lucidFeeOracleTx.sign().complete();
     const txHashFeeOracle = await signedLucidFeeOracleTx.submit();

     emulator.awaitBlock(50);

     console.log("utxos at sgner addr", await lucid.utxosAt(signerAddr.address));
     console.log("utxos at feeOracle addr", await lucid.utxosAt(feeOracleAddr.toString()));

     // construct a datum in lucid -> for new DataI( 25_000 )
     if (nonbeaconUtxo) {

        const feeOracleDatumSchema = Data.Integer();
        type feeOracleDatum = Data.Static<typeof feeOracleDatumSchema>;
        const feeOracleDatum = feeOracleDatumSchema as unknown as feeOracleDatum;
        const datum: feeOracleDatum = 0n// 40_000n; //0
        //const newDatum = Data.to(datum, feeOracleDatum);

        const newDatum: OutputData = {inline: Data.to(datum, feeOracleDatum)};

        const tx = await lucid.newTx().payToContract(feeOracleAddr.toString(),newDatum,{lovelace : 2_000_000n}).complete();
        const txsigned = await tx.sign().complete();
        const txsubmit = await txsigned.submit();

        emulator.awaitBlock(50);
        
     };

     const feeOracleUtxos = await lucid.utxosAt(feeOracleAddr.toString());
     const feeOraclePlutsUtxos =lutxoToUTxOArray(feeOracleUtxos);
     console.log("Fee oracle addr with one more tx", await lucid.utxosAt(feeOracleAddr.toString()));
     return {
           policyhash : policy,
           utxo : feeOraclePlutsUtxos,
           script : feeOracle,
           feeOracleAddr : feeOracleAddr,
           ownpkh : publicKeyHash
         }
    emulator.awaitBlock(30);
   
  }
 
  const utxo = (await lucid.utxosAt(signerAddr.address))[0];
  const inputUtxo = lutxoToUTxO(utxo)
  console.log("Input utxo",inputUtxo);
  const refUtxo = await abstractTx(true);
  //console.log("Output of abstract tx",UTxOTolUtxo(refUtxo.utxo[1]));
  //const marketplaceTx = makeMarketplaceAndGetDeployTestTx
  //                      (new TxBuilder (await getProtocolParams()), inputUtxo, inputUtxo.resolved.address,inputUtxo.utxoRef);


  const addr = Address.fromString(ownerAddr.address);

  const marketplace = makeMarketplace(
   PCurrencySymbol.from( "" ),
   PTokenName.from( "" ),
   PAddress.fromData( pData( addr.toData() )) ,
   PCurrencySymbol.from( refUtxo.policyhash.toBuffer() ),
   PTokenName.from( tokenName )
);

const marketplaceAddr = new Address(
   "testnet",
   PaymentCredentials.script( marketplace.hash )
);

console.log("MArketpalce Addr",marketplaceAddr.toString());
lucid.selectWalletFromSeed (ownerAddr.seedPhrase);
const ownerUtxos = await lucid.wallet.getUtxos();
const ownerUtxo = ownerUtxos[0];
const some = await getDeployMarketplaceTestTx(new TxBuilder(await getProtocolParams()),lutxoToUTxO(ownerUtxo),addr,marketplaceAddr,marketplace)

const tobeSignedMarketplaceTx = some.toCbor();
const marketplaceTx = lucid.fromTx(tobeSignedMarketplaceTx.toString());
const signedmarketplaceTx = await marketplaceTx.sign().complete();
const txHashMarketplace = await signedmarketplaceTx.submit();

emulator.awaitBlock(20);

console.log("Utxos at Marketplace Address", await lucid.utxosAt(marketplaceAddr.toString()));