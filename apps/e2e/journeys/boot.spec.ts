import { baseUrl } from '../support/base-url';
import { raw } from '../support/http';
import { mintPerson } from '../support/identity';

/**
 * T013. The walking skeleton: prove the fixture can boot the API, mint a token
 * the API accepts, and reach it over HTTP - before any journey depends on it.
 */
describe('e2e fixture', () => {
  it('boots the API and answers health over real HTTP', async () => {
    const res = await raw(baseUrl(), '/v1/health');
    expect(res.status).toBe(200);
  });

  it('mints a token the running API accepts', async () => {
    const person = mintPerson('skeleton');
    const anon = await raw(baseUrl(), '/v1/feed/home');
    expect(anon.status).toBe(401);
    const authed = await raw(baseUrl(), '/v1/feed/home', { token: person.token });
    expect(authed.status).toBe(200);
  });
});
