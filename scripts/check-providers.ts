import { checkProviderContracts } from '../src/valuation/providers';

const diagnostics = await checkProviderContracts();
if (diagnostics.length) {
  diagnostics.forEach(({ provider, reason }) => console.error(`${provider}: ${reason}`));
  throw new Error('Provider contract check failed. See source-specific failures above.');
} else {
  console.log('Provider public estimator contracts are reachable (read-only check).');
}
