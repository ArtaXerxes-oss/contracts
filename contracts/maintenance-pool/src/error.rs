use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
#[non_exhaustive]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    Unauthorized = 3,
    PoolNotFound = 4,
    TokenMismatch = 5,
    InvalidAmount = 6,
    InsufficientBalance = 7,
    InvalidFee = 8,
    /// Treasury cannot be set to the contract's own address (issue #39).
    InvalidTreasury = 9,
    /// The deposit's inactivity window has not yet elapsed (issue #42).
    InactivityWindowNotElapsed = 10,
    /// The caller is not the deposit's original sponsor (issue #42).
    NotDepositSponsor = 11,
    /// The deposit index is out of range (issue #42).
    DepositNotFound = 12,
    /// Contract is paused and this operation is not allowed (issue #14).
    ContractPaused = 13,
    /// The deposit count has reached its maximum limit (issue #45).
    DepositCountOverflow = 14,
    /// The pool already holds `MAX_DEPOSITS` deposits (issue #94).
    TooManyDeposits = 15,
    /// The deposit has already been reclaimed; a second reclaim is rejected
    /// to prevent the same index from draining other sponsors' funds (#479).
    AlreadyReclaimed = 17,
    /// Checked i128 arithmetic overflowed (e.g. `balance` / monotonic
    /// `total_deposited` near `i128::MAX`). Returned instead of panicking
    /// under release `overflow-checks = true` + `panic = "abort"`.
    ArithmeticOverflow = 16,
    /// Recipient basis-point weights do not sum to 10 000 (#484).
    InvalidSplit = 17,
    /// A recipient address equals the contract address — self-payout (#484).
    SelfPayout = 18,
}
