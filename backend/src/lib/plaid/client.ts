import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid'

export function createPlaidClient(
  clientId: string,
  secret: string,
  environment: 'sandbox' | 'development' | 'production',
): PlaidApi {
  const configuration = new Configuration({
    basePath: PlaidEnvironments[environment],
    baseOptions: {
      headers: {
        'PLAID-CLIENT-ID': clientId,
        'PLAID-SECRET': secret,
      },
    },
  })
  return new PlaidApi(configuration)
}
