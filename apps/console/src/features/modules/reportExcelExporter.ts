import ExcelJS from 'exceljs';
import type { ReportBuildingBreakdown } from './ReportsWorkspaceView';

export interface RoomMatrixRowDaily {
  day: number;
  rentVnd: number;
  depositVnd: number;
  electricVnd: number;
  waterVnd: number;
  electricWaterVnd: number;
  brokerExpenseVnd: number;
}

export interface RoomMatrixRowMonthly {
  month: number;
  periodKey: string;
  rentVnd: number;
  depositVnd: number;
  electricVnd: number;
  waterVnd: number;
  electricWaterVnd: number;
  brokerExpenseVnd: number;
}

export interface RoomMatrixDataRoom {
  roomId: string;
  roomCode: string;
  roomDisplayCode: string;
  daily: RoomMatrixRowDaily[];
  monthly: RoomMatrixRowMonthly[];
  totals: {
    rentVnd: number;
    depositVnd: number;
    electricVnd: number;
    waterVnd: number;
    electricWaterVnd: number;
    brokerExpenseVnd: number;
  };
}

export interface RoomMatrixBuildingGroup {
  buildingId: string;
  buildingCode: string;
  buildingName: string;
  rooms: RoomMatrixDataRoom[];
}

export interface RoomMatrixPayload {
  activePeriod: string;
  activeYear: string;
  activeMonth: number;
  daysInMonth: number;
  buildings: RoomMatrixBuildingGroup[];
}

