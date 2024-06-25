import { Data, Emulator, Lucid, OutputData, Tx } from "@anastasia-labs/lucid-cardano-fork";
import { UTxOTolUtxo, generateAccountSeedPhrase, lutxoToUTxO, lutxoToUTxOArray } from "../test/utils";
import { Address, DataI, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PTxOutRef, PaymentCredentials, PubKeyHash, Script, TxBuilder, UTxO, defaultProtocolParameters, pData } from "@harmoniclabs/plu-ts";
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
   
  }
//1.another addr not allowed to spend the utxo
//2. none of the utxo should be spendable
describe('The contract intentionally fails as the datum is invalid in the contract', () => {
test("Fee Oracle Contract", async() =>{
   try {
      // to find a UTXo with NFt
      const utxo = await abstractTx(true);
      //const policy = utxo.policyhash;
      const utxoWithNft = utxo.utxo.find(u => u.resolved.value.get(utxo.policyhash,tokenName) === 1n)!;
      const lucidUtxo = UTxOTolUtxo(utxoWithNft);
      //console.log("Utxos with NFt", lucidUtxo);

      const feeOracleSource = utxo.utxo.find( u => u.resolved.refScript !== undefined)!;
      const lucidFeeOracleSrc = UTxOTolUtxo(feeOracleSource);
      //console.log("utxo with soure",lucidFeeOracleSrc);

      const newFee = 30_000;
      const collateralUtxos = await lucid.utxosAt(signerAddr.address);
      const collateral = lutxoToUTxO(collateralUtxos[0]);
      //console.log("collateral", collateralUtxos);
      const ownerPkh = new Hash28(lucid.utils.paymentCredentialOf(signerAddr.address).hash)
      const updateTx =  await getFeeUpdateTxTest(lucid,new TxBuilder(await getProtocolParams()),newFee,ownerPkh,
                        collateral,utxoWithNft,feeOracleSource);

      const tx = lucid.fromTx(updateTx.toCbor().toString());
      const txsigned = tx.sign().complete();
      const txSubmit = (await txsigned).submit();

         
      emulator.awaitBlock(20);

  }
   catch(error){
       console.log(error);
     }
   },40_000);
}) 
