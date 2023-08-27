import { Machine, bs, int, pByteString, pdigitToBS, pfn, pmakeUnit, ptrace, showUPLC, unit } from "@harmoniclabs/plu-ts"
import { pdigitToString, pintToString, ppositiveIntToString } from "../pintToString"
import { pbsToHex, phexByte, phexDigit } from "../pbsToHex"
import { fromHex } from "@harmoniclabs/uint8array-utils";


test("pintToString", () => {

    const doStuff = pfn([
        bs,
    ],  unit)
    ( n => ptrace( unit ).$( pbsToHex.$( n ).utf8Decoded ).$( pmakeUnit() ) );

    console.log(
        Machine.eval(
            doStuff.$( pByteString( fromHex( "deadbeef" ) ) )
        ).logs
    );

})