export async function exportRoomMatrixExcel({
  roomMatrixData,
  activePeriod,
  breakdown,
}: {
  roomMatrixData?: RoomMatrixPayload | null;
  activePeriod: string;
  breakdown: ReportBuildingBreakdown[];
}): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'AdHome Platform';
  workbook.created = new Date();

  const yellowFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFFF00' }, // #FFFF00
  };
  const lightYellowFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFFFF9C4' }, // #FFF9C4
  };
  const headerGrayFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' }, // #F1F5F9
  };
  const redSubheaderFont: Partial<ExcelJS.Font> = {
    name: 'Arial',
    size: 9,
    bold: true,
    color: { argb: 'FFFF0000' }, // Red
  };
  const boldFont: Partial<ExcelJS.Font> = {
    name: 'Arial',
    size: 10,
    bold: true,
  };
  const regularFont: Partial<ExcelJS.Font> = {
    name: 'Arial',
    size: 9,
  };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };
  const totalBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF333333' } },
    left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'double', color: { argb: 'FF333333' } },
    right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
  };

  const buildings = roomMatrixData?.buildings || [];
  const daysInMonth = roomMatrixData?.daysInMonth || 31;
  const activeYear = roomMatrixData?.activeYear || activePeriod.slice(0, 4);
  const activeMonth =
    roomMatrixData?.activeMonth || parseInt(activePeriod.split('-')[1] || '1', 10);

  // =========================================================================
  // SHEET 1: MA TRẬN THU CHI THEO PHÒNG - CHI TIẾT THEO NGÀY (MẪU CHUẨN)
  // =========================================================================
  const sheet1 = workbook.addWorksheet(`Thu Chi Ngày (${activePeriod})`, {
    views: [{ showGridLines: true }],
  });

  sheet1.getColumn(1).width = 15; // Col A: THÁNG
  sheet1.getColumn(2).width = 6;  // Col B: NGÀY

  let currentCol = 3;
  const buildingColRanges: Array<{
    building: RoomMatrixBuildingGroup;
    startCol: number;
    endCol: number;
  }> = [];
  const roomColRanges: Array<{
    building: RoomMatrixBuildingGroup;
    room: RoomMatrixDataRoom;
    startCol: number;
  }> = [];

  for (const b of buildings) {
    const bStart = currentCol;
    for (const r of b.rooms) {
      const rStart = currentCol;
      roomColRanges.push({
        building: b,
        room: r,
        startCol: rStart,
      });
      // 4 sub-columns: PHÍ MG, TIỀN THUÊ, TIỀN CỌC, ĐIỆN NƯỚC
      for (let i = 0; i < 4; i++) {
        sheet1.getColumn(currentCol).width = 13.5;
        currentCol++;
      }
    }
    const bEnd = currentCol - 1;
    if (bEnd >= bStart) {
      buildingColRanges.push({
        building: b,
        startCol: bStart,
        endCol: bEnd,
      });
    }
  }

  // Row 2: Building Headers
  sheet1.getRow(2).height = 24;
  for (const bRange of buildingColRanges) {
    sheet1.mergeCells(2, bRange.startCol, 2, bRange.endCol);
    const cell = sheet1.getCell(2, bRange.startCol);
    cell.value = bRange.building.buildingCode || bRange.building.buildingName;
    cell.font = { name: 'Arial', size: 11, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = yellowFill;
    for (let c = bRange.startCol; c <= bRange.endCol; c++) {
      sheet1.getCell(2, c).border = thinBorder;
    }
  }

  // Row 3: Room Headers
  sheet1.getRow(3).height = 22;
  for (const rRange of roomColRanges) {
    sheet1.mergeCells(3, rRange.startCol, 3, rRange.startCol + 3);
    const cell = sheet1.getCell(3, rRange.startCol);
    cell.value = rRange.room.roomDisplayCode || rRange.room.roomCode;
    cell.font = boldFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = headerGrayFill;
    for (let c = rRange.startCol; c <= rRange.startCol + 3; c++) {
      sheet1.getCell(3, c).border = thinBorder;
    }
  }

  // Row 4: Subheaders (Red text)
  sheet1.getRow(4).height = 20;
  const subheaders = ['PHÍ MG', 'TIỀN THUÊ', 'TIỀN CỌC', 'ĐIỆN NƯỚC'];
  for (const rRange of roomColRanges) {
    subheaders.forEach((sh, idx) => {
      const cell = sheet1.getCell(4, rRange.startCol + idx);
      cell.value = sh;
      cell.font = redSubheaderFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
  }

  // Column A: Merged cell with yellow background
  const startDataRow = 5;
  const endDataRow = startDataRow + daysInMonth - 1;

  sheet1.mergeCells(startDataRow, 1, endDataRow, 1);
  const monthCell = sheet1.getCell(startDataRow, 1);
  monthCell.value = `THÁNG ${activeMonth}/${activeYear}`;
  monthCell.font = { name: 'Arial', size: 11, bold: true };
  monthCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  monthCell.fill = yellowFill;
  for (let r = startDataRow; r <= endDataRow; r++) {
    sheet1.getCell(r, 1).border = thinBorder;
  }

  // Rows 5..endDataRow: Daily data
  for (let day = 1; day <= daysInMonth; day++) {
    const rowNum = startDataRow + day - 1;
    sheet1.getRow(rowNum).height = 19;

    // Col B: Day
    const dayCell = sheet1.getCell(rowNum, 2);
    dayCell.value = day;
    dayCell.font = boldFont;
    dayCell.alignment = { horizontal: 'center', vertical: 'middle' };
    dayCell.border = thinBorder;

    // Room sub-columns
    for (const rRange of roomColRanges) {
      const dayData = rRange.room.daily?.find((d) => d.day === day) || {
        brokerExpenseVnd: 0,
        rentVnd: 0,
        depositVnd: 0,
        electricWaterVnd: 0,
      };

      const values = [
        dayData.brokerExpenseVnd || null,
        dayData.rentVnd || null,
        dayData.depositVnd || null,
        dayData.electricWaterVnd || null,
      ];

      values.forEach((val, idx) => {
        const cell = sheet1.getCell(rowNum, rRange.startCol + idx);
        if (val && val !== 0) {
          cell.value = val;
          cell.numFmt = '#,##0 "đ"';
        } else {
          cell.value = '';
        }
        cell.font = regularFont;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.border = thinBorder;
      });
    }
  }

  // Total Row at bottom
  const totalRow = endDataRow + 1;
  sheet1.getRow(totalRow).height = 22;
  sheet1.mergeCells(totalRow, 1, totalRow, 2);
  const totalLabel = sheet1.getCell(totalRow, 1);
  totalLabel.value = 'TỔNG CỘNG';
  totalLabel.font = boldFont;
  totalLabel.alignment = { horizontal: 'center', vertical: 'middle' };
  totalLabel.fill = lightYellowFill;
  sheet1.getCell(totalRow, 1).border = totalBorder;
  sheet1.getCell(totalRow, 2).border = totalBorder;

  for (const rRange of roomColRanges) {
    for (let idx = 0; idx < 4; idx++) {
      const col = rRange.startCol + idx;
      const colLetter = sheet1.getColumn(col).letter;
      const cell = sheet1.getCell(totalRow, col);
      cell.value = {
        formula: `SUM(${colLetter}${startDataRow}:${colLetter}${endDataRow})`,
      };
      cell.numFmt = '#,##0 "đ"';
      cell.font = boldFont;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.fill = lightYellowFill;
      cell.border = totalBorder;
    }
  }

  // =========================================================================
  // SHEET 2: MA TRẬN TỔNG HỢP 12 THÁNG TRONG NĂM
  // =========================================================================
  const sheet2 = workbook.addWorksheet(`Thu Chi Cả Năm (${activeYear})`, {
    views: [{ showGridLines: true }],
  });

  sheet2.getColumn(1).width = 15;
  sheet2.getColumn(2).width = 10;

  let s2Col = 3;
  const s2RoomColRanges: Array<{
    building: RoomMatrixBuildingGroup;
    room: RoomMatrixDataRoom;
    startCol: number;
  }> = [];
  const s2BuildingColRanges: Array<{
    building: RoomMatrixBuildingGroup;
    startCol: number;
    endCol: number;
  }> = [];

  for (const b of buildings) {
    const bStart = s2Col;
    for (const r of b.rooms) {
      const rStart = s2Col;
      s2RoomColRanges.push({
        building: b,
        room: r,
        startCol: rStart,
      });
      for (let i = 0; i < 4; i++) {
        sheet2.getColumn(s2Col).width = 13.5;
        s2Col++;
      }
    }
    const bEnd = s2Col - 1;
    if (bEnd >= bStart) {
      s2BuildingColRanges.push({
        building: b,
        startCol: bStart,
        endCol: bEnd,
      });
    }
  }

  // S2 Row 2: Building
  sheet2.getRow(2).height = 24;
  for (const bRange of s2BuildingColRanges) {
    sheet2.mergeCells(2, bRange.startCol, 2, bRange.endCol);
    const cell = sheet2.getCell(2, bRange.startCol);
    cell.value = bRange.building.buildingCode || bRange.building.buildingName;
    cell.font = { name: 'Arial', size: 11, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = yellowFill;
    for (let c = bRange.startCol; c <= bRange.endCol; c++) {
      sheet2.getCell(2, c).border = thinBorder;
    }
  }

  // S2 Row 3: Room
  sheet2.getRow(3).height = 22;
  for (const rRange of s2RoomColRanges) {
    sheet2.mergeCells(3, rRange.startCol, 3, rRange.startCol + 3);
    const cell = sheet2.getCell(3, rRange.startCol);
    cell.value = rRange.room.roomDisplayCode || rRange.room.roomCode;
    cell.font = boldFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = headerGrayFill;
    for (let c = rRange.startCol; c <= rRange.startCol + 3; c++) {
      sheet2.getCell(3, c).border = thinBorder;
    }
  }

  // S2 Row 4: Subheaders
  sheet2.getRow(4).height = 20;
  for (const rRange of s2RoomColRanges) {
    subheaders.forEach((sh, idx) => {
      const cell = sheet2.getCell(4, rRange.startCol + idx);
      cell.value = sh;
      cell.font = redSubheaderFont;
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = thinBorder;
    });
  }

  // S2 Col A: NĂM YYYY merge across 12 months
  const s2StartRow = 5;
  const s2EndRow = s2StartRow + 11;
  sheet2.mergeCells(s2StartRow, 1, s2EndRow, 1);
  const yearCell = sheet2.getCell(s2StartRow, 1);
  yearCell.value = `NĂM ${activeYear}`;
  yearCell.font = { name: 'Arial', size: 11, bold: true };
  yearCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  yearCell.fill = yellowFill;
  for (let r = s2StartRow; r <= s2EndRow; r++) {
    sheet2.getCell(r, 1).border = thinBorder;
  }

  // 12 Months
  for (let m = 1; m <= 12; m++) {
    const rowNum = s2StartRow + m - 1;
    sheet2.getRow(rowNum).height = 19;

    const mCell = sheet2.getCell(rowNum, 2);
    mCell.value = `Tháng ${m}`;
    mCell.font = boldFont;
    mCell.alignment = { horizontal: 'center', vertical: 'middle' };
    mCell.border = thinBorder;

    for (const rRange of s2RoomColRanges) {
      const monthData = rRange.room.monthly?.find((item) => item.month === m) || {
        brokerExpenseVnd: 0,
        rentVnd: 0,
        depositVnd: 0,
        electricWaterVnd: 0,
      };

      const values = [
        monthData.brokerExpenseVnd || null,
        monthData.rentVnd || null,
        monthData.depositVnd || null,
        monthData.electricWaterVnd || null,
      ];

      values.forEach((val, idx) => {
        const cell = sheet2.getCell(rowNum, rRange.startCol + idx);
        if (val && val !== 0) {
          cell.value = val;
          cell.numFmt = '#,##0 "đ"';
        } else {
          cell.value = '';
        }
        cell.font = regularFont;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.border = thinBorder;
      });
    }
  }

  // S2 Total Row
  const s2TotalRow = s2EndRow + 1;
  sheet2.getRow(s2TotalRow).height = 22;
  sheet2.mergeCells(s2TotalRow, 1, s2TotalRow, 2);
  const s2TotalLabel = sheet2.getCell(s2TotalRow, 1);
  s2TotalLabel.value = 'TỔNG CẢ NĂM';
  s2TotalLabel.font = boldFont;
  s2TotalLabel.alignment = { horizontal: 'center', vertical: 'middle' };
  s2TotalLabel.fill = lightYellowFill;
  sheet2.getCell(s2TotalRow, 1).border = totalBorder;
  sheet2.getCell(s2TotalRow, 2).border = totalBorder;

  for (const rRange of s2RoomColRanges) {
    for (let idx = 0; idx < 4; idx++) {
      const col = rRange.startCol + idx;
      const colLetter = sheet2.getColumn(col).letter;
      const cell = sheet2.getCell(s2TotalRow, col);
      cell.value = {
        formula: `SUM(${colLetter}${s2StartRow}:${colLetter}${s2EndRow})`,
      };
      cell.numFmt = '#,##0 "đ"';
      cell.font = boldFont;
      cell.alignment = { horizontal: 'right', vertical: 'middle' };
      cell.fill = lightYellowFill;
      cell.border = totalBorder;
    }
  }

  // =========================================================================
  // SHEET 3: BẢNG TỔNG HỢP THEO TÒA NHÀ
  // =========================================================================
  const sheet3 = workbook.addWorksheet(`Tổng Hợp Tòa Nhà`, {
    views: [{ showGridLines: true }],
  });

  const summaryHeaders = [
    'Mã tòa',
    'Tên tòa nhà',
    'Lấp đầy',
    'Tỷ lệ (%)',
    'Tiền thuê HĐ',
    'Đã lập HĐ',
    'Thực thu tổng',
    'Điện thực thu',
    'Nước thực thu',
    'Công nợ chưa thu',
    'Điện đã chi',
    'Nước đã chi',
    'Chi phí vận hành',
    'Tổng chi phí',
    'Lãi gộp kỳ',
  ];

  sheet3.getRow(1).height = 24;
  summaryHeaders.forEach((h, idx) => {
    sheet3.getColumn(idx + 1).width = 16;
    const cell = sheet3.getCell(1, idx + 1);
    cell.value = h;
    cell.font = boldFont;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.fill = headerGrayFill;
    cell.border = thinBorder;
  });

  breakdown.forEach((b, rIdx) => {
    const rowNum = rIdx + 2;
    sheet3.getRow(rowNum).height = 20;
    const exp = b.totalExpenseVnd || b.operatingExpenseVnd || 0;
    const net = b.netResultVnd !== undefined ? b.netResultVnd : b.collectedVnd - exp;

    const rowData: Array<string | number> = [
      b.buildingCode,
      b.buildingName,
      `${b.occupiedRooms}/${b.totalRooms}`,
      b.occupancyRatePercent,
      b.contractedRentVnd,
      b.invoicedVnd,
      b.collectedVnd,
      b.collectedElectricVnd || 0,
      b.collectedWaterVnd || 0,
      b.receivableVnd,
      b.electricExpenseVnd || 0,
      b.waterExpenseVnd || 0,
      b.generalExpenseVnd || 0,
      exp,
      net,
    ];

    rowData.forEach((val, cIdx) => {
      const cell = sheet3.getCell(rowNum, cIdx + 1);
      cell.value = val;
      cell.font = regularFont;
      cell.border = thinBorder;
      if (typeof val === 'number') {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        if (cIdx >= 4) {
          cell.numFmt = '#,##0 "đ"';
        }
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      }
    });
  });

  // =========================================================================
  // BROWSER DOWNLOAD TRIGGER
  // =========================================================================
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Bao-cao-thu-chi-theo-phong-${activePeriod}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
