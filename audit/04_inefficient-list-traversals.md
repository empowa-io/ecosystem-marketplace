# Vulnerability 04: Inefficient List Traversals

Severity: Informational

## Description

Using functions like `find` and `filter`—which can perform arbitrary logics on
list elements as they traverse—can have a negative impact on the required
execution budgets.

While using these functions can sometimes be inevitable, we have spotted a few
instances where we believe these traversals can be optimized:
1. `ownInput` in `feeOracle.ts`, optimization benefit here is quite small ([lines 25 to 38](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/feeOracle.ts#L25-L38)).
2. `ownOut` in `feeOracle.ts`, this is costlier than `ownInput` as the
   traversal logic goes through the value field of each element it checks ([lines 52 to 58](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/feeOracle.ts#L52-L58)).
3. `Buy` endpoint of `marketplace.ts`, finding oracle UTxO among the reference
   inputs ([lines 123 to 125](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/marketplace.ts#L123-L125)).

## Recommendation

The general solution for this kind of logic is to either provide the index of
the intended element via the redeemer, or expecting the element at an hardcoded
index.

Here are our suggested solutions to optimize the 3 instances:
1. Provide the index of `ownInput` in the redeemer (if the recommendation
   at [01. Redundant Redeemer](./01_redundant-redeemer.md) is followed, it
   frees up the redeemer to be used for this index).
2. Expect `ownOut` at index `0` of the outputs, make sure it's going back to the
   script (preferably validating the whole address, point 1 of [06. Staking Control](./06_staking-control.md) delves
   deeper into this aspect), and finally expect it to have exactly 1 asset (the
   beacon NFT) apart from its Lovelaces (much like the recommended solution for
   point 1 from [02. Costly Value Lookups](./02_costly-value-lookups.md)).
3. Provide the index of the beacon UTxO in the redeemer.

Note that further validations are required to make sure the element at specified
index is in fact the intended one.

Also, both inputs and reference inputs are lexicographically ordered based on
their transaction hashes first, and second on their output indices. This
ordering needs to be done beforehand in the off-chain code in order to find the
proper indices.

