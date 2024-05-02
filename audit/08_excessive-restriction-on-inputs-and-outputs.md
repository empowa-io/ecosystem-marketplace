# Vulnerability 08: Excessive Restriction on Inputs and Outputs

Severity: Minor

## Description

The `Update` endpoint of `marketplace.ts` requires exactly one input and one
output to the transaction ([lines 77 and 80](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/marketplace.ts#L77-L80)). This
means that the single input UTxO has to provide the fee to the transaction, and
therefore be reproduced with less Ada.

Performing this action multiple times can deplete the UTxO up to a point where
there won't be enough Ada to cover the minimum required in the reproduced UTxO.

## Recommendation

Instead of making this restriction on all the inputs and outputs, impose it on
the continuing inputs and outputs, i.e. ensure a single UTxO from the script is
getting spent and only one UTxO is reproduced.
