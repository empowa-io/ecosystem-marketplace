import { bs, fn, int, lam, pByteString, pStr, pfn, phoist, pif, plam, precursive, punsafeConvertType } from "@harmoniclabs/plu-ts";
import { pdigitToString, ptraceInt } from "./pintToString";


export const phexDigit = phoist(
    plam( int, bs )
    ( n =>
        pif( bs ).$( n.lt( 10 ) )
        .then( pdigitToString.$( n ) )
        .else( pByteString("").prepend( n.add(87) ) )
    )
);

export const phexByte = phoist(
    plam( int, bs )
    ( byte => phexDigit.$( byte.div(16) ).concat( phexDigit.$( byte.mod( 16 ) ) ) )
);

export const pbsToHex = phoist(
    pfn([ bs ], bs)
    ( b => 
        precursive(
            pfn([
                fn([ int ], bs ),
                int
            ],  bs)
            ( (_self, i ) => {
    
                const self = punsafeConvertType( _self, fn([ int ], bs ) );
    
                return pif( bs ).$( i.gtEq( b.length ) )
                .then( pByteString("") )
                .else(
                    phexByte.$( b.at( i ) )
                    .concat(
                        self.$( i.add(1) )
                    )
                )
            })
        ).$( 0 ) 
    )
);