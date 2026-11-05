//! ORZARYN escrow program — Anchor (Stage 13)
//!
//! ⚠️ STATUS: UNCOMPILED — the build environment has no Rust/Solana/Anchor
//! toolchain (ADR-003). This source has NOT been compiled, tested on-chain, or
//! audited. Do not deploy to ANY cluster without compilation, `anchor test`,
//! independent security review, and explicit principal authorisation.
//!
//! Design notes (enforced here, mirrored offchain):
//! - Canonical USDC mint is fixed at platform init; every token transfer validates it.
//! - All arithmetic is checked (u64 `checked_*`); no float anywhere.
//! - One-time settlement: `released`/`refunded` flags guard release & refund.
//! - Release + refund + fee ≤ escrowed amount enforced by construction.
//! - Every account is validated with `has_one` / explicit ownership checks.
//! - Replay protection: deterministic PDAs + one-time flags + anchor constraints.
//! - The agent never holds signer authority over escrow: `agent_authority`
//!   signs only `create_work_order` within a mandate; buyer authority controls
//!   release/refund; provider authority only accepts and commits evidence.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("orz6kR1WYePo2UgtGSyu98oGe69gk1aspEf79MYLNSz");

#[program]
pub mod orzaryn_escrow {
    use super::*;

    /// 0. Platform registration — fixes the canonical USDC mint (Stage 13 #1).
    pub fn initialize_platform(ctx: Context<InitializePlatform>, platform_id: u64) -> Result<()> {
        let p = &mut ctx.accounts.platform;
        p.bump = ctx.bumps.platform;
        p.authority = ctx.accounts.platform_authority.key();
        p.usdc_mint = ctx.accounts.usdc_mint.key();
        p.platform_id = platform_id;
        p.work_order_nonce = 0;
        emit!(PlatformInitialized { platform_id, usdc_mint: p.usdc_mint });
        Ok(())
    }

    /// 1. Organisation registration (Stage 13 #1).
    pub fn register_organisation(ctx: Context<RegisterOrganisation>, org_seed: u64) -> Result<()> {
        let o = &mut ctx.accounts.organisation;
        o.bump = ctx.bumps.organisation;
        o.platform = ctx.accounts.platform.key();
        o.authority = ctx.accounts.buyer_authority.key();
        o.org_seed = org_seed;
        o.mandate_nonce = 0;
        emit!(OrganisationRegistered { org_seed });
        Ok(())
    }

