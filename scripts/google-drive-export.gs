/**
 * Google Apps Script utility for preparing legacy import assets from Drive.
 *
 * What it does:
 * - Finds route list files and exports them as CSV
 * - Finds ND-INV-xxx docs and exports them as PDF
 * - Works recursively through nested folders
 *
 * Required services:
 * - Drive API (Advanced Google Service)
 *
 * Notes:
 * - Tracker files export the second sheet/tab, which contains the Jobs data.
 * - Route list files are exported using the first sheet/tab only.
 * - Invoice files are matched by filename, for example ND-INV-073.docx.
 */

const CONFIG = {
  SOURCE_FOLDER_ID: 'PUT_SOURCE_FOLDER_ID_HERE',
  OUTPUT_FOLDER_ID: 'PUT_OUTPUT_FOLDER_ID_HERE',
  TRACKER_NAME_REGEX: /tracker/i,
  TRACKER_EXPORT_SHEET_INDEX: 1,
  ROUTE_LIST_NAME_REGEX: /route list/i,
  ROUTE_CODE_REGEX: /W\d{2}-\d{2}-\d{3}/i,
  INVOICE_NAME_REGEX: /ND-INV-\d{3}/i,
  DELETE_TEMP_CONVERSIONS: true,
};

function exportLegacyImportAssets() {
  const sourceFolder = DriveApp.getFolderById(CONFIG.SOURCE_FOLDER_ID);
  const outputFolder = DriveApp.getFolderById(CONFIG.OUTPUT_FOLDER_ID);

  const files = [];
  collectFilesRecursive_(sourceFolder, files);

  let routeListsExported = 0;
  let invoicesExported = 0;
  const notes = [];

  for (const file of files) {
    const name = file.getName();

    if (CONFIG.TRACKER_NAME_REGEX.test(name)) {
      try {
        exportTrackerJobsAsCsv_(file, outputFolder, 'Tracker - Jobs.csv');
      } catch (error) {
        notes.push('Failed tracker export: ' + name + ' -> ' + error.message);
      }
    }

    if (CONFIG.ROUTE_LIST_NAME_REGEX.test(name)) {
      const routeCodeMatch = name.match(CONFIG.ROUTE_CODE_REGEX);
      if (!routeCodeMatch) {
        notes.push('Skipped route list (no route code): ' + name);
      } else {
        const routeCode = routeCodeMatch[0].toUpperCase();
        const outputName = routeCode + ' - Route List - Route.csv';
        try {
          exportRouteListAsCsv_(file, outputFolder, outputName);
          routeListsExported++;
        } catch (error) {
          notes.push('Failed route list export: ' + name + ' -> ' + error.message);
        }
      }
    }

    if (CONFIG.INVOICE_NAME_REGEX.test(name)) {
      const invoiceCodeMatch = name.match(CONFIG.INVOICE_NAME_REGEX);
      if (!invoiceCodeMatch) {
        notes.push('Skipped invoice (no invoice code): ' + name);
      } else {
        const invoiceCode = invoiceCodeMatch[0].toUpperCase();
        const outputName = invoiceCode + '.pdf';
        try {
          exportInvoiceAsPdf_(file, outputFolder, outputName);
          invoicesExported++;
        } catch (error) {
          notes.push('Failed invoice export: ' + name + ' -> ' + error.message);
        }
      }
    }
  }

  Logger.log('Route lists exported: ' + routeListsExported);
  Logger.log('Invoices exported as PDF: ' + invoicesExported);
  notes.forEach((note) => Logger.log(note));
}

function collectFilesRecursive_(folder, out) {
  const files = folder.getFiles();
  while (files.hasNext()) {
    out.push(files.next());
  }

  const subfolders = folder.getFolders();
  while (subfolders.hasNext()) {
    collectFilesRecursive_(subfolders.next(), out);
  }
}

