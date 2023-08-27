import { int, lam, pByteString, pInt, pStr, peqInt, pfn, phoist, pif, plam, plet, precursive, pstrictIf, ptrace, punsafeConvertType, bs } from "@harmoniclabs/plu-ts";
import { fromAscii } from "@harmoniclabs/uint8array-utils";

const pifStr = pstrictIf( bs );

export const pdigitToString = phoist(
    pfn([
        int
    ],  bs)
    (  n => pByteString("").prepend( n.add(48) ) )
);

export const ppositiveIntToString = phoist(
    precursive(
        pfn([
            lam( int, bs ),
            int
        ],  bs)
        (( _self, n ) => {

            const self = punsafeConvertType( _self, lam( int, bs ) );

            return pif( bs ).$( n.gtEq( 10 ) )
            .then( self.$( n.div(10) ).concat( pdigitToString.$( n.mod(10) ) ) )
            .else( pdigitToString.$( n ) );
        })
    )
);

export const pintToString = phoist(
    plam( int, bs )
    ( n => 
        pif( bs ).$( n.gtEq( 0 ) )
        .then( ppositiveIntToString.$( n ) )
        .else( 
            pByteString(fromAscii("-")).concat( 
                ppositiveIntToString.$( 
                    pInt( 0 ).sub( n ) 
                ) 
            ) 
        ) 
    )
)

export const ptraceInt = plam( int, int )
( n => ptrace( int ).$( pintToString.$( n ).utf8Decoded ).$( n ) )