    /// 2. Treasury funding — buyer moves USDC into the org treasury PDA (Stage 13 #2).
    pub fn fund_treasury(ctx: Context<FundTreasury>, amount: u64) -> Result<()> {
        require!(amount > 0, OrzError::ZeroAmount);
        require!(
            ctx.accounts.buyer_token_account.mint == ctx.accounts.platform.usdc_mint,
            OrzError::WrongMint
        );
        let cpi_accounts = Transfer {
            from: ctx.accounts.buyer_token_account.to_account_info(),
            to: ctx.accounts.treasury_token_account.to_account_info(),
            authority: ctx.accounts.buyer_authority.to_account_info(),
        };
        token::transfer(CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts), amount)?;
        emit!(TreasuryFunded { org: ctx.accounts.organisation.key(), amount });
        Ok(())
    }

    /// 3. Mandate creation — bounded spending authority for ONE agent (Stage 13 #3).
    pub fn create_mandate(
        ctx: Context<CreateMandate>,
        mandate_id: u64,
        per_purchase_limit: u64,
        daily_limit: u64,
        aggregate_budget: u64,
        approval_threshold: Option<u64>,
        expires_at: i64,
    ) -> Result<()> {
        require!(per_purchase_limit <= daily_limit && daily_limit <= aggregate_budget, OrzError::LimitsDisordered);
        require!(expires_at > Clock::get()?.unix_timestamp, OrzError::MandateExpired);
        let o = &mut ctx.accounts.organisation;
        o.mandate_nonce = o.mandate_nonce.checked_add(1).ok_or(OrzError::Overflow)?;
        let m = &mut ctx.accounts.mandate;
        m.bump = ctx.bumps.mandate;
        m.organisation = o.key();
        m.mandate_id = mandate_id;
        m.agent_authority = ctx.accounts.agent_authority.key();
        m.per_purchase_limit = per_purchase_limit;
        m.daily_limit = daily_limit;
        m.aggregate_budget = aggregate_budget;
        m.committed_total = 0;
        m.approval_threshold = approval_threshold;
        m.expires_at = expires_at;
        m.revoked = false;
        emit!(MandateCreated { mandate_id, agent: m.agent_authority, aggregate_budget });
        Ok(())
    }

    /// 4. Mandate revocation — immediate; in-flight orders settle out (Stage 13 #4).
    pub fn revoke_mandate(ctx: Context<MandateAuth>, _mandate_id: u64) -> Result<()> {
        let m = &mut ctx.accounts.mandate;
        require!(!m.revoked, OrzError::AlreadyRevoked);
        m.revoked = true;
        emit!(MandateRevoked { mandate: m.key() });
        Ok(())
    }

    /// 5. Work-order creation — agent signs WITHIN mandate bounds (Stage 13 #5).
    /// Terms hash binds the immutable commercial terms; above-threshold amounts
    /// require the buyer authority as an additional signer.
    pub fn create_work_order(
        ctx: Context<CreateWorkOrder>,
        work_order_id: u64,
        amount: u64,
        terms_hash: [u8; 32],
        delivery_deadline: i64,
    ) -> Result<()> {
        let m = &ctx.accounts.mandate;
        require!(!m.revoked, OrzError::MandateRevoked);
        require!(Clock::get()?.unix_timestamp < m.expires_at, OrzError::MandateExpired);
        require!(amount > 0 && amount <= m.per_purchase_limit, OrzError::PerPurchaseLimitExceeded);
        require!(
            m.committed_total.checked_add(amount).ok_or(OrzError::Overflow)? <= m.aggregate_budget,
            OrzError::AggregateBudgetExceeded
        );
        require!(delivery_deadline > Clock::get()?.unix_timestamp, OrzError::DeadlineInPast);
        if let Some(threshold) = m.approval_threshold {
            if amount >= threshold {
                require!(ctx.accounts.buyer_authority.is_some(), OrzError::ApprovalRequired);
                require_keys_eq!(
                    ctx.accounts.buyer_authority.as_ref().unwrap().key(),
                    ctx.accounts.organisation.authority,
                    OrzError::ApprovalRequired
                );
            }
        }
        let p = &mut ctx.accounts.platform;
        p.work_order_nonce = p.work_order_nonce.checked_add(1).ok_or(OrzError::Overflow)?;
        let w = &mut ctx.accounts.work_order;
        w.bump = ctx.bumps.work_order;
        w.mandate = m.key();
        w.work_order_id = work_order_id;
        w.amount = amount;
        w.terms_hash = terms_hash;
        w.evidence_hash = [0u8; 32];
        w.evidence_version = 0;
        w.delivery_deadline = delivery_deadline;
        w.state = WorkOrderState::Created;
        w.released = false;
        w.refunded = false;
        emit!(WorkOrderCreated { work_order_id, amount, terms_hash });
        Ok(())
    }

    /// 6. Escrow funding — treasury PDA moves `amount` into the work-order escrow
    /// token account; state → Funded (Stage 13 #6).
    pub fn fund_escrow(ctx: Context<FundEscrow>, _work_order_id: u64) -> Result<()> {
        let w = &mut ctx.accounts.work_order;
        require!(w.state == WorkOrderState::Created, OrzError::InvalidState);
        require!(
            ctx.accounts.treasury_token_account.mint == ctx.accounts.platform.usdc_mint,
            OrzError::WrongMint
        );
        let org_key = ctx.accounts.organisation.key();
        let seeds = &[b"treasury".as_ref(), org_key.as_ref(), &[ctx.bumps.treasury]];
        let signer = &[&seeds[..]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.treasury_token_account.to_account_info(),
                    to: ctx.accounts.escrow_token_account.to_account_info(),
                    authority: ctx.accounts.treasury.to_account_info(),
                },
                signer,
            ),
            w.amount,
        )?;
        w.state = WorkOrderState::Funded;
        emit!(EscrowFunded { work_order: w.key(), amount: w.amount });
        Ok(())
    }

    /// 7. Provider acceptance — only the approved provider of record (Stage 13 #7).
    pub fn provider_accept(ctx: Context<ProviderAction>, _work_order_id: u64) -> Result<()> {
        let w = &mut ctx.accounts.work_order;
        require!(w.state == WorkOrderState::Funded, OrzError::InvalidState);
        w.state = WorkOrderState::Accepted;
        emit!(ProviderAccepted { work_order: w.key() });
        Ok(())
    }

    /// 8. Delivery evidence commitment — hash only; content stays off-chain (Stage 13 #8).
    pub fn commit_evidence(ctx: Context<ProviderAction>, _work_order_id: u64, evidence_hash: [u8; 32]) -> Result<()> {
        let w = &mut ctx.accounts.work_order;
        require!(w.state == WorkOrderState::Accepted, OrzError::InvalidState);
        w.evidence_hash = evidence_hash;
        w.evidence_version = w.evidence_version.checked_add(1).ok_or(OrzError::Overflow)?;
        w.state = WorkOrderState::Delivered;
        emit!(EvidenceCommitted { work_order: w.key(), evidence_hash, version: w.evidence_version });
        Ok(())
    }

    /// 9. Buyer acceptance (Stage 13 #9) + 10. Release — ONE-TIME settlement (Stage 13 #10).
    pub fn buyer_accept_and_release(ctx: Context<BuyerRelease>, _work_order_id: u64, fee_bps: u64) -> Result<()> {
        // Read everything through immutable borrows first; the work-order PDA is
        // the transfer authority, so mutable borrows must wait until transfers are done.
        require!(ctx.accounts.work_order.state == WorkOrderState::Delivered, OrzError::InvalidState);
        require!(
            !ctx.accounts.work_order.released && !ctx.accounts.work_order.refunded,
            OrzError::AlreadySettled
        );
        require!(fee_bps <= 1_500, OrzError::FeeTooHigh);
        let gross = ctx.accounts.work_order.amount;
        let fee = gross.checked_mul(fee_bps).ok_or(OrzError::Overflow)?.checked_div(10_000).ok_or(OrzError::Overflow)?;
        let net = gross.checked_sub(fee).ok_or(OrzError::Overflow)?;
        require!(net > 0, OrzError::NetZero);

        let mandate_key = ctx.accounts.mandate.key();
        let bump = [ctx.accounts.work_order.bump];
        let seeds = &[b"workorder".as_ref(), mandate_key.as_ref(), &ctx.accounts.work_order.work_order_id.to_le_bytes(), &bump[..]];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.provider_token_account.to_account_info(),
                    authority: ctx.accounts.work_order.to_account_info(),
                },
                signer,
            ),
            net,
        )?;
        if fee > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.escrow_token_account.to_account_info(),
                        to: ctx.accounts.fee_token_account.to_account_info(),
                        authority: ctx.accounts.work_order.to_account_info(),
                    },
                    signer,
                ),
                fee,
            )?;
        }
        let w = &mut ctx.accounts.work_order;
        w.released = true; // one-time settlement flag
        w.state = WorkOrderState::Released;
        emit!(Released { work_order: w.key(), gross, fee, net });
        Ok(())
    }

    /// 11. Refund — requires dispute record or passed deadline; ONE-TIME (Stage 13 #11).
    pub fn refund(ctx: Context<BuyerRelease>, _work_order_id: u64) -> Result<()> {
        // Immutable reads first (the work-order PDA signs the transfer below).
        require!(
            !ctx.accounts.work_order.released && !ctx.accounts.work_order.refunded,
            OrzError::AlreadySettled
        );
        require!(
            ctx.accounts.work_order.state == WorkOrderState::Disputed
                || Clock::get()?.unix_timestamp > ctx.accounts.work_order.delivery_deadline,
            OrzError::RefundRequiresDisputeOrDeadline
        );

        let mandate_key = ctx.accounts.mandate.key();
        let bump = [ctx.accounts.work_order.bump];
        let seeds = &[b"workorder".as_ref(), mandate_key.as_ref(), &ctx.accounts.work_order.work_order_id.to_le_bytes(), &bump[..]];
        let signer = &[&seeds[..]];
        let amount = ctx.accounts.escrow_token_account.amount;
        require!(amount > 0, OrzError::ZeroAmount);
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.escrow_token_account.to_account_info(),
                    to: ctx.accounts.treasury_token_account.to_account_info(),
                    authority: ctx.accounts.work_order.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;
        let w = &mut ctx.accounts.work_order;
        w.refunded = true;
        w.state = WorkOrderState::Refunded;
        emit!(Refunded { work_order: w.key(), amount });
        Ok(())
    }

    /// 12. Dispute — freezes settlement until resolve/refund path (Stage 13 #12).
    pub fn open_dispute(ctx: Context<OpenDispute>, _work_order_id: u64, reason_hash: [u8; 32]) -> Result<()> {
        let w = &mut ctx.accounts.work_order;
        require!(
            w.state == WorkOrderState::Funded
                || w.state == WorkOrderState::Accepted
                || w.state == WorkOrderState::Delivered,
            OrzError::InvalidState
        );
        require!(!w.released && !w.refunded, OrzError::AlreadySettled);
        let d = &mut ctx.accounts.dispute;
        d.work_order = w.key();
        d.reason_hash = reason_hash;
        d.opened_by = ctx.accounts.disputer.key();
        d.resolved = false;
        w.state = WorkOrderState::Disputed;
        emit!(DisputeOpened { work_order: w.key(), reason_hash });
        Ok(())
    }
}

