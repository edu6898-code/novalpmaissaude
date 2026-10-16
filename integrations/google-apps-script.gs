/**
 * Optional compatible receiver for the supplied Google Apps Script webhook.
 * This file is NOT installed remotely by the LP.
 * Use a script bound to the destination spreadsheet, or set the script property
 * SPREADSHEET_ID. Deploy the web app as the owner, with access for Anyone.
 * After editing an existing deployment, publish a new version of that same
 * deployment to preserve its /exec URL. The endpoint uses ?gid=0.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var lead = JSON.parse(e.postData.contents);
    if (!lead.lead_id || !lead.nome || !lead.whatsapp || lead.consentimento_contato !== true) {
      return leadResponse_({ ok: false, error: 'Campos obrigatorios ausentes.' });
    }
    lock.waitLock(20000);
    var spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    var spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) throw new Error('Planilha nao configurada.');
    var gid = String((e.parameter && e.parameter.gid) || '0');
    var sheet = spreadsheet.getSheets().filter(function (s) { return String(s.getSheetId()) === gid; })[0];
    if (!sheet) throw new Error('Aba gid nao encontrada.');
    var columns = ['lead_id','submitted_at','nome','whatsapp','email','produto','mensagem','origem','utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','utm_source_platform','utm_creative_format','utm_marketing_tactic','gclid','gbraid','wbraid','fbclid','msclkid','ttclid','first_utm_source','first_utm_medium','first_utm_campaign','first_utm_term','first_utm_content','first_utm_id','first_utm_source_platform','first_utm_creative_format','first_utm_marketing_tactic','first_gclid','first_gbraid','first_wbraid','first_fbclid','first_msclkid','first_ttclid','landing_page','referrer','page_url','page_title','button_text','whatsapp_destination','fbp','fbc','idioma','timezone','dispositivo','user_agent','consentimento_contato','first_touch','last_touch'];
    var headers;
    if (sheet.getLastRow() === 0) {
      headers = columns;
      sheet.appendRow(headers);
    } else {
      headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(String);
      // Existing sheets are left intact: add only the missing columns.
      columns.forEach(function (column) {
        if (headers.indexOf(column) === -1) {
          headers.push(column);
          sheet.getRange(1, headers.length).setValue(column);
        }
      });
    }
    var idColumn = headers.indexOf('lead_id') + 1;
    if (sheet.getLastRow() > 1) {
      var duplicate = sheet.getRange(2, idColumn, sheet.getLastRow() - 1, 1).createTextFinder(String(lead.lead_id)).matchEntireCell(true).findNext();
      if (duplicate) return leadResponse_({ ok: true, lead_id: lead.lead_id, duplicate: true });
    }
    sheet.appendRow(headers.map(function (key) {
      var value = lead[key];
      if (value === undefined || value === null) return '';
      if (typeof value === 'object') value = JSON.stringify(value);
      if (typeof value === 'string' && /^[=+\-@\t\r]/.test(value)) value = "'" + value;
      return value;
    }));
    SpreadsheetApp.flush();
    return leadResponse_({ ok: true, lead_id: lead.lead_id });
  } catch (error) {
    // Keep personal data out of responses and logs.
    return leadResponse_({ ok: false, error: 'Nao foi possivel salvar o cadastro.' });
  } finally {
    if (lock.hasLock()) lock.releaseLock();
  }
}
function leadResponse_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
