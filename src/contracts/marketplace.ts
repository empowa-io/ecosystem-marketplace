import { PAddress, PCurrencySymbol, POutputDatum, PPubKeyHash, PScriptContext, PTokenName, PTxInInfo, PTxOutRef, Script, Term, bool, bs, compile, int, makeValidator, pBool, pInt, pIntToData, pdelay, perror, pfn, pforce, phoist, pisEmpty, plet, pmatch, pstruct, punBData, punIData, punsafeConvertType } from "@harmoniclabs/plu-ts";
import { pvalueOf } from "../utils/pvalueOf";
import { isInputFromScript } from "../utils/isInputFromScript";

export const NFTSale = pstruct({
    NFTSale: {
        price: int,
        // audit 06
        seller: PAddress.type,
        policy: PCurrencySymbol.type,
        tokenName: PTokenName.type
    }
});

export const SaleAction = pstruct({
    Buy: {},
    Close: {},
    Update: {
        newPrice: int
    }
});

const feeDenominator = phoist(pInt(1_000_000));

export const contract = pfn([
    PCurrencySymbol.type, // paymentAssetSym
    PTokenName.type, // paymentAssetName
    PAddress.type, // owner
    PCurrencySymbol.type, // oracle nft
    PTokenName.type, // oracle nft
    NFTSale.type,
    SaleAction.type,
    PScriptContext.type
  ], bool)
((
    paymentAssetSym,
    paymentAssetName,
    owner,
    oracleNftSym,
    oracleNftName,
    sale, action, ctx
) => {

    const { tx, purpose } = ctx;

    const pvalueOfToken = plet( pvalueOf.$( paymentAssetSym ).$( paymentAssetName ) );

    const delSingedBySeller = plet(
        // not always needed
        pdelay(
            tx.signatories.some( punBData.$( sale.seller.credential.raw.fields.head ).peq )
        )
    );

    const paidAmtToAddr = plet(
        pfn([ int, PAddress.type ], bool )
        (( amt, addr ) => tx.outputs.some( out => {

            const outToAddr = out.address.eq( addr )

            const outValueGtEqAmt = pvalueOfToken.$( out.value ).gtEq( amt )
            
            return outValueGtEqAmt
            .and(  outToAddr );
        }))
    );

    return pmatch( action )
    .onClose( _ => pforce( delSingedBySeller ))
    .onUpdate( ({ newPrice }) => {

        // inlined
        const singedBySeller = pforce( delSingedBySeller );

        // audit 08
        const _in = plet(
            plet(
                pmatch( purpose )
                .onSpending(({ utxoRef }) => utxoRef )
                ._(_ => perror( PTxOutRef.type ) )
            ).in( spendingRef =>
                tx.inputs.filter( _in => _in.utxoRef.eq( spendingRef )).head
            )
        );
        // we still require first output to be correct
        const out = plet( tx.outputs.head );

        const ownAddr = plet( _in.resolved.address );
        
        // audit 08
        // inlined
        const singleInputFormSelf = (
            pisEmpty.$(
                // filter by script credentials only
                // we don't care if the credentials are "own"
                // because we are testing for a single script input overall
                // so if this contract is running, is implicit the credentials are own
                tx.inputs.filter( isInputFromScript ).tail
            )
        );

        const rawFields = sale.raw.fields;

        // inlined
        const validOutDatum = out.datum.eq(
            POutputDatum.InlineDatum({
                datum: NFTSale.NFTSale({
                    price: pIntToData.$( newPrice ),
                    seller: PAddress.fromData( rawFields.tail.head ) as any,
                    policy: rawFields.tail.tail.head,
                    tokenName: rawFields.tail.tail.tail.head
                }) as any
            })
        );

        // inlined
        // audit 06
        const validOutAddress = out.address.eq( ownAddr )

        // inlined
        const validOut = validOutDatum.and( validOutAddress )

        return singedBySeller
        .and(  validOut )
        .and(  singleInputFormSelf );
    })
    .onBuy( _ => {

        const feeNumerator = plet(
            pmatch(
                ctx.tx.refInputs.find(({ resolved }) =>
                    pvalueOf.$( oracleNftSym ).$( oracleNftName ).$( resolved.value ).eq( 1 )
                )
            )
            .onNothing( _ => perror( int ) )
            .onJust(({ val }) =>
                // only works if inline datum
                punIData.$(
                    val.resolved.datum // POutputDatum
                    .raw.fields // first field (datum if inline)
                    .head // the datum data
                )
            )
        );

        // inlined
        const onlyOneRequiredSigner = pisEmpty.$( tx.signatories.tail );

        // inlined
        const nftSentToSigner =
        // `plet.in` to avoid inilining in recursive `some`
        plet(
            tx.signatories.head
        ).in( fstSigner => 
            tx.outputs.some( out => {
        
                const outToBuyer = pmatch( out.address.credential )
                .onPPubKeyCredential(({ pkh }) => pkh.eq( fstSigner ))
                ._( _ => pBool( false ) );

                const valueIncludesNFT = out.value.some(({ fst, snd: assets }) =>
                    fst.eq( sale.policy )
                    .and(
                        assets.some( entry =>
                            entry.fst.eq( sale.tokenName )
                            .and( entry.snd.eq( 1 ) ) 
                        ) 
                    )
                );

                return outToBuyer.and( valueIncludesNFT );
            })
        );

        const ownerFee = plet(
            sale.price.mult(feeNumerator).div(feeDenominator)
        );

        const realPrice = plet(
            sale.price.sub( ownerFee )
        );

        // inlined
        const paidToSeller = paidAmtToAddr.$( realPrice ).$( sale.seller )

        // inlined
        const scriptInputs = tx.inputs.filter( isInputFromScript );

        // inlined
        // implies the only script running is the current;
        // prevents double satisfaciton
        const singleScriptInput = pisEmpty.$( scriptInputs.tail );

        // inlined
        const paidFee = feeNumerator.eq( 0 ).or( paidAmtToAddr.$( ownerFee ).$( owner ) );

        return singleScriptInput
        .and(  onlyOneRequiredSigner )
        .and(  nftSentToSigner )
        .and(  paidFee )
        .and(  paidToSeller )
    });
});

export function makeMarketplaceContract(
    paymentAssetSym: Term<typeof PCurrencySymbol>,
    paymentAssetName: Term<typeof PTokenName>,
    owner: Term<typeof PAddress>,
    oracleNftSym: Term<typeof PCurrencySymbol>,
    oracleNftName: Term<typeof PTokenName>
)
{
    return makeValidator(
        contract
        .$( paymentAssetSym )
        .$( paymentAssetName )
        .$( owner )
        .$( oracleNftSym )
        .$( oracleNftName )
    );
}

export function makeMarketplace(
    paymentAssetSym: Term<typeof PCurrencySymbol>,
    paymentAssetName: Term<typeof PTokenName>,
    owner: Term<typeof PAddress>,
    oracleNftSym: Term<typeof PCurrencySymbol>,
    oracleNftName: Term<typeof PTokenName>
)
{
    return new Script(
        "PlutusScriptV2",
        compile(
            makeMarketplaceContract(
                paymentAssetSym,
                paymentAssetName,
                owner,
                oracleNftSym,
                oracleNftName,
            )
        )
    );
}