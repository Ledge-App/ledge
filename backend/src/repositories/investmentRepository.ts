import type { PlaidApi } from 'plaid'

// Holdings for one investment account, with the security catalog already joined in —
// Plaid returns holdings and securities as two parallel arrays keyed by security_id, and
// no client should have to re-do that join.
export interface Holding {
  securityId: string
  /** Security display name ("Vanguard Total Stock Market ETF"), null for unknowns. */
  name: string | null
  /** Ticker symbol ("VTI"); null for e.g. cash-equivalent sweep positions. */
  ticker: string | null
  /** Plaid security type: 'equity' | 'etf' | 'mutual fund' | 'cash' | 'fixed income' | 'cryptocurrency' | ... */
  type: string | null
  quantity: number
  /** Market value as the institution reports it. */
  institutionValue: number | null
  /** Total cost basis for the position (not per share). */
  costBasis: number | null
  /** Latest per-share price as the institution reports it. */
  institutionPrice: number | null
  /** Previous trading session's close, for day-change math. May lag by institution. */
  closePrice: number | null
  /** Parsed option details when the security is a contract — display "NFLX 355C", never the raw OCC symbol. */
  optionContract: { underlyingTicker: string | null; contractType: string; strikePrice: number } | null
  isoCurrencyCode: string | null
}

export const investmentRepository = {
  async getHoldings(client: PlaidApi, accessToken: string, accountId: string): Promise<Holding[]> {
    const response = await client.investmentsHoldingsGet({
      access_token: accessToken,
      options: { account_ids: [accountId] },
    } as never)

    const securityById = new Map(response.data.securities.map((s) => [s.security_id, s]))
    return response.data.holdings.map((holding) => {
      const security = securityById.get(holding.security_id)
      return {
        securityId: holding.security_id,
        name: security?.name ?? null,
        ticker: security?.ticker_symbol ?? null,
        type: security?.type ?? null,
        quantity: holding.quantity,
        institutionValue: holding.institution_value ?? null,
        costBasis: holding.cost_basis ?? null,
        institutionPrice: holding.institution_price ?? null,
        closePrice: security?.close_price ?? null,
        optionContract: security?.option_contract
          ? {
              underlyingTicker: security.option_contract.underlying_security_ticker ?? null,
              contractType: security.option_contract.contract_type,
              strikePrice: security.option_contract.strike_price,
            }
          : null,
        isoCurrencyCode: holding.iso_currency_code ?? null,
      }
    })
  },
}
