export interface ExpiringContract {
  id: string;
  contractCode: string;
  tenantName: string;
  phone: string;
  buildingCode: string;
  buildingName: string;
  roomCode: string;
  endDate: string;
  daysRemaining: number;
  monthlyRent: number;
  depositStatus: 'HELD' | 'REFUNDED' | 'DISPUTED';
}

export interface PendingInvoice {
  id: string;
  invoiceCode: string;
  tenantName: string;
  roomCode: string;
  buildingCode: string;
  buildingName: string;
  period: string;
  amount: number;
  status: 'UNPAID' | 'PARTIALLY_PAID' | 'OVERDUE';
  dueDate: string;
  electricAmount: number;
  waterAmount: number;
  roomRentAmount: number;
}

export interface RecentTransaction {
  id: string;
  code: string;
  amount: number;
  type: 'PAYMENT_RECEIVED' | 'DEPOSIT_COLLECTED' | 'EXPENSE_MAINTENANCE' | 'DEPOSIT_REFUND';
  method: 'SEPAY_QR' | 'BANK_TRANSFER_VCB' | 'CASH';
  reference: string;
  payerName: string;
  roomCode: string;
  buildingCode: string;
  timestamp: string;
  status: 'COMPLETED' | 'PENDING' | 'RECONCILED';
}

export const EXPIRING_CONTRACTS_MOCK: ExpiringContract[] = [
  {
    id: 'ctr-01',
    contractCode: 'HD-2025-3104',
    tenantName: 'Trần Văn Long',
    phone: '0912445566',
    buildingCode: 'LK01-31',
    buildingName: 'Tòa LK01-31 Ân Phú',
    roomCode: '31-04',
    endDate: '2026-11-10',
    daysRemaining: 13,
    monthlyRent: 6500000,
    depositStatus: 'HELD',
  },
  {
    id: 'ctr-02',
    contractCode: 'HD-2026-3105',
    tenantName: 'Lê Hoàng Nam',
    phone: '0988776655',
    buildingCode: 'LK01-31',
    buildingName: 'Tòa LK01-31 Ân Phú',
    roomCode: '31-05',
    endDate: '2027-02-15',
    daysRemaining: 110,
    monthlyRent: 4800000,
    depositStatus: 'HELD',
  },
  {
    id: 'ctr-03',
    contractCode: 'HD-2026-2402',
    tenantName: 'Đặng Tuấn Kiệt',
    phone: '0908123789',
    buildingCode: 'LK08-24',
    buildingName: 'Tòa LK08-24 Ân Phú',
    roomCode: '24-02',
    endDate: '2027-03-15',
    daysRemaining: 138,
    monthlyRent: 4800000,
    depositStatus: 'HELD',
  },
];

export const PENDING_INVOICES_MOCK: PendingInvoice[] = [
  {
    id: 'inv-01',
    invoiceCode: 'HD-10-3105',
    tenantName: 'Lê Hoàng Nam',
    roomCode: '31-05',
    buildingCode: 'LK01-31',
    buildingName: 'Tòa LK01-31 Ân Phú',
    period: 'Tháng 10/2026',
    amount: 5520000,
    status: 'OVERDUE',
    dueDate: '2026-10-25',
    electricAmount: 520000,
    waterAmount: 200000,
    roomRentAmount: 4800000,
  },
  {
    id: 'inv-02',
    invoiceCode: 'HD-10-3204',
    tenantName: 'Võ Thị Thanh Thảo',
    roomCode: '32-04',
    buildingCode: 'LK01-32',
    buildingName: 'Tòa LK01-32 Ân Phú',
    period: 'Tháng 10/2026',
    amount: 6780000,
    status: 'PARTIALLY_PAID',
    dueDate: '2026-10-28',
    electricAmount: 580000,
    waterAmount: 200000,
    roomRentAmount: 6000000,
  },
  {
    id: 'inv-03',
    invoiceCode: 'HD-10-2405',
    tenantName: 'Nguyễn Thị Bích Ngọc',
    roomCode: '24-05',
    buildingCode: 'LK08-24',
    buildingName: 'Tòa LK08-24 Ân Phú',
    period: 'Tháng 10/2026',
    amount: 6850000,
    status: 'UNPAID',
    dueDate: '2026-10-30',
    electricAmount: 650000,
    waterAmount: 200000,
    roomRentAmount: 6000000,
  },
];

export const RECENT_TRANSACTIONS_MOCK: RecentTransaction[] = [
  {
    id: 'tx-01',
    code: 'TX-948192',
    amount: 6500000,
    type: 'PAYMENT_RECEIVED',
    method: 'SEPAY_QR',
    reference: 'ADHOME LK01-31 PHONG 3104 VCB',
    payerName: 'Trần Văn Long',
    roomCode: '31-04',
    buildingCode: 'LK01-31',
    timestamp: '14:22:15 hôm nay',
    status: 'COMPLETED',
  },
  {
    id: 'tx-02',
    code: 'TX-948191',
    amount: 5000000,
    type: 'DEPOSIT_COLLECTED',
    method: 'SEPAY_QR',
    reference: 'COC PHONG 3103 NGUYEN HOAI AN',
    payerName: 'Nguyễn Hoài An',
    roomCode: '31-03',
    buildingCode: 'LK01-31',
    timestamp: '11:05:40 hôm nay',
    status: 'COMPLETED',
  },
  {
    id: 'tx-03',
    code: 'TX-948190',
    amount: 6000000,
    type: 'PAYMENT_RECEIVED',
    method: 'BANK_TRANSFER_VCB',
    reference: 'THANH THAO TT TIEN PHONG 3204',
    payerName: 'Võ Thị Thanh Thảo',
    roomCode: '32-04',
    buildingCode: 'LK01-32',
    timestamp: '09:14:02 hôm nay',
    status: 'RECONCILED',
  },
  {
    id: 'tx-04',
    code: 'TX-948189',
    amount: 650000,
    type: 'EXPENSE_MAINTENANCE',
    method: 'CASH',
    reference: 'Thay role cong to dien Hunonic P2406 LK08-24',
    payerName: 'Thợ điện nước Tân An',
    roomCode: '24-06',
    buildingCode: 'LK08-24',
    timestamp: 'Hôm qua, 16:40',
    status: 'COMPLETED',
  },
];
