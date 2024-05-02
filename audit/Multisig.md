
# Initial Setup
The Multisig Minting policy serves two main purposes:

- Ensures that the initial setup is correctly executed, with the output address as the multisig validator.
- Mints a unique Multisig NFT intended for locking within the multisig validator.

```mermaid
graph LR
    TX[ Transaction]
    S1{ Multisig \n Policy }
    A1((Output))
    S1 --> TX
    TX --> A1
    subgraph Multisig Validator
    A1
    id[("Datum \n keys = [PKH_1] \n requiredCount = 1")]
    end
```

# Multisig Actions
The Multisig spending validator consists of two actions:

## Update
Allows for the addition or removal of members from the Multisig arrangement, and updates the required signers threshold, using `signedByAMajority` function

```mermaid
graph LR
    TX[ Transaction]
    S1((Input))
    A1((Output))
    S1 --> TX
    TX --> A1

    subgraph Multisig Validator In
    S1
    S1_d[("Datum \n keys = [PKH_1] \n requiredCount = 1")]
    end

    subgraph Multisig Validator Out
    A1
    A1_d[("Datum \n keys = [PKH_1, PKH_2,PKH_3, PKH_4 , PKH_5] \n requiredCount = 3")]
    end
```

## Sign
This action ensures that the number of signers meets or exceeds the specified threshold, using `signedByAMajority` function.

The datum of the Multisig remains the same

Because the Multisig NFT is unique, you have the option to either parametrize the contract or set the Multisig policy in the your contract's datum as a Config.

In your contract, the only requirement is to confirm the presence of the NFT in the transaction.

```mermaid
graph LR
    TX[ Transaction]
    S1((Input))
    S2((Input))
    A1((Output))
    A2((Output))
    S1 --> TX
    S2 --> TX
    TX --> A1
    TX --> A2

    subgraph Your Validator In
    S2
    end
    subgraph Your Validator Out
    A2
    end

    subgraph Multisig Validator In
    S1
    S1_d[("Datum \n keys = [PKH_1] \n requiredCount = 1")]
    end

    subgraph Multisig Validator Out
    A1
    a1_d[("Datum \n keys = [PKH_1] \n requiredCount = 1")]
    end

```