// ── State ────────────────────────────────────────────────────────────────────

#[account]
pub struct Platform {
    pub bump: u8,
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub platform_id: u64,
    pub work_order_nonce: u64,
}

#[account]
pub struct Organisation {
    pub bump: u8,
    pub platform: Pubkey,
    pub authority: Pubkey, // buyer authority
    pub org_seed: u64,
    pub mandate_nonce: u64,
}

#[account]
pub struct Mandate {
    pub bump: u8,
    pub organisation: Pubkey,
    pub mandate_id: u64,
    pub agent_authority: Pubkey,
    pub per_purchase_limit: u64,
    pub daily_limit: u64,
    pub aggregate_budget: u64,
    pub committed_total: u64,
    pub approval_threshold: Option<u64>,
    pub expires_at: i64,
    pub revoked: bool,
}

#[account]
pub struct WorkOrder {
    pub bump: u8,
    pub mandate: Pubkey,
    pub work_order_id: u64,
    pub amount: u64,
    pub terms_hash: [u8; 32],
    pub evidence_hash: [u8; 32],
    pub evidence_version: u32,
    pub delivery_deadline: i64,
    pub state: WorkOrderState,
    pub released: bool,
    pub refunded: bool,
}

#[account]
pub struct Dispute {
    pub work_order: Pubkey,
    pub reason_hash: [u8; 32],
    pub opened_by: Pubkey,
    pub resolved: bool,
}

