# Vulnerability 06: Staking Control

Severity: Minor

## Description

Whenever a validation needs to check where a UTxO is coming from (or going to),
an important consideration is the staking part of the address. If only the
payment part of the address is checked, it can potentially allow the staking
part of the UTxOs to be changed arbitrarily.

We spotted 4 occurances:
1. `ownOutToSelf` at `feeOracle.ts` does not check the staking part of the
   continuing output ([line 61](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/feeOracle.ts#L61)). This,
   however, is quite minor as the locked Ada is small.
2. `NFTSale` datum only stores the seller's public key hash, and therefore
   doesn't allow any validations on the staking part ([line 8](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/marketplace.ts#L8)).
3. Point 2 also applies to `owner`, a parameter to `marketplace.ts` ([line 37](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/marketplace.ts#L37)).
4. Continuing output of `marketplace.ts` is also prone to this vulnerability
   ([`validOutAddress`](https://github.com/empowa-io/ecosystem-marketplace/blob/d9d45981fc800f94a2e7302fd9c99098219bb562/src/contracts/marketplace.ts#L107)).

## Recommendation

In all cases, consider implementing validations for staking parts, i.e. instead
of checking the payment part, check the whole address.

