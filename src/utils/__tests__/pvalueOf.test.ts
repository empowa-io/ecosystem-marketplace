import {
  Machine,
  PCurrencySymbol,
  PValue,
  bs,
  int,
  pfn,
  list,
  pList,
  pPair,
  pair,
  PTokenName,
  ptraceInt,
} from "@harmoniclabs/plu-ts";
import { pvalueOf } from "../pvalueOf";

const pvalueSingleton = pfn(
  [PCurrencySymbol.type, PTokenName.type, int],
  PValue.type
)((cs, tn, qty) => {
  const PTokenAndQty = pair(PTokenName.type, int);
  const mkTokenAndQty = pPair(PTokenName.type, int);
  const mkTokensAndQtys = pList(PTokenAndQty);
  const mkAssetClass = pPair(PCurrencySymbol.type, list(PTokenAndQty));
  const mkValue = pList(pair(PCurrencySymbol.type, list(PTokenAndQty)));
  return PValue.from(
    mkValue([mkAssetClass(cs, mkTokensAndQtys([mkTokenAndQty(tn, qty)]))])
  );
});

test("pvalueOf", () => {
  const doStuff = pfn(
    [bs, bs, int],
    int
  )((cs, tn, qty) => {
    const testVal = pvalueSingleton.$(cs).$(tn).$(qty);
    const resQty = pvalueOf.$(cs).$(tn).$(testVal);
    return ptraceInt.$(resQty);
  });

  console.log(
    Machine.eval(
      doStuff
        .$("00000000000000000000000000000000000000000000000000000000")
        .$("deadbeef")
        .$(10)
    )
  );
});