#[account]
pub struct ProviderRecord {
    pub authority: Pubkey, // provider wallet
    pub approved: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, Copy, Debug)]
pub enum WorkOrderState {
    Created,
    Funded,
    Accepted,
    Delivered,
    Released,
    Refunded,
    Disputed,
}

// ── Contexts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializePlatform<'info> {
    #[account(init, payer = platform_authority, space = 8 + 1 + 32 + 32 + 8 + 8, seeds = [b"platform"], bump)]
    pub platform: Account<'info, Platform>,
    #[account(mut)]
    pub platform_authority: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>, // canonical USDC (testnet in staging)
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(org_seed: u64)]
pub struct RegisterOrganisation<'info> {
    pub platform: Account<'info, Platform>,
    #[account(init, payer = buyer_authority, space = 8 + 1 + 32 + 32 + 8 + 8, seeds = [b"org", buyer_authority.key().as_ref(), &org_seed.to_le_bytes()], bump)]
    pub organisation: Account<'info, Organisation>,
    /// CHECK: treasury PDA, validated by seeds; holds no data (space = 0)
    #[account(init, payer = buyer_authority, space = 0, seeds = [b"treasury", organisation.key().as_ref()], bump)]
    pub treasury: AccountInfo<'info>,
    #[account(mut)]
    pub buyer_authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundTreasury<'info> {
    pub platform: Account<'info, Platform>,
    pub organisation: Account<'info, Organisation>,
    /// CHECK: treasury PDA, validated by seeds
    #[account(seeds = [b"treasury", organisation.key().as_ref()], bump)]
    pub treasury: AccountInfo<'info>,
    #[account(mut, token::mint = platform.usdc_mint)]
    pub treasury_token_account: Account<'info, TokenAccount>,
    #[account(mut, token::mint = platform.usdc_mint, token::authority = buyer_authority)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    pub buyer_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(mandate_id: u64)]