function exportRouteListAsCsv_(file, outputFolder, outputName) {
  const mimeType = file.getMimeType();

  if (mimeType === MimeType.GOOGLE_SHEETS) {
    exportGoogleSheetFirstTabAsCsv_(file.getId(), outputFolder, outputName);
    return;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const tempSheetId = convertExcelToGoogleSheet_(file.getId(), 'tmp-' + file.getName());
    try {
      exportGoogleSheetFirstTabAsCsv_(tempSheetId, outputFolder, outputName);
    } finally {
      if (CONFIG.DELETE_TEMP_CONVERSIONS) {
        DriveApp.getFileById(tempSheetId).setTrashed(true);
      }
    }
    return;
  }

  if (mimeType === MimeType.CSV || /\.csv$/i.test(file.getName())) {
    outputFolder.createFile(file.getBlob().setName(outputName));
    return;
  }

  throw new Error('Unsupported route list type: ' + mimeType);
}

function exportTrackerJobsAsCsv_(file, outputFolder, outputName) {
  const mimeType = file.getMimeType();

  if (mimeType === MimeType.GOOGLE_SHEETS) {
    exportGoogleSheetTabAsCsv_(file.getId(), CONFIG.TRACKER_EXPORT_SHEET_INDEX, outputFolder, outputName);
    return;
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const tempSheetId = convertExcelToGoogleSheet_(file.getId(), 'tmp-' + file.getName());
    try {
      exportGoogleSheetTabAsCsv_(tempSheetId, CONFIG.TRACKER_EXPORT_SHEET_INDEX, outputFolder, outputName);
    } finally {
      if (CONFIG.DELETE_TEMP_CONVERSIONS) {
        DriveApp.getFileById(tempSheetId).setTrashed(true);
      }
    }
    return;
  }

  if (mimeType === MimeType.CSV || /\.csv$/i.test(file.getName())) {
    outputFolder.createFile(file.getBlob().setName(outputName));
    return;
  }

  throw new Error('Unsupported tracker type: ' + mimeType);
}

function exportInvoiceAsPdf_(file, outputFolder, outputName) {
  const mimeType = file.getMimeType();
  const sourceId = file.getId();

  if (mimeType === MimeType.GOOGLE_DOCS) {
    outputFolder.createFile(file.getAs(MimeType.PDF).setName(outputName));
    return;
  }

  const googleDocId = convertOfficeFileToGoogleDoc_(sourceId, 'tmp-' + file.getName());
  try {
    const googleDocFile = DriveApp.getFileById(googleDocId);
    outputFolder.createFile(googleDocFile.getAs(MimeType.PDF).setName(outputName));
  } finally {
    if (CONFIG.DELETE_TEMP_CONVERSIONS) {
      DriveApp.getFileById(googleDocId).setTrashed(true);
    }
  }
}

function exportGoogleSheetFirstTabAsCsv_(sheetFileId, outputFolder, outputName) {
  exportGoogleSheetTabAsCsv_(sheetFileId, 0, outputFolder, outputName);
}

function exportGoogleSheetTabAsCsv_(sheetFileId, sheetIndex, outputFolder, outputName) {
  const spreadsheet = SpreadsheetApp.openById(sheetFileId);
  const sheets = spreadsheet.getSheets();
  if (sheetIndex < 0 || sheetIndex >= sheets.length) {
    throw new Error('Sheet index out of range: ' + sheetIndex);
  }

  const selectedSheet = sheets[sheetIndex];
  const gid = selectedSheet.getSheetId();

  const url =
    'https://docs.google.com/spreadsheets/d/' +
    sheetFileId +
    '/export?format=csv&gid=' +
    gid;

  const token = ScriptApp.getOAuthToken();
  const response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error('CSV export failed. HTTP ' + response.getResponseCode());
  }

  outputFolder.createFile(response.getBlob().setName(outputName));
}

function convertExcelToGoogleSheet_(excelFileId, tempName) {
  const blob = DriveApp.getFileById(excelFileId).getBlob();
  const resource = {
    title: tempName,
    mimeType: MimeType.GOOGLE_SHEETS,
  };

  return Drive.Files.insert(resource, blob, { convert: true }).id;
}

function convertOfficeFileToGoogleDoc_(fileId, tempName) {
  const blob = DriveApp.getFileById(fileId).getBlob();
  const resource = {
    title: tempName,
    mimeType: MimeType.GOOGLE_DOCS,
  };

  return Drive.Files.insert(resource, blob, { convert: true }).id;
}
