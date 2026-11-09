import { decryptSecret } from "./cryptoVault";

/** Read current vault records and legacy records without exposing them to the browser. */
export function readHunonicCredentials(value: unknown): {
  phone: string;
  password?: string;
} {
  const record = (value && typeof value === "object" ? value : {}) as Record<
    string,
    unknown
  >;
  const secret = decryptSecret(record.encryptedSecret);
  if (secret) {
    try {
      const parsed = JSON.parse(secret);
      if (
        typeof parsed.phone === "string" &&
        typeof parsed.password === "string"
      ) {
        return { phone: parsed.phone, password: parsed.password };
      }
    } catch {
      /* Legacy vault entries used phone:password. */
    }
    const separator = secret.indexOf(":");
    if (separator >= 0)
      return {
        phone: secret.slice(0, separator),
        password: secret.slice(separator + 1),
      };
    return { phone: secret };
  }
  return {
    phone: typeof record.phone === "string" ? record.phone : "",
    password:
      decryptSecret(record.encryptedPassword) ||
      (typeof record.password === "string" ? record.password : undefined),
  };
}
