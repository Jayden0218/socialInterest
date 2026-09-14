/**
 * Render the address and token as a QR code, because you cannot type either.
 *
 * The token is ~244 characters of base64url. Reading that off a laptop screen
 * and typing it into a phone is the kind of step that gets done wrong three
 * times and then abandoned — and the failure ("invalid token") looks identical
 * whether you mistyped it or the backend is misconfigured.
 *
 * Scanning is not the only way; the text is printed too, so it can be emailed
 * or messaged. But a QR needs no account and no second device signed in.
 *
 * Usage: tsx apps/api/scripts/pair-qr.ts <address> <token>
 */
import qrcode from 'qrcode-terminal';

const [address, token] = process.argv.slice(2);
if (!address || !token) {
  process.stderr.write('usage: pair-qr.ts <address> <token>\n');
  process.exit(2);
}

/**
 * ONE CODE CARRYING BOTH, as a JSON object rather than two codes.
 *
 * Two codes is two scans and an ordering mistake waiting to happen — and the
 * app takes both values together anyway. `small: true` because a full-size code
 * for 300 characters does not fit in a terminal window, and a QR nobody can fit
 * on screen is a QR nobody can scan.
 */
const payload = JSON.stringify({ address, token });
qrcode.generate(payload, { small: true }, (code: string) => {
  process.stdout.write(`${code}\n`);
});
