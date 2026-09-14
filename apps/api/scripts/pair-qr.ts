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
 *        (the address is accepted so the caller stays one shape; only the
 *         token is encoded — see below)
 */
import qrcode from 'qrcode-terminal';

const [address, token] = process.argv.slice(2);
if (!address || !token) {
  process.stderr.write('usage: pair-qr.ts <address> <token>\n');
  process.exit(2);
}

/**
 * THE TOKEN ALONE, AS PLAIN TEXT. This started as one code carrying both values
 * as JSON, and that was wrong in a way worth writing down.
 *
 * Nothing on the phone PARSES this code. A camera app hands you the decoded
 * string and stops — so a JSON payload means squinting at
 * `{"address":"http://192.168.1.42:3000/v1","token":"eyJ..."}` on a phone screen
 * and picking two values out of it by hand, past a 244-character token. That is
 * worse than what it replaced, not better: I designed it for a scanner that does
 * not exist yet.
 *
 * So the code carries the one value that CANNOT be typed. The address is 27
 * characters and gets typed; the token is 244 and gets scanned, copied whole,
 * and pasted. One scan, one short piece of typing, nothing to unpick.
 *
 * The version that parses this properly is the app itself — a "scan to connect"
 * control on the sign-in screen, which needs a camera permission and a new
 * build. Until that exists, a QR is a clipboard, and a clipboard should hold one
 * thing.
 */
const payload = token;
qrcode.generate(payload, { small: true }, (code: string) => {
  process.stdout.write(`${code}\n`);
});
