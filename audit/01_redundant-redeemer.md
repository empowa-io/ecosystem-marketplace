# Vulnerability 01: Redundant Redeemer

Severity: Informational

## Description

Since Cardano transactions contain old state, update message (i.e. redeemer),
and the new state, in logics where simply a new value should replace its older
counterpart, providing the new value by the redeemer is redundant and can be
directly specified as the new state.

In our review we encountered two instances of this form of redundancy:
1. In the single endpoint of `feeOracle.ts`.
2. In the `Update` endpoint of `marketplace.ts`.

## Recommendation

By omitting the new value from the redeemers of these two endpoints, their
corresponding transactions can have smaller sizes.

As a consequence, required validations for the new values must be performed
after grabbing them from the updated datums.