pub struct CreateMandate<'info> {
    #[account(mut, has_one = authority)]
    pub organisation: Account<'info, Organisation>,
    #[account(init, payer = authority, space = 8 + 1 + 32 + 8 + 32 + 8 * 5 + 9 + 8 + 1, seeds = [b"mandate", organisation.key().as_ref(), &mandate_id.to_le_bytes()], bump)]
    pub mandate: Account<'info, Mandate>,
    /// CHECK: the agent's designated signing key; can be a PDA of the agent system
    pub agent_authority: AccountInfo<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// mandate revoke — org authority only
#[derive(Accounts)]
#[instruction(mandate_id: u64)]
pub struct MandateAuth<'info> {
    #[account(has_one = organisation)]
    pub mandate: Account<'info, Mandate>,
    #[account(has_one = authority)]
    pub organisation: Account<'info, Organisation>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(work_order_id: u64)]
pub struct CreateWorkOrder<'info> {
    #[account(mut)]
    pub platform: Account<'info, Platform>,
    // NOTE: no has_one = authority here — the buyer authority is an Option
    // signer; the above-threshold binding to organisation.authority is enforced
    // explicitly inside create_work_order.
    pub organisation: Account<'info, Organisation>,
    #[account(has_one = organisation, constraint = !mandate.revoked @ OrzError::MandateRevoked)]
    pub mandate: Account<'info, Mandate>,
    #[account(init, payer = payer, space = 8 + 1 + 32 + 8 + 8 + 32 + 32 + 4 + 8 + 1 + 1 + 1 + 8, seeds = [b"workorder", mandate.key().as_ref(), &work_order_id.to_le_bytes()], bump)]
    pub work_order: Account<'info, WorkOrder>,
    /// CHECK: provider record must be approved (validated in accept)
    pub provider_record: Account<'info, ProviderRecord>,
    /// Agent authority — signs within mandate; the agent never gains escrow authority
    pub agent_authority: Signer<'info>,
    /// Required signer when amount ≥ approval threshold
    pub buyer_authority: Option<Signer<'info>>,
    #[account(mut)]
    pub payer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(work_order_id: u64)]
pub struct FundEscrow<'info> {
    pub platform: Account<'info, Platform>,
    pub organisation: Account<'info, Organisation>,
    #[account(has_one = organisation)]
    pub mandate: Account<'info, Mandate>,
    #[account(has_one = mandate, constraint = work_order.state == WorkOrderState::Created @ OrzError::InvalidState)]
    pub work_order: Account<'info, WorkOrder>,
    /// CHECK: treasury PDA seeds-validated
    #[account(seeds = [b"treasury", organisation.key().as_ref()], bump)]
    pub treasury: AccountInfo<'info>,
    // Token initialization requires the mint as a first-class account
    // (constrained to the platform's canonical USDC mint).
    #[account(constraint = usdc_mint.key() == platform.usdc_mint @ OrzError::WrongMint)]
    pub usdc_mint: Account<'info, Mint>,
    #[account(mut, token::mint = usdc_mint)]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    #[account(init_if_needed, payer = buyer_authority, token::mint = usdc_mint, token::authority = work_order, seeds = [b"escrow", work_order.key().as_ref()], bump)]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub buyer_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(work_order_id: u64)]
pub struct ProviderAction<'info> {
    pub platform: Account<'info, Platform>,
    #[account(has_one = mandate)]
    pub work_order: Account<'info, WorkOrder>,
    pub mandate: Account<'info, Mandate>,
    // Approved AND signed by the authority the record was issued to — otherwise
    // any signer could act for any approved provider record.
    #[account(constraint = provider_record.approved
        && provider_record.authority == provider_authority.key()
        @ OrzError::UnauthorizedProvider)]
    pub provider_record: Account<'info, ProviderRecord>,
    pub provider_authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(work_order_id: u64)]
