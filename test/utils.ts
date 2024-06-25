import {
    assetsToValue,
    Script as LScript,
    ScriptType as LScriptType,
    UTxO as LUTxO,
    Assets as LAssets,
    valueToAssets,
    generateSeedPhrase,
    Lucid
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
    IValue
  } from "@harmoniclabs/plu-ts";


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
    const datum =
      u.datum
      ? dataFromCbor(u.datum)
      : u.datumHash
      ? (new Hash32(u.datumHash!))
      : undefined;
    const iutxo: IUTxO = {
      resolved: {
        address: Address.fromString(u.address),
        datum,
        refScript: u.scriptRef ? lscriptToScript(u.scriptRef) : undefined,
        value: Value.fromCbor((assetsToValue(u.assets)).to_bytes()) // TODO
      },
      utxoRef: {
        id: u.txHash,
        index: u.outputIndex,
      },
    };
   
    return new UTxO(iutxo);
  };

  export const lutxoToUTxOArray = (u: LUTxO[]): UTxO[] => {
    const mappedUTxos = u.map(lutxoToUTxO)
    return mappedUTxos
  }

  const assertNever = (value: never): never => {
    throw new Error(`Unexpected value: ${value}`);
  };

  const uint8ArrayToHex = (uint8Array: Uint8Array): string => {
    return Array.from(uint8Array)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  };

  const scriptToLScript = (s: Script): LScript => {
    const st :LScriptType =
        s.type == ScriptType.PlutusV1
        ? "PlutusV1"
        : s.type == ScriptType.PlutusV2
        ? "PlutusV2"
        : s.type == ScriptType.NativeScript
        ? "Native"
        : assertNever(s.type);
    return {
        type : st , 
        script : uint8ArrayToHex (s.bytes)
    }};
   
   export const valueToLAssets = (v: Value): LAssets => {
        const units = v.toUnits();
        return units.reduce((acc, u) => {
          acc[u.unit] = u.quantity;
          return acc;
        }, {});
      };

export const UTxOTolUtxo = (u: UTxO): LUTxO => {
    const utxo: LUTxO = {

        txHash: u.utxoRef.id.toString(),
        outputIndex: u.utxoRef.index,
        assets: valueToLAssets(u.resolved.value), //Assets 
        address: u.resolved.address.toString() ,
        datumHash: u.resolved.datum?.toString(),
        datum : u.resolved.datum?.toString(),
        scriptRef: u.resolved.refScript? (scriptToLScript(u.resolved.refScript)) : undefined

    };
   
    return utxo;
  };


  export function getUtxoWithAssets(utxos: LUTxO[], minAssets: LAssets): LUTxO[] {
    const utxo = utxos.find((utxo) => {
      for (const [unit, value] of Object.entries(minAssets)) {
        if (
          !Object.hasOwn(utxo.assets, unit) || utxo.assets[unit] < value
        ) {
          return false;
        }
      }
      return true;
    });
  
    if (!utxo) {
      throw new Error(
        "No UTxO found containing assets: " +
          JSON.stringify(minAssets, bigIntReplacer),
      );
    }
    return [utxo];
  };

  export function bigIntReplacer(_k: any, v: any) {
    return typeof v === "bigint" ? v.toString() : v;
  }

  export const generateAccountSeedPhrase = async (assets: LAssets) => {
    const seedPhrase = generateSeedPhrase();
    return {
      seedPhrase,
      address: await ( await Lucid.new(undefined, "Custom"))
        .selectWalletFromSeed(seedPhrase)
        .wallet.address(),
      assets,
    };
  };