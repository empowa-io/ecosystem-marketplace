import { Data, Emulator, Lucid, OutputData, Tx } from "@anastasia-labs/lucid-cardano-fork";
import { UTxOTolUtxo, generateAccountSeedPhrase, lutxoToUTxO, lutxoToUTxOArray } from "../test/utils";
import { Address, DataI, Hash28, PCurrencySymbol, PPubKeyHash, PTokenName, PTxOutRef, PaymentCredentials, PubKeyHash, Script, TxBuilder, UTxO, defaultProtocolParameters, pData } from "@harmoniclabs/plu-ts";
import { makeFeeOracleNftPolicy } from "../src/contracts/feeOracleNftIdPolicy";
import { getMintOneShotTx } from "../app/txns/getMintOneShotTx";
import { tokenName } from "../app/constants";
import { feeOracle, makeFeeOracle } from "../src/contracts/feeOracle";
import { tryGetMarketplaceConfig } from "../app/utils/tryGetMarketplaceConfig";
import { getProtocolParams } from "../app/utils/getProtocolParams.ts";
import {test, describe} from 'vitest';
import { getDeployFeeOracleTx } from "../app/txns/feeOracle/getDeployFeeOracleTx.ts";
import { getFeeUpdateTxTest } from "./updateFeeOracleTest.ts"
import { getFeeUpdateTx } from "../app/updateFeeOracle.ts"
import { getMintOneShotTestTx } from "../test/getMintOneShotTest.ts" ;
import { makeFeeOracleAndGetDeployTestTx} from "../test/makeFeeOracleAndGetDeployTest.ts"
import { readFile, writeFile } from "fs/promises";
import { getMintManyTestTx } from "../test/getMintManyTx.ts"



const signerAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
  // const ownerAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
 //  const adversaryAddr = await generateAccountSeedPhrase({lovelace: 100_000_000n});
   const emulator = new Emulator([signerAddr]);

   const lucid = await Lucid.new(emulator);
lucid.selectWalletFromSeed(signerAddr.seedPhrase);
const utxos = await lucid.utxosAt(signerAddr.address);
const utxoToSpend1 = lutxoToUTxO(utxos[0]);
const returnAddress = signerAddr.address;

const mintTx = await getMintOneShotTestTx((new TxBuilder(await getProtocolParams())),utxoToSpend1,utxoToSpend1.resolved.address);
//const nftpolicysource1 = mintTx.nftPolicySource;
//console.log("policy source", nftpolicysource1.toCbor());
const nftPolicy = mintTx.nftPolicySource.hash;
console.log("correct NFT Policy",nftPolicy.toString());
const mintTxSigned = lucid.fromTx(mintTx.tx.toCbor().toString());
const txsig = await mintTxSigned.sign().complete();
const txsub = await txsig.submit();   

emulator.awaitBlock(20);
const env = tryGetMarketplaceConfig().envFolderPath;
const utxosAfterOneShotMint = lutxoToUTxOArray(await lucid.utxosAt(signerAddr.address));
const utxoToSpend2 = utxosAfterOneShotMint.find(u => u.resolved.value.get(nftPolicy,tokenName) === 1n)!;

const nftPolicy1 = "43ad42be37b3bee088ab7179d8c7d8bf7ae53e3c175499c6e555ec9e"
const ownerPkh1 = new Hash28(lucid.utils.paymentCredentialOf(signerAddr.address).hash)
const feeOraclTx= await makeFeeOracleAndGetDeployTestTx((new TxBuilder(await getProtocolParams())),
                  utxoToSpend2,utxoToSpend2.resolved.address,nftPolicy,ownerPkh1);

 await writeFile( `${env}/feeOracle.utxoRef`,`${feeOraclTx.hash}#0`, { encoding: "utf-8" }
                );

const cborTx = feeOraclTx.toCbor();
const feeOracleTxSigned =  lucid.fromTx(cborTx.toString());
const feeOracletxsig = await feeOracleTxSigned.sign().complete();
const feeOracletxsub = await feeOracletxsig.submit(); 
   
emulator.awaitBlock(20);

const feeOracleAddr = Address.fromString(
    await readFile(`${env}/feeOracle.addr`, { encoding: "utf-8" })
);
console.log("feeoracle utxos", await lucid.utxosAt(feeOracleAddr.toString()));


/*

console.log("Signer Addre utxos", await lucid.utxosAt(signerAddr.address));
const feeOracleAddr = Address.fromString(
    await readFile(`${env}/feeOracle.addr`, { encoding: "utf-8" })
);
console.log("feeoracle utxos", await lucid.utxosAt(feeOracleAddr.toString()));
const feeoraclelucidutxos = await lucid.utxosAt(feeOracleAddr.toString());
const feeoracleplutsutxos = lutxoToUTxOArray(feeoraclelucidutxos);
const utxoWithNft = feeoracleplutsutxos.find(u => u.resolved.value.get(nftPolicy,tokenName)===1n)!;
const feeOracleSource = feeoracleplutsutxos.find( u => u.resolved.refScript !== undefined)!;

const newFee = 30_000;
lucid.selectWalletFromSeed(signerAddr.seedPhrase);
const collateralUtxos = await lucid.utxosAt(signerAddr.address);
const collateral = lutxoToUTxO(collateralUtxos[0]);
console.log("collateral", collateralUtxos);
const ownerPkh = new Hash28(lucid.utils.paymentCredentialOf(signerAddr.address).hash)
const updateTx =await getFeeUpdateTxTest(lucid,new TxBuilder(await getProtocolParams()),newFee,ownerPkh,
   collateral,utxoWithNft,feeOracleSource);

const updateTxToBesigned = lucid.fromTx(updateTx.toCbor().toString());
const updateTxsigned = await updateTxToBesigned.sign().complete();

const txhash = await updateTxsigned.submit(); */
//const updateTx =await getFeeUpdateTx(new TxBuilder(await getProtocolParams()),newFee,ownerPkh,
                             //    collateral);

