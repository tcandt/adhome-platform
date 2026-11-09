import type { BuildingLandlord, ConsoleBuildingDto } from '@/shared/types/portfolio';

type BuildingFields = Pick<ConsoleBuildingDto, 'streetAddress' | 'ward' | 'province' | 'buildingType' | 'managerName' | 'managerPhone'>;
type CopyData = { kind: 'building'; values: BuildingFields } | { kind: 'landlord'; values: BuildingLandlord };
const prefix = 'ADHOME_BUILDING_COPY_V1:';
const copied: Partial<Record<CopyData['kind'], CopyData>> = {};

export async function copyValue(value: string) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* Try the browser's legacy copy path. */ }
  }
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.cssText = 'position:fixed;left:-9999px;top:0';
  document.body.appendChild(input);
  input.select();
  const copiedText = document.execCommand('copy');
  input.remove();
  if (!copiedText) throw new Error('Clipboard unavailable');
}

export async function copyBuildingGroup(building: ConsoleBuildingDto, kind: CopyData['kind']) {
  const data: CopyData = kind === 'building'
    ? { kind, values: { streetAddress: building.streetAddress, ward: building.ward, province: building.province, buildingType: building.buildingType, managerName: building.managerName, managerPhone: building.managerPhone } }
    : { kind, values: { fullName: building.landlord?.fullName || '', birthDate: building.landlord?.birthDate || '', address: building.landlord?.address || '', idNumber: building.landlord?.idNumber || '', phone: building.landlord?.phone || '', accountNumber: building.landlord?.accountNumber || '', bank: building.landlord?.bank || '', accountName: building.landlord?.accountName || '' } };
  copied[kind] = data;
  try { await copyValue(prefix + JSON.stringify(data)); } catch { /* Keep the copy available within this tab. */ }
}

export async function readBuildingGroup(kind: CopyData['kind']): Promise<CopyData | null> {
  try {
    const text = await navigator.clipboard.readText();
    if (text.startsWith(prefix)) {
      const parsed = JSON.parse(text.slice(prefix.length));
      if (parsed?.kind === kind && parsed.values && typeof parsed.values === 'object' && !Array.isArray(parsed.values)) return parsed as CopyData;
    }
  } catch { /* Clipboard read may be unavailable on mobile HTTP. */ }
  return copied[kind] || null;
}
