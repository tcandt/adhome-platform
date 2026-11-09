import crypto from "node:crypto";

const md5 = (input: string) =>
  crypto.createHash("md5").update(input).digest("hex");

/** Mobile API protocol, independently implemented from tcandt/api-hunonic's reference. */
export function signHunonicLogin(fields: Record<string, string>): string {
  const scores = Object.entries(fields)
    .filter(([name]) => name !== "signature")
    .map(([name, text]) => {
      if (!text || text === "0") return name ? name.charCodeAt(0) + 58 : 155;
      const encoded = Buffer.from(text).toString("base64");
      if (/^-?\d+$/.test(encoded)) return Number.parseInt(encoded, 10);
      return [0, Math.floor(encoded.length / 2), encoded.length - 1].reduce(
        (score, index) => score + encoded.charCodeAt(index),
        0,
      );
    });
  // These are public mobile protocol identifiers, not the user's account credentials.
  const access =
    process.env.HUNONIC_SIGN_ACCESS_KEY ||
    "accessKey98ccdcbbe7b5528bec0ca31bbe8d93b4e76590dd";
  const secret =
    process.env.HUNONIC_SIGN_SECRET_KEY ||
    "HUNONICBIGBUG94d3c445e72ae7805fca3489edac9608c893e66b";
  return md5(
    `sha256fakeaccessKey=${access}${md5(String(scores.reduce((sum, score) => sum + score, 0)))}${secret}`,
  );
}
