import crypto from "node:crypto";

const webApi = "https://web.hunonic.com/api/api";

/** The official web API can create rates that the legacy mobile endpoint silently skips. */
export async function writeHunonicWebTariff(
  credentials: { phone: string; password: string },
  providerDeviceId: string,
  groupId: string,
  price: number,
): Promise<void> {
  async function request(path: string, token?: string, body?: unknown) {
    const response = await fetch(`${webApi}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.status !== true) {
      throw new Error("Hunonic Web chưa xác nhận yêu cầu cấu hình biểu giá.");
    }
    return payload;
  }

  const login = await request("/auth/login", undefined, {
    [credentials.phone.includes("@") ? "email" : "phone"]: credentials.phone,
    password: crypto
      .createHash("md5")
      .update(credentials.password)
      .digest("hex"),
  });
  const token = login.data?.token;
  if (typeof token !== "string" || !token) {
    throw new Error("Hunonic Web không trả về phiên đăng nhập hợp lệ.");
  }
  const homes = await request("/hun-api/home/list-home", token);
  if (!Array.isArray(homes.data)) {
    throw new Error("Hunonic Web không trả về danh sách nhà hợp lệ.");
  }
  let encryptedRoot: string | undefined;
  for (const home of homes.data) {
    const inventory = await request(
      `/hun-api/device/listDeviceOfHomeSelect?home_id=${encodeURIComponent(String(home.id))}`,
      token,
    );
    if (!Array.isArray(inventory.data)) {
      throw new Error("Hunonic Web không trả về danh sách thiết bị hợp lệ.");
    }
    for (const house of inventory.data) {
      for (const room of house.rooms ?? []) {
        const device = (room.devices ?? []).find(
          (item: { id?: unknown; root_type?: string }) =>
            String(item.id) === providerDeviceId &&
            item.root_type === "elmeter",
        );
        if (typeof device?.root_id === "string") encryptedRoot = device.root_id;
      }
    }
    if (encryptedRoot) break;
  }
  if (!encryptedRoot) {
    throw new Error("Không tìm thấy đúng mã thiết bị trong Hunonic Web.");
  }
  // Hunonic binds these JSON fields as strings; numeric price can produce a zero rate.
  await request("/hun-api/atmwifi/add-electricity-rate", token, {
    root_id: encryptedRoot,
    electricity_group_id: groupId,
    price: String(price),
  });
}
