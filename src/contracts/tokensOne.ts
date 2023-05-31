import { PScriptContext, Script, compile, data, int, pInt, pfn } from "@harmoniclabs/plu-ts";

export const tokensOne = new Script(
    "PlutusScriptV2",
    compile(
        pfn([
            data,
            PScriptContext.type
        ],  int)
        ( ( a, b ) => pInt( 1 ) )
    )
);