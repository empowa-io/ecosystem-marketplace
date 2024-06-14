import {
    Emulator,
    Lucid  } from '@anastasia-labs/lucid-cardano-fork';

import { test,describe } from "vitest";
import { makeFeeOracleNftPolicy } from '../src/contracts/feeOracleNftIdPolicy';
import { lutxoToUTxO, generateAccountSeedPhrase } from "../test/utils";
import { DataI, defaultProtocolParameters, pData, PTxOutRef, TxBuilder, Value,Tx } from '@harmoniclabs/plu-ts';
import { tokenName } from '../app/constants';

describe('The contract doesnt allow more than one NFT to be minted', () => {

test("Test - Multple NFT minted", async () => {
    try{ 
 
    const userAddress1 = await generateAccountSeedPhrase({lovelace : 20_000_000n});
  
    const emulator = new Emulator([userAddress1]); 
      
    const lucid = await Lucid.new(emulator); 

    lucid.selectWalletFromSeed (userAddress1.seedPhrase);

    const tx = await lucid.newTx().payToAddress(userAddress1.address,{lovelace:10_000_000n}).complete();

    const signedTx = await tx.sign().complete(); 
    const tx1Hash = await signedTx.submit();

   // console.log ("Tx hash",tx1Hash);

    emulator.awaitBlock(500);

    const utxos = await lucid.utxosAt(userAddress1.address);

    const plutsUtxos = lutxoToUTxO(utxos[0]);

    const utxo = plutsUtxos;
    const addr = plutsUtxos.resolved.address;
    
    const ref = plutsUtxos.utxoRef;

    const feeOracleNftPolicy = makeFeeOracleNftPolicy( PTxOutRef.fromData( pData( ref.toData() ) ) );

    
    const policy = feeOracleNftPolicy.hash;

    const mintedValue = new Value([
        Value.singleAssetEntry(
            policy,
            tokenName,
            3
        )
    ]);

    const txBuilder = new TxBuilder(defaultProtocolParameters);
    const offChainTx : Tx = txBuilder.buildSync({
        inputs: [{utxo}],
        collaterals: [ utxo ],
        collateralReturn: {
            address: addr,
            value: Value.sub(
                plutsUtxos.resolved.value,
                Value.lovelaces( 5_000_000 )
            )
        },
        mints: [
            {
                value: mintedValue,
                script: {
                    inline: feeOracleNftPolicy,
                    policyId: policy,
                    redeemer: new DataI( 0 )
                }
            }
        ],
        changeAddress: plutsUtxos.resolved.address
    })
}
    catch(error){
        console.error(error);
}
},40_000
)
});