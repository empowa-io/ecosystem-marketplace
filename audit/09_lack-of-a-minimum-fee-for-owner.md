# Vulnerability 09: Lack of a Minimum Fee for Owner

Severity: Informational

## Description

Since owner fee at the `Buy` endpoint of `marketplace.md` is [found as a portion of the listed price](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/marketplace.ts#L167-L169), there
is a possibility for this value to fall below the minimum required Ada for a
UTxO. This prevents invocation of this endpoint for UTxOs with low prices.

## Recommendation

As the price of a listing can be updated or reclaimed, a convenient solution
is to set a minimum fee to reduce the probability of this failure for users.