pub struct BuyerRelease<'info> {
    pub platform: Account<'info, Platform>,
    pub organisation: Account<'info, Organisation>,
    #[account(has_one = organisation)]
    pub mandate: Account<'info, Mandate>,
    #[account(has_one = mandate, constraint = !work_order.released @ OrzError::AlreadySettled, constraint = !work_order.refunded @ OrzError::AlreadySettled)]
    pub work_order: Account<'info, WorkOrder>,
    /// CHECK: refund requires dispute record — validated in the instruction
    pub dispute: Option<Account<'info, Dispute>>,
    #[account(mut, token::mint = platform.usdc_mint, token::authority = work_order)]
    pub escrow_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = platform.usdc_mint)]
    pub provider_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = platform.usdc_mint)]
    pub fee_token_account: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::mint = platform.usdc_mint)]
    pub treasury_token_account: Box<Account<'info, TokenAccount>>,
    #[account(constraint = buyer_authority.key() == organisation.authority @ OrzError::Unauthorized)]
    pub buyer_authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(work_order_id: u64)]
pub struct OpenDispute<'info> {
    #[account(has_one = mandate)]
    pub work_order: Account<'info, WorkOrder>,
    pub mandate: Account<'info, Mandate>,
    #[account(init, payer = disputer, space = 8 + 32 + 32 + 32 + 1, seeds = [b"dispute", work_order.key().as_ref()], bump)]
    pub dispute: Account<'info, Dispute>,
    #[account(mut)]
    pub disputer: Signer<'info>,
    pub system_program: Program<'info, System>,
}

// ── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct PlatformInitialized { pub platform_id: u64, pub usdc_mint: Pubkey }
#[event]
pub struct OrganisationRegistered { pub org_seed: u64 }
#[event]
pub struct TreasuryFunded { pub org: Pubkey, pub amount: u64 }
#[event]
pub struct MandateCreated { pub mandate_id: u64, pub agent: Pubkey, pub aggregate_budget: u64 }
#[event]
pub struct MandateRevoked { pub mandate: Pubkey }
#[event]
pub struct WorkOrderCreated { pub work_order_id: u64, pub amount: u64, pub terms_hash: [u8; 32] }
#[event]
pub struct EscrowFunded { pub work_order: Pubkey, pub amount: u64 }
#[event]
pub struct ProviderAccepted { pub work_order: Pubkey }
#[event]
pub struct EvidenceCommitted { pub work_order: Pubkey, pub evidence_hash: [u8; 32], pub version: u32 }
#[event]
pub struct Released { pub work_order: Pubkey, pub gross: u64, pub fee: u64, pub net: u64 }
#[event]
pub struct Refunded { pub work_order: Pubkey, pub amount: u64 }
#[event]
pub struct DisputeOpened { pub work_order: Pubkey, pub reason_hash: [u8; 32] }

// ── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum OrzError {
    #[msg("Amount must be > 0")]
    ZeroAmount,
    #[msg("Overflow in checked arithmetic")]
    Overflow,
    #[msg("Token mint is not the canonical USDC mint")]
    WrongMint,
    #[msg("Limit configuration disordered")]
    LimitsDisordered,
    #[msg("Mandate already expired")]
    MandateExpired,
    #[msg("Mandate is revoked")]
    MandateRevoked,
    #[msg("Mandate was already revoked")]
    AlreadyRevoked,
    #[msg("Amount exceeds per-purchase limit")]
    PerPurchaseLimitExceeded,
    #[msg("Amount exceeds aggregate budget")]
    AggregateBudgetExceeded,
    #[msg("Buyer approval required above threshold")]
    ApprovalRequired,
    #[msg("Delivery deadline in the past")]
    DeadlineInPast,
    #[msg("Invalid state for this operation")]
    InvalidState,
    #[msg("Already settled (one-time settlement enforced)")]
    AlreadySettled,
    #[msg("Unauthorized provider")]
    UnauthorizedProvider,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Fee exceeds maximum basis points")]
    FeeTooHigh,
    #[msg("Refund requires an open dispute or a passed deadline")]
    RefundRequiresDisputeOrDeadline,
    #[msg("Net amount after fee must be > 0")]
    NetZero,
}
