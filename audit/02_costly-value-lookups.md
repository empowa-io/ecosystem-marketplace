# Vulnerability 02: Costly Value Lookups

Severity: Informational

## Description

Input and output UTxOs in Cardano transactions typically depend upon the states
of users' wallets. Therefore employing functions that their execution cost
varies based on UTxO arrangements are not advisable.

We have spotted 4 occurances:
1. In `feeOracle.ts`, the value of input beacon UTxO is validated
   via `getNftQty` which is a partial application of `pvalueOf` ([line 40](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/feeOracle.ts#L40)).
2. In `feeOracle.ts`, the continuing output is identified using `getNftQty` ([line 54](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/feeOracle.ts#L54)).
   However, this becomes moot if the recommendation
   at [04. Inefficient List Traversals](./04_inefficient-list-traversals.md) is followed.
3. In `marketplace.ts`, validation for payout to seller is done
   by `paidAmtToHash` which uses `pvalueOf` under the hood ([line 176](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/marketplace.ts#L176)).
4. Similar to point 3, owner's fee payout is validated via `paidAmtToHash` ([line 187](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/marketplace.ts#L187)).

## Recommendation

The general solution for this potential issue is to allow values that a bit
more restricted. However this is not applicable to every instance.

Here are our recommended alternatives for each of the cases:
1. Expect the input value to have exactly 2 tokens, one of which is going to be
   Ada. Note that the amount of Ada should NOT be validated as it may depend on
   protocol parameters.
2. Please refer to [04. Inefficient List Traversals](./04_inefficient-list-traversals.md).
3. Expect the payout UTxO at a specific output index (either hardcoded, or
   specified via the redeemer). This allows a sort of decoupling from wallets.
4. Similar to 3.
